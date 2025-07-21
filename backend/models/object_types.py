from pydantic import BaseModel
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from models.database.db_models import DeploymentType
from typing import Self
from dataclasses import dataclass

class AgentNode:
    current_agent: object 
    next_agent: Self | None = None

    def __init__(self, agent: object):
        self.current_agent = agent

class AgentNodeList:
    front: AgentNode | None = None
    back: AgentNode | None = None
    count: int = 0

    def append(self, agent: AgentNode):
        if self.front is None:
            self.front = agent
            self.back = agent
            self.count += 1
        else:
            self.back.next_agent = agent
            self.back = agent
            self.count += 1
    
    def pop(self):
        if self.front is None:
            return None
        else:
            agent = self.front
            self.front = self.front.next_agent
            if (self.count == 1):
                self.back = None
            self.count -= 1
            return agent

class DeploymentRequest(BaseModel):
    workflow_name: str
    workflow_id: int
    workflow_data: Dict[str, Any]
    type: DeploymentType = DeploymentType.CHAT
    grade: Optional[Tuple[int, int]] = None

class DeploymentResponse(BaseModel):
    deployment_id: str
    chat_url: str
    message: str
    configuration: Dict[str, Any]
    type: DeploymentType = DeploymentType.CHAT
    grade: Optional[Tuple[int, int]] = None

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

@dataclass
class TestCase:
    id: int
    parameters: List[Any]
    expected_output: Any
