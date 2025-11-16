from fastapi import Depends, HTTPException, status
from sqlmodel import Session as DBSession, select
from typing import List, Dict, Any, Tuple, Optional
import uuid
import os
from datetime import datetime, timezone

# Database and models
from models.database.db_models import (
    User, Document, Workflow, ChatConversation, ChatMessage, Deployment, 
    AuthSession, ClassRole, DeploymentType, MCQSession, MCQAnswer,
    Problem, TestCase, Submission, SubmissionStatus, UserProblemState,
    DeploymentProblemLink, StudentDeploymentGrade, ClassMembership,
    PromptSession, PromptSubmission, VideoSession
)
from database.database import get_session, engine
from api.auth import get_current_user

# Permission helpers
from scripts.permission_helpers import (
    user_can_modify_workflow, user_can_access_workflow, user_can_modify_deployment,
    user_can_access_deployment, user_has_role_in_class, user_can_create_resources,
    get_accessible_deployments
)

# Deployment models
from models.object_types import (
    DeploymentRequest, DeploymentRenameRequest, DeploymentUpdateConfigRequest, DeploymentResponse, ChatRequest, ChatResponse,
    ConversationCreateRequest, ConversationResponse, MessageResponse
)

# Deployment services
from services.deployment_manager import (
    load_deployment_on_demand, get_active_deployment, add_active_deployment,
    remove_active_deployment, is_deployment_active
)
from services.deployment_service import AgentDeployment
from services.page_service import PageDeployment
from services.config_service import parse_agent_config

# Helper utilities
from scripts.deployment_helpers import (
    _extract_sid_from_websocket,
    _send_error_and_close,
    _authenticate_websocket_user,
    _save_chat_to_db,
    _load_deployment_for_user,
)

# Export all functions for import *
__all__ = [
    # Database and auth dependencies
    "get_session", "get_current_user",
    
    # Models
    "User", "Document", "Workflow", "ChatConversation", "ChatMessage", "Deployment",
    "AuthSession", "ClassRole", "DeploymentType", "MCQSession", "MCQAnswer",
    "Problem", "TestCase", "Submission", "SubmissionStatus", "UserProblemState",
    "DeploymentProblemLink", "StudentDeploymentGrade", "ClassMembership",
    "PromptSession", "PromptSubmission", "VideoSession",
    
    # Request/Response models
    "DeploymentRequest", "DeploymentRenameRequest", "DeploymentUpdateConfigRequest", "DeploymentResponse", "ChatRequest", "ChatResponse",
    "ConversationCreateRequest", "ConversationResponse", "MessageResponse",
    
    # Permission helpers
    "user_can_modify_workflow", "user_can_access_workflow", "user_can_modify_deployment",
    "user_can_access_deployment", "user_has_role_in_class", "user_can_create_resources",
    "get_accessible_deployments",
    
    # Deployment services
    "load_deployment_on_demand", "get_active_deployment", "add_active_deployment",
    "remove_active_deployment", "is_deployment_active", "AgentDeployment", "PageDeployment", "parse_agent_config",
    
    # Helper utilities (including private functions)
    "_extract_sid_from_websocket", "_send_error_and_close", "_authenticate_websocket_user",
    "_save_chat_to_db", "_load_deployment_for_user",
    
    # Common functions
    "get_deployment_and_check_access", "ensure_deployment_loaded", 
    "validate_deployment_type", "check_deployment_open",
    
    # Other imports
    "HTTPException", "status", "DBSession", "select", "List", "Dict", "Any", "Tuple", "Optional",
    "uuid", "os", "datetime", "timezone", "engine"
]

# Common dependency functions
async def get_deployment_and_check_access(
    deployment_id: str,
    current_user: User,
    db: DBSession,
    require_instructor: bool = False
) -> Deployment:
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,
        )
    ).first()

    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if require_instructor:
        if not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors can perform this action"
            )
    else:
        if not user_can_access_deployment(current_user, db_deployment, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You must be a member of this class to access this deployment.",
            )

    return db_deployment

async def ensure_deployment_loaded(deployment_id: str, user_id: int, db: DBSession) -> Dict[str, Any]:
    """
    Ensure that a deployment is loaded in memory and return it.
    
    Args:
        deployment_id: ID of the deployment to load
        user_id: ID of the user requesting the deployment
        db: Database session
        
    Returns:
        Dictionary containing the deployment info
        
    Raises:
        HTTPException: If deployment is not found or cannot be loaded
    """
    from services.pages_manager import load_page_deployment_on_demand, get_active_page_deployment
    
    # First check if deployment is already loaded
    deployment_info = get_active_deployment(deployment_id)
    if deployment_info:
        # Check if this is a page-based deployment that needs database session
        if deployment_info.get("is_page_based") and "page_deployment" in deployment_info:
            page_deployment = deployment_info["page_deployment"]
            if hasattr(page_deployment, 'set_db_session'):
                page_deployment.set_db_session(db)
        return deployment_info
    
    # Check if this is a page-based deployment
    parent_deployment_id = deployment_id
    if "_page_" in deployment_id:
        parent_deployment_id = deployment_id.split("_page_")[0]
        
        # Try to load the page deployment
        if await load_page_deployment_on_demand(parent_deployment_id, user_id, db):
            # Set database session on the page deployment for data access
            page_deployment_info = get_active_page_deployment(parent_deployment_id)
            if page_deployment_info and "page_deployment" in page_deployment_info:
                page_deployment = page_deployment_info["page_deployment"]
                page_deployment.set_db_session(db)
            
            # Now check if the specific deployment is available
            deployment_info = get_active_deployment(deployment_id)
            if deployment_info:
                return deployment_info
    
    # If page loading failed, try regular deployment loading
    if await load_deployment_on_demand(deployment_id, user_id, db):
        deployment_info = get_active_deployment(deployment_id)
        if deployment_info:
            return deployment_info
    
    # If we get here, deployment couldn't be loaded
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Deployment not found or access denied"
    )

def validate_deployment_type(deployment: Deployment, expected_type: DeploymentType):
    if deployment.type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deployment is not of {expected_type.value} type",
        )

def check_deployment_open(deployment: Deployment):
    if not deployment.is_open:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Deployment is currently closed",
        ) 
