import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column, UniqueConstraint
from typing import List, Optional


class MCQSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    deployment_id: int = Field(foreign_key="deployment.id")
    question_indices: List[int] = Field(sa_column=Column(JSON))  # List of question indices for this session
    started_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    completed_at: dt.datetime | None = None
    score: int | None = None  # Number of correct answers
    total_questions: int  # Total number of questions in this session
    is_active: bool = True
    
    # Relationships
    user: Optional["User"] = Relationship()
    deployment: Optional["Deployment"] = Relationship()
    answers: List["MCQAnswer"] = Relationship(back_populates="session", sa_relationship_kwargs={"cascade": "all, delete"})
    
    __table_args__ = (
        UniqueConstraint("user_id", "deployment_id", name="unique_user_mcq_session"),
    )


class MCQAnswer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="mcqsession.id")
    question_index: int  # Index of the question in the deployment's question list
    selected_answer: str  # The answer selected by the student
    is_correct: bool
    answered_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    
    # Relationships
    session: Optional[MCQSession] = Relationship(back_populates="answers")
    
    __table_args__ = (
        UniqueConstraint("session_id", "question_index", name="unique_session_question_answer"),
    ) 
