import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column, UniqueConstraint
from typing import List, Optional, Dict, Any
from ..enums import DeploymentType


class PageDeploymentState(SQLModel, table=True):
    """Stores runtime state for page-based deployments"""
    id: int | None = Field(default=None, primary_key=True)
    deployment_id: str = Field(index=True, unique=True)  # Main page deployment ID
    pages_accessible: int = Field(default=-1)  # Number of pages accessible to students (-1 = all)
    
    # Store additional deployment state as JSON if needed
    state_data: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    variables: List["PageDeploymentVariable"] = Relationship(back_populates="page_deployment", sa_relationship_kwargs={"cascade": "all, delete"})
    behavior_executions: List["BehaviorExecutionHistory"] = Relationship(back_populates="page_deployment", sa_relationship_kwargs={"cascade": "all, delete"})


class PageDeploymentVariable(SQLModel, table=True):
    """Stores variables for page-based deployments"""
    id: int | None = Field(default=None, primary_key=True)
    page_deployment_id: int = Field(foreign_key="pagedeploymentstate.id")
    
    name: str = Field(index=True)
    variable_type: str  # "text" or "group"
    variable_value: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))  # Store any JSON-serializable data
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    page_deployment: Optional["PageDeploymentState"] = Relationship(back_populates="variables")
    
    __table_args__ = (
        UniqueConstraint("page_deployment_id", "name", name="unique_page_variable"),
    )


class BehaviorExecutionHistory(SQLModel, table=True):
    """Tracks behavior execution history for page-based deployments"""
    id: int | None = Field(default=None, primary_key=True)
    page_deployment_id: int = Field(foreign_key="pagedeploymentstate.id")
    execution_id: str = Field(index=True, unique=True)  # UUID for this execution
    
    behavior_number: str = Field(index=True)
    behavior_type: str  # "group", etc.
    
    # Execution details
    executed_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    executed_by_user_id: int = Field(foreign_key="user.id")
    
    # Results
    success: bool = Field(default=False)
    execution_time_seconds: float | None = None
    input_student_count: int | None = None
    output_groups_created: int | None = None
    output_themes_created: int | None = None  # Number of themes created
    variable_written: str | None = None  # Variable name that was written to
    error_message: str | None = None
    
    # Store full execution result as JSON
    execution_result: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Relationships
    page_deployment: Optional["PageDeploymentState"] = Relationship(back_populates="behavior_executions")
    executed_by: Optional["User"] = Relationship()  # type: ignore 
