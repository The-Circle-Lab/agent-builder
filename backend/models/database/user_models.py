import uuid
import datetime as dt
from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = True
    is_global_instructor: bool = False  # Global instructor flag for bootstrapping
    
    # Authentication relationships
    auth_sessions: List["AuthSession"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Class relationships
    class_memberships: List["ClassMembership"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Workflow relationships
    created_workflows: List["Workflow"] = Relationship(back_populates="created_by")
    
    # Problem relationships
    created_problems: List["Problem"] = Relationship(back_populates="created_by")
    problem_states: List["UserProblemState"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    submissions: List["Submission"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Document relationships
    uploaded_documents: List["Document"] = Relationship(back_populates="uploaded_by")
    
    # Chat relationships
    chat_conversations: List["ChatConversation"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Deployment relationships
    deployments: List["Deployment"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})


class AuthSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    expires_at: dt.datetime
    user: Optional[User] = Relationship(back_populates="auth_sessions") 
