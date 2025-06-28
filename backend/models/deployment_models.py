from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime

class DeploymentRequest(BaseModel):
    workflow_name: str
    workflow_id: int
    workflow_data: Dict[str, Any]

class DeploymentResponse(BaseModel):
    deployment_id: str
    chat_url: str
    message: str
    configuration: Dict[str, Any]

class ChatRequest(BaseModel):
    message: str
    history: List[List[str]] = []
    conversation_id: Optional[int] = None  # Optional conversation ID to save to

class ChatResponse(BaseModel):
    response: str
    sources: List[str] = []
    conversation_id: Optional[int] = None  # Return conversation ID if saved

class ConversationCreateRequest(BaseModel):
    title: Optional[str] = None

class ConversationResponse(BaseModel):
    id: int
    deployment_id: str
    title: str
    workflow_name: str
    created_at: datetime
    updated_at: datetime
    message_count: int

class MessageResponse(BaseModel):
    id: int
    message_text: str
    is_user_message: bool
    sources: Optional[List[str]]
    created_at: datetime 
