import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from typing import Optional


class StudentDeploymentGrade(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    deployment_id: int = Field(foreign_key="deployment.id")
    grading_method: str  # 'problem_correct' or 'test_cases_correct'
    points_earned: int
    total_points: int
    calculated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    # Relationships
    user: Optional["User"] = Relationship()
    deployment: Optional["Deployment"] = Relationship()

    __table_args__ = (
        UniqueConstraint("user_id", "deployment_id", "grading_method", name="unique_student_deployment_grade"),
    ) 
