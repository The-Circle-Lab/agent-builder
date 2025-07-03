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
    is_global_instructor: bool = False  # Global instructor flag for bootstrapping
    auth_sessions: List["AuthSession"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Class relationships
    class_memberships: List["ClassMembership"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    
    # Workflow relationships
    created_workflows: List["Workflow"] = Relationship(back_populates="created_by")
    
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


class Class(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # String code for users to join
    name: str = Field(index=True)
    description: str | None = None
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    memberships: List["ClassMembership"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})
    workflows: List["Workflow"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})
    deployments: List["Deployment"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})


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
    class_id: int = Field(foreign_key="class.id")  # Now required - all workflows must belong to a class
    created_by_id: int = Field(foreign_key="user.id")
    
    # Unique collection ID for document isolation
    workflow_collection_id: str = Field(index=True, unique=True, default_factory=lambda: f"wf_{uuid.uuid4().hex[:12]}")
    
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
    documents: List["Document"] = Relationship(back_populates="workflow")
    deployments: List["Deployment"] = Relationship(back_populates="workflow")


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
    
    # Workflow association
    workflow_id: int | None = Field(default=None, foreign_key="workflow.id")
    workflow: Optional["Workflow"] = Relationship(back_populates="documents")
    
    # User relationship
    uploaded_by_id: int = Field(foreign_key="user.id")
    uploaded_by: Optional[User] = Relationship()
    
    # Metadata
    uploaded_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Optional metadata
    doc_metadata: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


class ChatConversation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    deployment_id: str = Field(index=True)  # Reference to the deployment UUID
    user_id: int = Field(foreign_key="user.id")
    title: str = Field(default="New Conversation")  # Auto-generated or user-defined title
    workflow_name: str  # Store workflow name for reference
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="chat_conversations")
    messages: List["ChatMessage"] = Relationship(back_populates="conversation", sa_relationship_kwargs={"cascade": "all, delete"})


class ChatMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="chatconversation.id")
    message_text: str
    is_user_message: bool  # True for user messages, False for assistant responses
    sources: List[str] | None = Field(default=None, sa_column=Column(JSON))  # Sources for assistant messages
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    
    # Relationships
    conversation: Optional[ChatConversation] = Relationship(back_populates="messages")


class Deployment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    deployment_id: str = Field(index=True, unique=True)  # UUID for the deployment
    user_id: int = Field(foreign_key="user.id")
    workflow_id: int = Field(foreign_key="workflow.id")
    class_id: int = Field(foreign_key="class.id")  # Direct class relationship for access control
    workflow_name: str = Field(index=True)
    collection_name: str | None = Field(default=None, index=True)  # Collection name for MCP
    
    # Store the deployment configuration as JSON
    config: Dict[str, Any] = Field(sa_column=Column(JSON))
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="deployments")
    workflow: Optional["Workflow"] = Relationship(back_populates="deployments")
    class_: Optional["Class"] = Relationship(back_populates="deployments")


