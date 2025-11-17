import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from typing import List, Optional
from ..enums import ClassRole


class Class(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # String code for users to join
    name: str = Field(index=True)
    description: str | None = None
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    memberships: List["ClassMembership"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})
    workflows: List["Workflow"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})
    deployments: List["Deployment"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})
    problems: List["Problem"] = Relationship(back_populates="class_", sa_relationship_kwargs={"cascade": "all, delete"})


class ClassMembership(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    class_id: int = Field(foreign_key="class.id")
    user_id: int = Field(foreign_key="user.id")
    role: ClassRole = Field(default=ClassRole.STUDENT)
    joined_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    class_: Optional["Class"] = Relationship(back_populates="memberships")
    user: Optional["User"] = Relationship(back_populates="class_memberships")
    
    # Ensure unique user-class combination
    __table_args__ = (
        UniqueConstraint("class_id", "user_id", name="unique_class_user"),
    ) 


class AutoEnrollClass(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    class_id: int = Field(foreign_key="class.id", unique=True)
    created_by_user_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True

    class_: Optional["Class"] = Relationship(sa_relationship_kwargs={"lazy": "joined"})
