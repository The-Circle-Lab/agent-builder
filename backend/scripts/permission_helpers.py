from sqlmodel import Session as DBSession, select
from models.database.db_models import User, Class, ClassMembership, Workflow, Deployment, ClassRole
from typing import List, Optional

# Check if user has specific role in a given class
def user_has_role_in_class(user: User, class_id: int, role: ClassRole, db: DBSession) -> bool:
    membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.class_id == class_id,
            ClassMembership.role == role,
            ClassMembership.is_active == True
        )
    ).first()
    return membership is not None


# Check if user is an instructor in any class (replaces old current_user.student check)
def user_is_instructor(user: User, db: DBSession) -> bool:
    # Check if user is a global instructor (for bootstrapping new users)
    if user.is_global_instructor:
        return True
    
    # Check if user has instructor role in any class
    membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.role == ClassRole.INSTRUCTOR,
            ClassMembership.is_active == True
        )
    ).first()
    return membership is not None


# Check if user can create classes (instructor or if no classes exist yet for system bootstrap)
def user_can_create_classes(user: User, db: DBSession) -> bool:
    # Check if user is already an instructor
    if user_is_instructor(user, db):
        return True
    
    # Fallback: If no classes exist in the system, allow anyone to create the first class
    existing_classes = db.exec(
        select(Class).where(Class.is_active == True)
    ).first()
    
    return existing_classes is None


# Check if user is a student (no instructor roles anywhere)
def user_is_student_only(user: User, db: DBSession) -> bool:
    return not user_is_instructor(user, db)


# Check if user is an instructor in the specific class that owns the workflow
def user_can_modify_workflow(user: User, workflow: Workflow, db: DBSession) -> bool:
    return user_has_role_in_class(user, workflow.class_id, ClassRole.INSTRUCTOR, db)


# Check if user can access workflow (instructor in class or student if workflow is public)
def user_can_access_workflow(user: User, workflow: Workflow, db: DBSession) -> bool:
    # Instructors can always access workflows in their classes
    if user_has_role_in_class(user, workflow.class_id, ClassRole.INSTRUCTOR, db):
        return True
    
    # Students can only access public workflows in their classes
    if workflow.is_public and user_has_role_in_class(user, workflow.class_id, ClassRole.STUDENT, db):
        return True
    
    return False


# Check if user can modify deployment (instructor in the class that owns the deployment)
def user_can_modify_deployment(user: User, deployment: Deployment, db: DBSession) -> bool:
    return user_has_role_in_class(user, deployment.class_id, ClassRole.INSTRUCTOR, db)


# Check if user can access deployment (member of the class)
def user_can_access_deployment(user: User, deployment: Deployment, db: DBSession) -> bool:
    # Check if user is a member (student or instructor) of the deployment's class
    membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.class_id == deployment.class_id,
            ClassMembership.is_active == True
        )
    ).first()
    return membership is not None


# Get all classes where user has specific role
def get_user_classes_with_role(user: User, role: ClassRole, db: DBSession) -> List[Class]:
    memberships = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.role == role,
            ClassMembership.is_active == True
        )
    ).all()
    
    class_ids = [membership.class_id for membership in memberships]
    if not class_ids:
        return []
    
    classes = db.exec(
        select(Class).where(
            Class.id.in_(class_ids),
            Class.is_active == True
        )
    ).all()
    
    return list(classes)


# Get all classes where user is a member (any role)
def get_user_classes(user: User, db: DBSession) -> List[Class]:
    memberships = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.is_active == True
        )
    ).all()
    
    class_ids = [membership.class_id for membership in memberships]
    if not class_ids:
        return []
    
    classes = db.exec(
        select(Class).where(
            Class.id.in_(class_ids),
            Class.is_active == True
        )
    ).all()
    
    return list(classes)


# Get user's role in a specific class
def get_user_role_in_class(user: User, class_id: int, db: DBSession) -> Optional[ClassRole]:
    membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.class_id == class_id,
            ClassMembership.is_active == True
        )
    ).first()
    
    return membership.role if membership else None


# Check if user can create workflows/deployments (must be instructor in at least one class)
def user_can_create_resources(user: User, db: DBSession) -> bool:
    return user_is_instructor(user, db)


# Get workflows accessible to user (created by them or public in their classes)
def get_accessible_workflows(user: User, db: DBSession) -> List[Workflow]:
    user_classes = get_user_classes(user, db)
    class_ids = [cls.id for cls in user_classes]
    
    if not class_ids:
        return []
    
    # Get workflows from user's classes
    workflows = db.exec(
        select(Workflow).where(
            Workflow.class_id.in_(class_ids),
            Workflow.is_active == True
        )
    ).all()
    
    # Filter based on user permissions
    accessible_workflows = []
    for workflow in workflows:
        if user_can_access_workflow(user, workflow, db):
            accessible_workflows.append(workflow)
    
    return accessible_workflows


# Get deployments accessible to user (in their classes)
def get_accessible_deployments(user: User, db: DBSession) -> List[Deployment]:
    user_classes = get_user_classes(user, db)
    class_ids = [cls.id for cls in user_classes]
    
    if not class_ids:
        return []
    
    deployments = db.exec(
        select(Deployment).where(
            Deployment.class_id.in_(class_ids),
            Deployment.is_active == True
        )
    ).all()
    
    return list(deployments) 
