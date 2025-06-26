from fastapi import APIRouter, Depends, HTTPException, Response, status, Cookie
from passlib.context import CryptContext
from datetime import timedelta, datetime as dt, timezone
from pydantic import BaseModel
from sqlmodel import select, Session as DBSession
from database.db_models import User, AuthSession
from database.database import get_session

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
SESSION_LIFETIME = timedelta(hours=24)

def verify_pw(raw, hashed): return pwd_ctx.verify(raw, hashed)
def hash_pw(raw): return pwd_ctx.hash(raw)

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    student: bool = True


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
    response.set_cookie("sid", session.id, max_age=int(SESSION_LIFETIME.total_seconds()),
                        httponly=True, secure=False, samesite="lax")
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
    existing_user = db.exec(select(User).where(User.email == request.email)).first()
    if existing_user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    
    hashed_password = hash_pw(request.password)
    user = User(email=request.email, hashed_password=hashed_password, student=request.student)
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    session = AuthSession(user_id=user.id,
                      expires_at=dt.now(timezone.utc) + SESSION_LIFETIME)
    db.add(session)
    db.commit()
    
    response = Response(status_code=status.HTTP_201_CREATED)
    response.set_cookie("sid", session.id, max_age=int(SESSION_LIFETIME.total_seconds()),
                        httponly=True, secure=False, samesite="lax")
    return response
