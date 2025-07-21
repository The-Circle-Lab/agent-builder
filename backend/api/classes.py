from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, Session as DBSession
from models.database.db_models import User, Class, ClassMembership, ClassRole
from database.database import get_session
from api.auth import get_current_user
from scripts.permission_helpers import (
    user_is_instructor, user_has_role_in_class, get_user_classes_with_role, user_can_create_classes
)
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import secrets
import string

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

# Generate a random join code
def generate_join_code(length: int = 8) -> str:
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))

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
