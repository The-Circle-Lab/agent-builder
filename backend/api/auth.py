from fastapi import APIRouter, Depends, HTTPException, Response, status, Cookie
from passlib.context import CryptContext
from datetime import timedelta, datetime as dt, timezone
from pydantic import BaseModel
from datetime import date
from sqlmodel import select, Session as DBSession
from models.database.db_models import User, AuthSession
from database.database import get_session
import sys
from pathlib import Path

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
SESSION_LIFETIME = timedelta(hours=config.get("auth", {}).get("session_lifetime_hours", 24))

def verify_pw(raw, hashed): return pwd_ctx.verify(raw, hashed)
def hash_pw(raw): return pwd_ctx.hash(raw)

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    key: str | None = None  # Optional since only required for instructors
    is_instructor: bool = False  # Changed from student to is_instructor for clarity


class UpdateProfileRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    about_me: str | None = None
    birthday: date | None = None


class ChangePasswordRequest(BaseModel):
    user_id: int
    new_password: str
    class_id: int


def get_current_user(sid: str | None = Cookie(None),
                     db: DBSession = Depends(get_session)):
    if not sid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing session")
    
    sess = db.get(AuthSession, sid)
    if not sess:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    
    if sess.expires_at.replace(tzinfo=timezone.utc) < dt.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Expired session")
    
    user = db.get(User, sess.user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    
    return user


@router.post("/login")
def login(request: LoginRequest, db: DBSession = Depends(get_session)):
    user = db.exec(select(User).where(User.email == request.email)).first()
    if not user or not verify_pw(request.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad credentials")
    session = AuthSession(user_id=user.id,
                      expires_at=dt.now(timezone.utc) + SESSION_LIFETIME)
    db.add(session); db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    cookie_settings = config.get("auth", {}).get("cookie_settings", {})
    response.set_cookie(
        "sid", 
        session.id, 
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=cookie_settings.get("httponly", True),
        secure=cookie_settings.get("secure", False),
        samesite=cookie_settings.get("samesite", "lax")
    )
    return response


@router.post("/logout")
def logout(current = Depends(get_current_user), db: DBSession = Depends(get_session),
           sid: str | None = Cookie(None)):
    if sid:
        session_to_delete = db.get(AuthSession, sid)
        if session_to_delete:
            db.delete(session_to_delete)
            db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/register")
def register(request: RegisterRequest, db: DBSession = Depends(get_session)):
    # Validate registration key only for instructors
    if request.is_instructor:
        expected_key = config.get("auth", {}).get("registration_key")
        if not expected_key:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Registration key not configured")
        
        if not request.key or request.key != expected_key:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid registration key")
    
    existing_user = db.exec(select(User).where(User.email == request.email)).first()
    if existing_user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    
    hashed_password = hash_pw(request.password)
    user = User(
        email=request.email, 
        hashed_password=hashed_password,
        is_global_instructor=request.is_instructor
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    session = AuthSession(user_id=user.id,
                      expires_at=dt.now(timezone.utc) + SESSION_LIFETIME)
    db.add(session)
    db.commit()
    
    response = Response(status_code=status.HTTP_201_CREATED)
    cookie_settings = config.get("auth", {}).get("cookie_settings", {})
    response.set_cookie(
        "sid", 
        session.id, 
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=cookie_settings.get("httponly", True),
        secure=cookie_settings.get("secure", False),
        samesite=cookie_settings.get("samesite", "lax")
    )
    return response


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    from scripts.permission_helpers import user_is_student_only
    
    is_student = user_is_student_only(current_user, db)
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "student": is_student,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "about_me": current_user.about_me,
        "birthday": current_user.birthday,
    }


@router.patch("/profile")
def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    if request.first_name is not None:
        current_user.first_name = request.first_name.strip() if request.first_name.strip() else None
    if request.last_name is not None:
        current_user.last_name = request.last_name.strip() if request.last_name.strip() else None
    if request.about_me is not None:
        current_user.about_me = request.about_me.strip() if request.about_me.strip() else None
    if request.birthday is not None:
        current_user.birthday = request.birthday if request.birthday else None

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "about_me": current_user.about_me,
        "birthday": current_user.birthday,
    }


@router.post("/change-password")
def change_user_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    from scripts.permission_helpers import user_has_role_in_class
    from models.database.db_models import ClassRole, ClassMembership
    
    # Check if current user is an instructor in the specified class
    if not user_has_role_in_class(current_user, request.class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can change passwords in their classes"
        )
    
    # Get the target user
    target_user = db.get(User, request.user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if target user is a member of the same class
    target_membership = db.exec(
        select(ClassMembership).where(
            ClassMembership.user_id == request.user_id,
            ClassMembership.class_id == request.class_id,
            ClassMembership.is_active == True
        )
    ).first()
    
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this class"
        )
    
    # Check if target user is NOT an instructor (instructors cannot have their passwords changed)
    if target_membership.role == ClassRole.INSTRUCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change password of another instructor"
        )
    
    # Change the password
    target_user.hashed_password = hash_pw(request.new_password)
    db.add(target_user)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)
