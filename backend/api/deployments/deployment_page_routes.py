from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .deployment_shared import *
from services.deployment_manager import load_deployment_on_demand

router = APIRouter()

class PageInfo(BaseModel):
    page_number: int
    deployment_id: str
    deployment_type: str
    has_chat: bool

class PageListResponse(BaseModel):
    main_deployment_id: str
    page_count: int
    pages: List[PageInfo]

@router.get("/{deployment_id}/pages", response_model=PageListResponse)
async def get_deployment_pages(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get information about all pages in a page-based deployment"""
    
    # Validate deployment access
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the deployment from memory, try to load on-demand if not found
    deployment_info = get_active_deployment(deployment_id)
    if not deployment_info:
        # Try to load the deployment on-demand
        if not await load_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_deployment(deployment_id)
    
    if not deployment_info.get("is_page_based", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get page deployment from memory
    page_deployment = deployment_info["mcp_deployment"]
    
    # Build page information
    pages = []
    for idx, page_deploy in enumerate(page_deployment.get_deployment_list()):
        pages.append(PageInfo(
            page_number=idx + 1,
            deployment_id=page_deploy.deployment_id,
            deployment_type=page_deploy.get_deployment_type().value,
            has_chat=page_deploy.get_contains_chat()
        ))
    
    return PageListResponse(
        main_deployment_id=deployment_id,
        page_count=page_deployment.get_page_count(),
        pages=pages
    )

@router.get("/{deployment_id}/pages/{page_number}", response_model=Dict[str, Any])
async def get_page_deployment(
    deployment_id: str,
    page_number: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get specific page deployment information"""
    
    # Validate deployment access
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the deployment from memory
    deployment_info = get_active_deployment(deployment_id)
    if not deployment_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not active in memory"
        )
    
    page_deployment = deployment_info["mcp_deployment"]
    
    # Validate page number
    if page_number < 1 or page_number > page_deployment.get_page_count():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Page {page_number} not found. Available pages: 1-{page_deployment.get_page_count()}"
        )
    
    # Get specific page deployment
    page_deploy = page_deployment.get_deployment_by_index(page_number - 1)
    
    return {
        "page_number": page_number,
        "deployment_id": page_deploy.deployment_id,
        "deployment_type": page_deploy.get_deployment_type().value,
        "has_chat": page_deploy.get_contains_chat(),
        "chat_url": f"/chat/{page_deploy.deployment_id}",
        "parent_deployment_id": deployment_id
    }

class PageChatRequest(BaseModel):
    message: str
    page_number: int
    history: List[List[str]] = []
    conversation_id: Optional[int] = None

@router.post("/{deployment_id}/pages/chat", response_model=ChatResponse)
async def chat_with_page(
    deployment_id: str,
    request: PageChatRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    
    # Validate deployment access
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the deployment from memory, try to load on-demand if not found
    deployment_info = get_active_deployment(deployment_id)
    if not deployment_info:
        # Try to load the deployment on-demand
        if not await load_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_deployment(deployment_id)
    
    page_deployment = deployment_info["mcp_deployment"]
    
    # Validate page number
    if request.page_number < 1 or request.page_number > page_deployment.get_page_count():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Page {request.page_number} not found. Available pages: 1-{page_deployment.get_page_count()}"
        )
    
    # Get specific page deployment
    page_deploy = page_deployment.get_deployment_by_index(request.page_number - 1)
    
    if not page_deploy.get_contains_chat():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Page {request.page_number} does not support chat functionality"
        )
    
    # Forward to regular chat with page deployment ID
    chat_request = ChatRequest(
        message=request.message,
        history=request.history,
        conversation_id=request.conversation_id
    )
    
    # Use the page deployment's specific ID for the chat
    page_deployment_info = get_active_deployment(page_deploy.deployment_id)
    if not page_deployment_info:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Page deployment not found in memory"
        )
    
    # For now, redirect to the regular chat endpoint for the specific page
    # This avoids complex service access issues
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Page-specific chat is not yet implemented. Use the regular chat endpoint for individual pages."
    ) 
