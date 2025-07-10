import uuid, datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from sqlalchemy import UniqueConstraint
from typing import List, Optional, Dict, Any
from enum import Enum

class ClassRole(str, Enum):
    STUDENT = "student"
    INSTRUCTOR = "instructor"


class SubmissionStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"


class DeploymentType(str, Enum):
    CHAT = "chat"
    CODE = "code"


class DeploymentProblemLink(SQLModel, table=True):
    deployment_id: int | None = Field(default=None, foreign_key="deployment.id", primary_key=True)
    problem_id: int | None = Field(default=None, foreign_key="problem.id", primary_key=True)

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
    problems: List["Problem"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})


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
    documents: List["Document"] = Relationship(back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete"})
    deployments: List["Deployment"] = Relationship(back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete"})


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
    storage_path: str | None = Field(default=None, index=True)  # Path to stored file on disk
    
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

    type: DeploymentType = Field(default=DeploymentType.CHAT, index=True)
    
    # Store the deployment configuration as JSON
    config: Dict[str, Any] = Field(sa_column=Column(JSON))
    
    # Track documents used for RAG in this deployment
    rag_document_ids: List[int] | None = Field(default=None, sa_column=Column(JSON))  # Document IDs used for RAG
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="deployments")
    workflow: Optional["Workflow"] = Relationship(back_populates="deployments")
    class_: Optional["Class"] = Relationship(back_populates="deployments")

    # For CODE deployments
    problems: List["Problem"] = Relationship(back_populates="deployments", link_model=DeploymentProblemLink)


class Problem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    description: str
    starter_code: str | None = None
    constraints: List[str] | None = Field(default=None, sa_column=Column(JSON))
    class_id: int = Field(foreign_key="class.id")
    created_by_id: int = Field(foreign_key="user.id")
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    # Relationships
    class_: Optional["Class"] = Relationship(back_populates="problems")
    created_by: Optional[User] = Relationship(back_populates="created_problems")
    test_cases: List["TestCase"] = Relationship(back_populates="problem", sa_relationship_kwargs={"cascade": "all, delete"})
    submissions: List["Submission"] = Relationship(back_populates="problem")
    user_problem_states: List["UserProblemState"] = Relationship(back_populates="problem")
    deployments: List["Deployment"] = Relationship(back_populates="problems", link_model=DeploymentProblemLink)


class TestCase(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    problem_id: int = Field(foreign_key="problem.id")
    input: List[Any] = Field(sa_column=Column(JSON))
    expected_output: str

    # Relationships
    problem: "Problem" = Relationship(back_populates="test_cases")


class UserProblemState(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    problem_id: int = Field(foreign_key="problem.id")
    current_code: str

    # Relationships
    user: Optional[User] = Relationship(back_populates="problem_states")
    problem: Optional["Problem"] = Relationship(back_populates="user_problem_states")

    __table_args__ = (
        UniqueConstraint("user_id", "problem_id", name="unique_user_problem"),
    )


class Submission(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    problem_id: int = Field(foreign_key="problem.id")
    code: str
    status: SubmissionStatus = Field(default=SubmissionStatus.QUEUED)
    execution_time: float | None = None  # in seconds
    error: str | None = None
    submitted_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    analysis: str | None = None

    # Relationships
    user: Optional[User] = Relationship(back_populates="submissions")
    problem: "Problem" = Relationship(back_populates="submissions")


