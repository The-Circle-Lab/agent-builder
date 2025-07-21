import uuid
import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from typing import List, Optional, Dict, Any


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
    created_by: Optional["User"] = Relationship(back_populates="created_workflows")
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
    uploaded_by: Optional["User"] = Relationship()
    
    # Metadata
    uploaded_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Optional metadata
    doc_metadata: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON)) 
