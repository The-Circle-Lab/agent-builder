import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from models.database.db_models import User, Deployment


class VideoSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    deployment_id: int = Field(foreign_key="deployment.id")
    video_id: str  # The ID of the video that was watched
    started_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    completed_at: dt.datetime | None = None
    is_active: bool = True
    
    # Relationships
    user: Optional["User"] = Relationship()
    deployment: Optional["Deployment"] = Relationship()
    
    __table_args__ = (
        UniqueConstraint("user_id", "deployment_id", name="unique_user_video_session"),
    )
