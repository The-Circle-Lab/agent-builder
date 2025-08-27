import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column, UniqueConstraint
from typing import List, Optional, Dict, Any


class LivePresentationSession(SQLModel, table=True):
    """Stores live presentation session state"""
    id: int | None = Field(default=None, primary_key=True)
    deployment_id: str = Field(index=True, unique=True)  # Live presentation deployment ID
    
    # Session configuration
    title: str = Field(default="Live Presentation")
    description: str = Field(default="")
    
    # Session state
    session_active: bool = Field(default=False)
    presentation_active: bool = Field(default=False)
    ready_check_active: bool = Field(default=False)
    
    # Current prompt data
    current_prompt: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Input variable data (e.g., group assignments)
    input_variable_data: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Saved prompts configuration
    saved_prompts: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    student_connections: List["LivePresentationStudentConnection"] = Relationship(
        back_populates="session", 
        sa_relationship_kwargs={"cascade": "all, delete"}
    )
    student_responses: List["LivePresentationResponse"] = Relationship(
        back_populates="session", 
        sa_relationship_kwargs={"cascade": "all, delete"}
    )


class LivePresentationStudentConnection(SQLModel, table=True):
    """Stores student connection info for live presentations"""
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="livepresentationsession.id")
    
    # Student info
    user_id: str = Field(index=True)
    user_name: str
    
    # Connection state
    status: str = Field(default="connected")  # connected, ready, disconnected
    is_ready: bool = Field(default=False)
    
    # Group information if available
    group_info: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Assigned list items for prompts (prompt_id -> list_item)
    assigned_list_items: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    
    # Connection timestamps
    connected_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    last_activity: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    disconnected_at: dt.datetime | None = None
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    session: Optional["LivePresentationSession"] = Relationship(back_populates="student_connections")
    responses: List["LivePresentationResponse"] = Relationship(
        back_populates="student_connection", 
        sa_relationship_kwargs={"cascade": "all, delete"}
    )
    
    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="unique_session_user"),
    )


class LivePresentationResponse(SQLModel, table=True):
    """Stores student responses during live presentations"""
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="livepresentationsession.id")
    student_connection_id: int = Field(foreign_key="livepresentationstudentconnection.id")
    
    # Response data
    prompt_id: str = Field(index=True)
    response_text: str
    response_data: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Timestamps
    submitted_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    session: Optional["LivePresentationSession"] = Relationship(back_populates="student_responses")
    student_connection: Optional["LivePresentationStudentConnection"] = Relationship(back_populates="responses")


class LivePresentationPrompt(SQLModel, table=True):
    """Stores prompt history for live presentations"""
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="livepresentationsession.id")
    
    # Prompt data
    prompt_id: str = Field(index=True)
    statement: str
    has_input: bool = Field(default=False)
    input_type: str = Field(default="textarea")
    input_placeholder: str = Field(default="")
    use_random_list_item: bool = Field(default=False)
    list_variable_id: str | None = None
    
    # Prompt metadata
    sent_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    prompt_data: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    
    # Metadata
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships - Note: no back_populates since LivePresentationSession doesn't have prompts relationship
    # This is just for storing prompt history
