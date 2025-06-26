import uuid, datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from sqlalchemy import UniqueConstraint
from typing import List, Optional, Dict, Any
from enum import Enum

class ClassRole(str, Enum):
    STUDENT = "student"
    INSTRUCTOR = "instructor"

class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = True
    student: bool = True
    auth_sessions: List["AuthSession"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Class relationships
    created_classes: List["Class"] = Relationship(back_populates="admin")
    class_memberships: List["ClassMembership"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Workflow relationships
    created_workflows: List["Workflow"] = Relationship(back_populates="created_by")
    
    # Document relationships
    uploaded_documents: List["Document"] = Relationship(back_populates="uploaded_by")


class AuthSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    expires_at: dt.datetime
    user: Optional[User] = Relationship(back_populates="auth_sessions")


class Class(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # String code for users to join
    name: str = Field(index=True)
    description: str | None = None
    admin_id: int = Field(foreign_key="user.id")  # Admin/creator of the class
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    admin: Optional[User] = Relationship(back_populates="created_classes")
    memberships: List["ClassMembership"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})
    workflows: List["Workflow"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})


class ClassMembership(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    class_id: int = Field(foreign_key="class.id")
    user_id: int = Field(foreign_key="user.id")
    role: ClassRole = Field(default=ClassRole.STUDENT)
    joined_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    class_: Optional["Class"] = Relationship(back_populates="memberships")
    user: Optional[User] = Relationship(back_populates="class_memberships")
    
    # Ensure unique user-class combination
    __table_args__ = (
        UniqueConstraint("class_id", "user_id", name="unique_class_user"),
    )


class Workflow(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str | None = None
    class_id: int | None = Field(default=None, foreign_key="class.id")
    created_by_id: int = Field(foreign_key="user.id")
    
    # Store the workflow JSON data from frontend
    workflow_data: Dict[str, Any] = Field(sa_column=Column(JSON))
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    is_public: bool = False  # Whether students can see this workflow
    
    # Relationships
    class_: Optional["Class"] = Relationship(back_populates="workflows")
    created_by: Optional[User] = Relationship(back_populates="created_workflows")


class Document(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    filename: str = Field(index=True)
    original_filename: str  # Store original filename for display
    file_size: int  # File size in bytes
    file_type: str  # PDF, DOCX, etc.
    collection_name: str = Field(index=True)  # Collection name in Qdrant
    user_collection_name: str = Field(index=True)  # Full collection name with user ID
    upload_id: str = Field(index=True, unique=True)  # UUID for this upload
    chunk_count: int  # Number of chunks created from this document
    
    # User relationship
    uploaded_by_id: int = Field(foreign_key="user.id")
    uploaded_by: Optional[User] = Relationship()
    
    # Metadata
    uploaded_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Optional metadata
    doc_metadata: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


