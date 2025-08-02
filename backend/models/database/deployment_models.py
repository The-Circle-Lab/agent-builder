import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from typing import List, Optional, Dict, Any, Tuple
from ..enums import DeploymentType


class DeploymentProblemLink(SQLModel, table=True):
    deployment_id: int | None = Field(default=None, foreign_key="deployment.id", primary_key=True)
    problem_id: int | None = Field(default=None, foreign_key="problem.id", primary_key=True)


class Deployment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    deployment_id: str = Field(index=True, unique=True)  # UUID for the deployment
    user_id: int = Field(foreign_key="user.id")
    workflow_id: int = Field(foreign_key="workflow.id")
    class_id: int = Field(foreign_key="class.id")  # Direct class relationship for access control
    workflow_name: str = Field(index=True)
    collection_name: str | None = Field(default=None, index=True)  # Collection name for MCP

    type: DeploymentType = Field(default=DeploymentType.CHAT, index=True)
    
    # Page-based deployment fields
    is_page_based: bool = Field(default=False, index=True)  # Whether this deployment uses pages
    parent_deployment_id: str | None = Field(default=None, index=True)  # Main deployment ID for page deployments
    page_number: int | None = Field(default=None, index=True)  # Page number for page deployments
    total_pages: int | None = Field(default=None)  # Total number of pages for main deployment
    
    # Store the deployment configuration as JSON
    config: Dict[str, Any] = Field(sa_column=Column(JSON))
    
    # Track documents used for RAG in this deployment
    rag_document_ids: List[int] | None = Field(default=None, sa_column=Column(JSON))  # Document IDs used for RAG

    solve_rate: float | None = None
    attempts: int | None = None     
    avg_tests_passed: float | None = None
    grade: Tuple[int, int] | None = Field(default=None, sa_column=Column(JSON))  # (points_earned, total_points)  
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    is_open: bool = Field(default=True)  # Whether deployment is open for student access
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="deployments")
    workflow: Optional["Workflow"] = Relationship(back_populates="deployments")
    class_: Optional["Class"] = Relationship(back_populates="deployments")

    # For CODE deployments
    problems: List["Problem"] = Relationship(back_populates="deployments", link_model=DeploymentProblemLink) 
