from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, Session as DBSession
from models.database.db_models import User, Class, ClassMembership, ClassRole, AutoEnrollClass
from models.database.db_models import User, Class, ClassMembership, ClassRole, AutoEnrollClass
from database.database import get_session
from api.auth import get_current_user
from scripts.permission_helpers import (
    user_is_instructor, user_has_role_in_class, get_user_classes_with_role, user_can_create_classes,
    user_is_auto_enroll_admin
)
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import secrets
import string
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

config = load_config()
auto_enroll_settings = config.get("auto_enroll", {})
AUTO_ENROLL_ADMIN_EMAILS = set(auto_enroll_settings.get("admin_emails", []))
AUTO_ENROLL_ENABLED = auto_enroll_settings.get("enabled", False)

router = APIRouter(prefix="/api/classes", tags=["classes"])

class ClassCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None

class ClassJoinRequest(BaseModel):
    join_code: str

class ClassResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    created_at: datetime
    is_active: bool
    user_role: ClassRole
    member_count: int

class JoinCodeResponse(BaseModel):
    class_id: int
    class_name: str
    join_code: str

class KickMemberRequest(BaseModel):
    user_id: int


class AutoEnrollUpdateRequest(BaseModel):
    class_ids: List[int]


class AutoEnrollClassSummary(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    created_at: datetime
    is_active: bool
    member_count: int


class AutoEnrollOption(BaseModel):
    class_info: AutoEnrollClassSummary
    selected: bool


class ClassAdminSummary(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    is_active: bool
    member_count: int


class AutoEnrollConfigResponse(BaseModel):
    selected_class_ids: List[int]
    classes: List[ClassAdminSummary]


def _ensure_auto_enroll_enabled():
    if not AUTO_ENROLL_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auto-enroll configuration is not available"
        )


def _require_auto_enroll_admin(user: User):
    if user.email not in AUTO_ENROLL_ADMIN_EMAILS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to manage auto-enroll classes"
        )


def _get_class_member_count(class_id: int, db: DBSession) -> int:
    members = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.is_active == True
        )
    ).all()
    return len(members)


def _build_auto_enroll_options(db: DBSession) -> List[AutoEnrollOption]:
    auto_entries = db.exec(
        select(AutoEnrollClass).where(AutoEnrollClass.is_active == True)
    ).all()
    auto_ids = {entry.class_id for entry in auto_entries}
    classes = db.exec(
        select(Class).where(Class.is_active == True)
    ).all()

    options: List[AutoEnrollOption] = []
    for class_obj in classes:
        member_count = _get_class_member_count(class_obj.id, db)
        options.append(
            AutoEnrollOption(
                class_info=AutoEnrollClassSummary(
                    id=class_obj.id,
                    code=class_obj.code,
                    name=class_obj.name,
                    description=class_obj.description,
                    created_at=class_obj.created_at,
                    is_active=class_obj.is_active,
                    member_count=member_count
                ),
                selected=class_obj.id in auto_ids
            )
        )

    return options


# Generate a random join code
def generate_join_code(length: int = 8) -> str:
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))


def _count_active_members(class_id: int, db: DBSession) -> int:
    members = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.is_active == True
        )
    ).all()
    return len(members)


def _build_auto_enroll_config(db: DBSession) -> AutoEnrollConfigResponse:
    classes = db.exec(
        select(Class).where(
            Class.is_active == True
        )
    ).all()

    selected_entries = db.exec(select(AutoEnrollClass)).all()
    selected_ids = [entry.class_id for entry in selected_entries]

    summaries = [
        ClassAdminSummary(
            id=cls.id,
            code=cls.code,
            name=cls.name,
            description=cls.description,
            is_active=cls.is_active,
            member_count=_count_active_members(cls.id, db)
        )
        for cls in classes
    ]

    return AutoEnrollConfigResponse(
        selected_class_ids=selected_ids,
        classes=summaries
    )


@router.get("/auto-enroll/config", response_model=AutoEnrollConfigResponse)
def get_auto_enroll_config(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    if not user_is_auto_enroll_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved admins can manage auto-enroll classes"
        )
    return _build_auto_enroll_config(db)


@router.put("/auto-enroll/config", response_model=AutoEnrollConfigResponse)
def update_auto_enroll_config(
    request: AutoEnrollUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    if not user_is_auto_enroll_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved admins can manage auto-enroll classes"
        )

    unique_ids = list(dict.fromkeys(request.class_ids))
    if unique_ids:
        valid_classes = db.exec(
            select(Class).where(
                Class.id.in_(unique_ids),
                Class.is_active == True
            )
        ).all()
        valid_ids = {cls.id for cls in valid_classes}
        invalid_ids = sorted(set(unique_ids) - valid_ids)
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid or inactive class ids: {invalid_ids}"
            )

    existing_entries = db.exec(select(AutoEnrollClass)).all()
    existing_map = {entry.class_id: entry for entry in existing_entries}
    target_ids = set(unique_ids)

    for class_id, entry in existing_map.items():
        if class_id not in target_ids:
            db.delete(entry)

    for class_id in target_ids:
        if class_id not in existing_map:
            db.add(AutoEnrollClass(class_id=class_id, created_by_user_id=current_user.id))

    db.commit()

    return _build_auto_enroll_config(db)


@router.get("/auto-enroll", response_model=List[AutoEnrollOption])
def get_auto_enroll_configuration(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    _ensure_auto_enroll_enabled()
    _require_auto_enroll_admin(current_user)
    return _build_auto_enroll_options(db)


@router.put("/auto-enroll", response_model=List[AutoEnrollOption])
def update_auto_enroll_configuration(
    request: AutoEnrollUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    _ensure_auto_enroll_enabled()
    _require_auto_enroll_admin(current_user)

    requested_ids = set(request.class_ids)

    if requested_ids:
        valid_classes = db.exec(
            select(Class).where(
                Class.id.in_(list(requested_ids)),
                Class.is_active == True
            )
        ).all()
        valid_ids = {cls.id for cls in valid_classes}
        invalid_ids = requested_ids - valid_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Classes not found or inactive: {sorted(invalid_ids)}"
            )

    existing_entries = db.exec(select(AutoEnrollClass)).all()
    existing_ids = {entry.class_id for entry in existing_entries}

    for entry in existing_entries:
        if entry.class_id not in requested_ids:
            db.delete(entry)
        else:
            entry.is_active = True
            entry.updated_at = datetime.now(timezone.utc)
            db.add(entry)

    for class_id in requested_ids:
        if class_id not in existing_ids:
            db.add(AutoEnrollClass(class_id=class_id, created_by_user_id=current_user.id))

    db.commit()

    return _build_auto_enroll_options(db)

# Create a new class (instructors only)
@router.post("/", response_model=ClassResponse)
def create_class(
    request: ClassCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if user can create classes (instructor, global instructor, or empty system)
    if not user_can_create_classes(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can create classes"
        )
    
    # Generate unique join code
    join_code = generate_join_code()
    while db.exec(select(Class).where(Class.code == join_code)).first():
        join_code = generate_join_code()
    
    # Create the class
    class_obj = Class(
        code=join_code,
        name=request.name,
        description=request.description
    )
    
    db.add(class_obj)
    db.commit()
    db.refresh(class_obj)
    
    # Add creator as instructor
    membership = ClassMembership(
        class_id=class_obj.id,
        user_id=current_user.id,
        role=ClassRole.INSTRUCTOR
    )
    
    db.add(membership)
    db.commit()
    
    return ClassResponse(
        id=class_obj.id,
        code=class_obj.code,
        name=class_obj.name,
        description=class_obj.description,
        created_at=class_obj.created_at,
        is_active=class_obj.is_active,
        user_role=ClassRole.INSTRUCTOR,
        member_count=1
    )

# Join a class using join code (students and instructors)
@router.post("/join", response_model=ClassResponse)
def join_class(
    request: ClassJoinRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Find class by join code
    class_obj = db.exec(
        select(Class).where(
            Class.code == request.join_code.upper(),
            Class.is_active == True
        )
    ).first()
    
    if not class_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid join code"
        )
    
    # Check if user is already a member
    existing_membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_obj.id,
            ClassMembership.user_id == current_user.id,
            ClassMembership.is_active == True
        )
    ).first()
    
    if existing_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this class"
        )
    
    # Determine role - if user is instructor elsewhere, make them instructor, otherwise student
    role = ClassRole.INSTRUCTOR if user_is_instructor(current_user, db) else ClassRole.STUDENT
    
    # Create membership
    membership = ClassMembership(
        class_id=class_obj.id,
        user_id=current_user.id,
        role=role
    )
    
    db.add(membership)
    db.commit()
    
    # Count members
    member_count = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_obj.id,
            ClassMembership.is_active == True
        )
    ).all()
    
    return ClassResponse(
        id=class_obj.id,
        code=class_obj.code,
        name=class_obj.name,
        description=class_obj.description,
        created_at=class_obj.created_at,
        is_active=class_obj.is_active,
        user_role=role,
        member_count=len(member_count)
    )

# Get join code for a class (instructors only)
@router.get("/{class_id}/join-code", response_model=JoinCodeResponse)
def get_join_code(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if class exists
    class_obj = db.get(Class, class_id)
    if not class_obj or not class_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found"
        )
    
    # Check if user is instructor in this class
    if not user_has_role_in_class(current_user, class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can access the join code"
        )
    
    return JoinCodeResponse(
        class_id=class_obj.id,
        class_name=class_obj.name,
        join_code=class_obj.code
    )

# Leave a class (students and instructors)
@router.delete("/{class_id}/leave")
def leave_class(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if class exists
    class_obj = db.get(Class, class_id)
    if not class_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found"
        )
    
    # Find user's membership
    membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.user_id == current_user.id,
            ClassMembership.is_active == True
        )
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are not a member of this class"
        )
    
    # Check if this is the last instructor
    instructor_count = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.role == ClassRole.INSTRUCTOR,
            ClassMembership.is_active == True
        )
    ).all()
    
    if membership.role == ClassRole.INSTRUCTOR and len(instructor_count) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot leave class as the last instructor. Delete the class instead or add another instructor."
        )
    
    # Soft delete membership
    membership.is_active = False
    db.add(membership)
    db.commit()
    
    return {
        "message": f"Successfully left class '{class_obj.name}'",
        "class_id": class_id,
        "class_name": class_obj.name
    }

# Delete a class (instructors only)
@router.delete("/{class_id}")
def delete_class(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if class exists
    class_obj = db.get(Class, class_id)
    if not class_obj or not class_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found"
        )
    
    # Check if user is instructor in this class
    if not user_has_role_in_class(current_user, class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can delete classes"
        )
    
    # Count members and workflows that will be affected
    members = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.is_active == True
        )
    ).all()
    
    # Soft delete the class (cascade will handle memberships, workflows, deployments)
    class_obj.is_active = False
    db.add(class_obj)
    db.commit()
    
    return {
        "message": f"Class '{class_obj.name}' deleted successfully",
        "class_id": class_id,
        "class_name": class_obj.name,
        "members_removed": len(members)
    }

# Get user's classes
@router.get("/", response_model=List[ClassResponse])
def get_user_classes(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get all active memberships for user
    memberships = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == current_user.id,
            ClassMembership.is_active == True
        )
    ).all()
    
    if not memberships:
        return []
    
    classes = []
    for membership in memberships:
        class_obj = db.get(Class, membership.class_id)
        if class_obj and class_obj.is_active:
            # Count members
            member_count = db.exec(
                select(ClassMembership).where(
                    ClassMembership.class_id == class_obj.id,
                    ClassMembership.is_active == True
                )
            ).all()
            
            classes.append(ClassResponse(
                id=class_obj.id,
                code=class_obj.code,
                name=class_obj.name,
                description=class_obj.description,
                created_at=class_obj.created_at,
                is_active=class_obj.is_active,
                user_role=membership.role,
                member_count=len(member_count)
            ))
    
    return classes

# Get class details (members only)
@router.get("/{class_id}", response_model=ClassResponse)
def get_class_details(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if class exists
    class_obj = db.get(Class, class_id)
    if not class_obj or not class_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found"
        )
    
    # Check if user is a member
    membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.user_id == current_user.id,
            ClassMembership.is_active == True
        )
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You are not a member of this class."
        )
    
    # Count members
    member_count = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.is_active == True
        )
    ).all()
    
    return ClassResponse(
        id=class_obj.id,
        code=class_obj.code,
        name=class_obj.name,
        description=class_obj.description,
        created_at=class_obj.created_at,
        is_active=class_obj.is_active,
        user_role=membership.role,
        member_count=len(member_count)
    )

# Kick out a member from the class (instructors only)
@router.post("/{class_id}/kick-member")
def kick_class_member(
    class_id: int,
    request: KickMemberRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if class exists
    class_obj = db.get(Class, class_id)
    if not class_obj or not class_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found"
        )
    
    # Check if current user is an instructor in this class
    if not user_has_role_in_class(current_user, class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can remove members from the class"
        )
    
    # Get the target user's membership
    target_membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.user_id == request.user_id,
            ClassMembership.is_active == True
        )
    ).first()
    
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this class"
        )
    
    # Check if target user is an instructor (instructors cannot be kicked out)
    if target_membership.role == ClassRole.INSTRUCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove an instructor from the class"
        )
    
    # Prevent kicking out yourself (though this should be caught by the instructor check)
    if request.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself from the class"
        )
    
    # Get target user for response
    target_user = db.get(User, request.user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Remove the member (soft delete)
    target_membership.is_active = False
    db.add(target_membership)
    db.commit()
    
    return {
        "message": f"Successfully removed {target_user.email} from class '{class_obj.name}'",
        "removed_user_email": target_user.email,
        "class_id": class_id,
        "class_name": class_obj.name
    }


# Get class members
@router.get("/{class_id}/members")
def get_class_members(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Check if class exists
    class_obj = db.get(Class, class_id)
    if not class_obj or not class_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found"
        )
    
    # Check if user is a member
    user_membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.user_id == current_user.id,
            ClassMembership.is_active == True
        )
    ).first()
    
    if not user_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You are not a member of this class."
        )
    
    # Get all active members
    memberships = db.exec(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.is_active == True
        )
    ).all()
    
    # Build member list with user info
    members = []
    for membership in memberships:
        user = db.get(User, membership.user_id)
        if user:
            members.append({
                "id": user.id,
                "email": user.email,
                "role": membership.role,
                "joined_at": membership.joined_at.isoformat()
            })
    
    return {"members": members}
