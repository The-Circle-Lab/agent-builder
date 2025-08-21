from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime, timezone


class GroupAssignment(SQLModel, table=True):
    """
    Represents a group assignment result from a behavior execution.
    Links to BehaviorExecutionHistory.
    """
    __tablename__ = "group_assignments"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    execution_id: str = Field(index=True)  # Links to BehaviorExecutionHistory.execution_id
    page_deployment_id: int = Field(foreign_key="pagedeploymentstate.id", index=True)
    
    # Assignment metadata
    total_students: int
    total_groups: int
    group_size_target: int
    grouping_method: str  # homogeneous, diverse, mixed
    includes_explanations: bool = Field(default=False)
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    groups: List["Group"] = Relationship(back_populates="assignment")


class Group(SQLModel, table=True):
    """
    Represents an individual group within a group assignment.
    """
    __tablename__ = "groups"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="group_assignments.id", index=True)
    
    # Group information
    group_name: str  # e.g., "Group1", "Group2"
    group_number: int  # 1, 2, 3, etc.
    explanation: Optional[str] = Field(default=None, max_length=2000)
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    assignment: GroupAssignment = Relationship(back_populates="groups")
    members: List["GroupMember"] = Relationship(back_populates="group")


class GroupMember(SQLModel, table=True):
    """
    Represents a student member within a group.
    """
    __tablename__ = "group_members"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="groups.id", index=True)
    
    # Student information
    student_name: str  # Usually email address
    student_text: Optional[str] = Field(default=None, max_length=5000)  # Original submission text
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    group: Group = Relationship(back_populates="members")
