from sqlmodel import (
    SQLModel,
    Field,
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    ForeignKey,
)
from typing import Optional
from datetime import datetime


class VideoProgress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    deployment_id: str
    watched_seconds: int = 0
    total_seconds: int = 0
    completed: bool = False
    last_updated: datetime = Field(default_factory=datetime.utcnow)
