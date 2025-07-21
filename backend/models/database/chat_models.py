import datetime as dt
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from typing import List, Optional


class ChatConversation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    deployment_id: str = Field(index=True)  # Reference to the deployment UUID
    user_id: int = Field(foreign_key="user.id")
    title: str = Field(default="New Conversation")  # Auto-generated or user-defined title
    workflow_name: str  # Store workflow name for reference
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    is_active: bool = True
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="chat_conversations")
    messages: List["ChatMessage"] = Relationship(back_populates="conversation", sa_relationship_kwargs={"cascade": "all, delete"})


class ChatMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="chatconversation.id")
    message_text: str
    is_user_message: bool  # True for user messages, False for assistant responses
    sources: List[str] | None = Field(default=None, sa_column=Column(JSON))  # Sources for assistant messages
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    
    # Relationships
    conversation: Optional[ChatConversation] = Relationship(back_populates="messages") 
