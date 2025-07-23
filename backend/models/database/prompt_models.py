import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column, UniqueConstraint
from typing import List, Optional, Dict, Any


class PromptSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    deployment_id: int = Field(foreign_key="deployment.id")
    started_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    completed_at: dt.datetime | None = None
    is_active: bool = True
    
    # Store the main prompt question from the first node
    main_question: str
    
    # Store submission requirements configuration
    submission_requirements: List[Dict[str, Any]] = Field(sa_column=Column(JSON))  # List of submission prompts with mediaType
    
    # Relationships
    user: Optional["User"] = Relationship()
    deployment: Optional["Deployment"] = Relationship()
    submissions: List["PromptSubmission"] = Relationship(back_populates="session", sa_relationship_kwargs={"cascade": "all, delete"})
    
    __table_args__ = (
        UniqueConstraint("user_id", "deployment_id", name="unique_user_prompt_session"),
    )


class PromptSubmission(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="promptsession.id")
    submission_index: int  # Index of the submission requirement (0, 1, 2, etc.)
    prompt_text: str  # The specific prompt/question for this submission
    media_type: str  # "textarea" or "hyperlink"
    user_response: str  # The user's actual submission/response
    submitted_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    
    # Relationships
    session: Optional[PromptSession] = Relationship(back_populates="submissions")
    
    __table_args__ = (
        UniqueConstraint("session_id", "submission_index", name="unique_session_submission_index"),
    ) 
