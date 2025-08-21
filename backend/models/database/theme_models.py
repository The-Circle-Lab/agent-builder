from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime, timezone


class ThemeAssignment(SQLModel, table=True):
    """
    Represents a theme assignment result from a behavior execution.
    Links to BehaviorExecutionHistory.
    """
    __tablename__ = "theme_assignments"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    execution_id: str = Field(index=True)  # Links to BehaviorExecutionHistory.execution_id
    page_deployment_id: int = Field(foreign_key="pagedeploymentstate.id", index=True)
    
    # Assignment metadata
    total_students: int
    total_themes: int
    num_themes_target: int
    clustering_method: str = Field(default="kmeans")  # kmeans, hierarchical, etc.
    includes_llm_polish: bool = Field(default=False)
    llm_polish_prompt: Optional[str] = Field(default=None, max_length=1000)
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    themes: List["Theme"] = Relationship(back_populates="assignment")


class Theme(SQLModel, table=True):
    """
    Represents an individual theme within a theme assignment.
    """
    __tablename__ = "themes"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="theme_assignments.id", index=True)
    
    # Theme information
    title: str  # e.g., "Health Misinformation", "AI Ethics"
    description: Optional[str] = Field(default=None, max_length=1000)
    cluster_id: int  # 0, 1, 2, etc. from clustering algorithm
    document_count: int = Field(default=0)  # Number of student responses in this theme
    student_count: int = Field(default=0)  # Number of students contributing to this theme
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    assignment: ThemeAssignment = Relationship(back_populates="themes")
    keywords: List["ThemeKeyword"] = Relationship(back_populates="theme")
    snippets: List["ThemeSnippet"] = Relationship(back_populates="theme")
    student_associations: List["ThemeStudentAssociation"] = Relationship(back_populates="theme")


class ThemeKeyword(SQLModel, table=True):
    """
    Represents a keyword associated with a theme.
    """
    __tablename__ = "theme_keywords"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    theme_id: int = Field(foreign_key="themes.id", index=True)
    
    # Keyword information
    keyword: str  # e.g., "misinformation", "vaccine", "health"
    tfidf_score: Optional[float] = Field(default=None)  # TF-IDF score for ranking
    order_index: int = Field(default=0)  # Order of importance (0 = most important)
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    theme: Theme = Relationship(back_populates="keywords")


class ThemeSnippet(SQLModel, table=True):
    """
    Represents a representative text snippet for a theme.
    """
    __tablename__ = "theme_snippets"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    theme_id: int = Field(foreign_key="themes.id", index=True)
    
    # Snippet information
    text: str = Field(max_length=500)  # Representative text snippet
    source_type: str = Field(default="text")  # "text", "pdf", "combined"
    order_index: int = Field(default=0)  # Order of importance (0 = most representative)
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    theme: Theme = Relationship(back_populates="snippets")


class ThemeStudentAssociation(SQLModel, table=True):
    """
    Associates students with themes they contributed to.
    """
    __tablename__ = "theme_student_associations"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    theme_id: int = Field(foreign_key="themes.id", index=True)
    
    # Student information
    student_name: str  # Usually email address
    student_text: Optional[str] = Field(default=None, max_length=5000)  # Original submission text
    contribution_weight: Optional[float] = Field(default=1.0)  # How much this student contributed to the theme
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    
    # Relationships
    theme: Theme = Relationship(back_populates="student_associations")
