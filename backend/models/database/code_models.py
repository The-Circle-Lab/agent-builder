import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column, UniqueConstraint
from typing import List, Optional, Any
from ..enums import SubmissionStatus
from .deployment_models import DeploymentProblemLink


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
    created_by: Optional["User"] = Relationship(back_populates="created_problems")
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
    user: Optional["User"] = Relationship(back_populates="problem_states")
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
    tests_passed: int | None = None  # number of tests passed in this submission
    submitted_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    analysis: str | None = None

    # Relationships
    user: Optional["User"] = Relationship(back_populates="submissions")
    problem: "Problem" = Relationship(back_populates="submissions") 
