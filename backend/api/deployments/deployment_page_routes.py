from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from .deployment_shared import *
from services.deployment_manager import load_deployment_on_demand
from services.pages_manager import (
    load_page_deployment_on_demand,
    get_active_page_deployment,
    get_behavior_execution_history,
    set_pages_accessible
)
from services.celery_tasks import execute_behavior_task, check_task_status

router = APIRouter()

class PageInfo(BaseModel):
    page_number: int
    deployment_id: str
    student_access_id: str  # The actual deployment ID students should use
    deployment_type: str
    has_chat: bool
    is_accessible: bool
    accessibility_reason: Optional[str] = None

class PageListResponse(BaseModel):
    main_deployment_id: str
    page_count: int
    pages_accessible: int
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
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
    
    if not deployment_info.get("is_page_based", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get page deployment from memory
    page_deployment = deployment_info["page_deployment"]
    
    # Build page information
    pages = []
    for idx, page_deploy in enumerate(page_deployment.get_deployment_list()):
        page_number = idx + 1
        is_accessible = page_deployment.is_page_accessible(page_number)
        
        # Determine accessibility reason if not accessible
        accessibility_reason = None
        if not is_accessible:
            # Check if it's due to instructor restriction
            if page_deployment.pages_accessible != -1 and page_number > page_deployment.pages_accessible:
                accessibility_reason = f"Page {page_number} is not yet accessible. You'll need to wait until your instructor allows access to this page. Currently accessible pages: 1-{page_deployment.pages_accessible}"
            else:
                # Check if it's due to variable dependency
                page = page_deployment.get_page_list()[idx]
                if page.is_input_from_variable() and page.input_id:
                    variable = page_deployment.get_variable_by_name(page.input_id)
                    if variable and variable.is_empty():
                        accessibility_reason = f"Page {page_number} is not yet accessible. This page depends on the variable '{page.input_id}' which has not been populated yet."
                
                if not accessibility_reason:
                    accessibility_reason = f"Page {page_number} is not yet accessible."
        
        pages.append(PageInfo(
            page_number=page_number,
            deployment_id=page_deploy.deployment_id,
            student_access_id=page_deploy.deployment_id,  # This is the ID students should use
            deployment_type=page_deploy.get_deployment_type().value,
            has_chat=page_deploy.get_contains_chat(),
            is_accessible=is_accessible,
            accessibility_reason=accessibility_reason
        ))
    
    return PageListResponse(
        main_deployment_id=deployment_id,
        page_count=page_deployment.get_page_count(),
        pages_accessible=page_deployment.pages_accessible,
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
    
    # Get the page deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not active in memory"
            )

    page_deployment = deployment_info["page_deployment"]
    
    # Validate page number
    if page_number < 1 or page_number > page_deployment.get_page_count():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Page {page_number} not found. Available pages: 1-{page_deployment.get_page_count()}"
        )
    
    # Check if page is accessible
    if not page_deployment.is_page_accessible(page_number):
        # Determine the specific reason for inaccessibility
        if page_deployment.pages_accessible != -1 and page_number > page_deployment.pages_accessible:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Page {page_number} is not yet accessible. You'll need to wait until your instructor allows access to this page. Currently accessible pages: 1-{page_deployment.pages_accessible}"
            )
        else:
            # Check if it's due to variable dependency
            page = page_deployment.get_page_list()[page_number - 1]
            if page.is_input_from_variable() and page.input_id:
                variable = page_deployment.get_variable_by_name(page.input_id)
                if variable and variable.is_empty():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Page {page_number} is not yet accessible. This page depends on the variable '{page.input_id}' which has not been populated yet."
                    )
            
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Page {page_number} is not yet accessible."
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

class BehaviorTriggerRequest(BaseModel):
    behavior_number: str
    async_execution: Optional[bool] = True  # Default to async execution

class BehaviorExecutionResponse(BaseModel):
    behavior_number: str
    success: bool
    execution_time: Optional[str] = None
    groups: Optional[Dict[str, List[str]]] = None
    explanations: Optional[Dict[str, str]] = None
    themes: Optional[List[Dict[str, Any]]] = None  # Add support for theme creator results
    metadata: Optional[Dict[str, Any]] = None
    output_written_to_variable: Optional[str] = None
    warning: Optional[str] = None
    error: Optional[str] = None

class AsyncBehaviorExecutionResponse(BaseModel):
    behavior_number: str
    task_id: str
    status: str
    message: str
    
class TaskStatusResponse(BaseModel):
    task_id: str
    state: str
    status: str
    progress: int
    stage: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@router.post("/{deployment_id}/behaviors/trigger")
async def trigger_behavior_execution(
    deployment_id: str,
    request: BehaviorTriggerRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Trigger execution of a specific behavior for instructors.
    The behavior will automatically resolve its input sources and execute.
    Supports both synchronous and asynchronous execution.
    """
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based and does not support behaviors"
        )
    
    # Get the deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
    
    if not deployment_info.get("is_page_based", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get page deployment from memory
    page_deployment = deployment_info["page_deployment"]
    
    # Set database session for proper data retrieval
    page_deployment.set_database_session(db)
    
    # Validate behavior exists
    behavior = page_deployment.get_behavior_by_number(request.behavior_number)
    if not behavior:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Behavior {request.behavior_number} not found"
        )
    
    # Get behavior configuration for task
    behavior_config = behavior.get_behavior_deployment().get_config()
    behavior_config['behavior_type'] = behavior.get_behavior_deployment().get_behavior_type()
    
    # Check if this is a heavy operation that should run async by default
    heavy_behaviors = ['group_assignment', 'theme_creator']
    is_heavy_behavior = behavior_config.get('behavior_type') in heavy_behaviors
    
    # Use async execution if requested or if it's a heavy behavior
    use_async = request.async_execution if request.async_execution is not None else is_heavy_behavior
    
    if use_async:
        try:
            print(f"🚀 Starting async behavior execution: {request.behavior_number}")
            print(f"   Deployment: {deployment_id}")
            print(f"   Behavior type: {behavior_config.get('behavior_type')}")
            
            # Start async task
            task = execute_behavior_task.delay(
                deployment_id=deployment_id,
                behavior_number=request.behavior_number,
                executed_by_user_id=current_user.id,
                behavior_config=behavior_config
            )
            
            return AsyncBehaviorExecutionResponse(
                behavior_number=request.behavior_number,
                task_id=task.id,
                status="PENDING",
                message=f"Behavior execution started. Use task ID {task.id} to check progress."
            )
            
        except Exception as e:
            print(f"❌ Failed to start async behavior execution: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to start async behavior execution: {str(e)}"
            )
    else:
        # Synchronous execution (legacy mode)
        try:
            from datetime import datetime
            start_time = datetime.now()
            
            print(f"⚡ Starting sync behavior execution: {request.behavior_number}")
            
            # Execute behavior with resolved input and track execution
            result = page_deployment.execute_behavior_with_resolved_input(
                request.behavior_number, 
                executed_by_user_id=current_user.id
            )
            
            end_time = datetime.now()
            execution_time = str(end_time - start_time)
            
            # Format response
            response = BehaviorExecutionResponse(
                behavior_number=request.behavior_number,
                success=result.get("success", False),
                execution_time=execution_time,
                groups=result.get("groups"),
                explanations=result.get("explanations"),
                themes=result.get("themes"),  # Add theme support
                metadata=result.get("metadata"),
                output_written_to_variable=result.get("output_written_to_variable"),
                warning=result.get("warning"),
                error=result.get("error")
            )
            
            return response
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Behavior execution failed: {str(e)}"
            )

@router.get("/{deployment_id}/behaviors/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_behavior_task_status(
    deployment_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Get the status of an async behavior execution task.
    """
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based and does not support behaviors"
        )
    
    try:
        from celery.result import AsyncResult
        from services.celery_tasks import celery_app
        
        # Check task status
        result = AsyncResult(task_id, app=celery_app)
        
        if result.state == 'PENDING':
            response = TaskStatusResponse(
                task_id=task_id,
                state=result.state,
                status='Task is waiting to be processed...',
                progress=0,
                stage='pending'
            )
        elif result.state == 'PROGRESS':
            info = result.info or {}
            response = TaskStatusResponse(
                task_id=task_id,
                state=result.state,
                status=info.get('status', 'Processing...'),
                progress=info.get('progress', 0),
                stage=info.get('stage', 'processing')
            )
        elif result.state == 'SUCCESS':
            success_result = result.result or {}
            behavior_result = success_result.get('result', {})
            response = TaskStatusResponse(
                task_id=task_id,
                state=result.state,
                status='Task completed successfully',
                progress=100,
                stage='completed',
                result=behavior_result
            )
        elif result.state == 'FAILURE':
            error_info = result.info or {}
            if isinstance(error_info, dict):
                error_msg = error_info.get('error', str(error_info))
            else:
                error_msg = str(error_info)
            
            response = TaskStatusResponse(
                task_id=task_id,
                state=result.state,
                status=f"Task failed: {error_msg}",
                progress=0,
                stage='failed',
                error=error_msg
            )
        else:
            response = TaskStatusResponse(
                task_id=task_id,
                state=result.state,
                status=f'Unknown state: {result.state}',
                progress=0,
                stage='unknown'
            )
        
        return response
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task status: {str(e)}"
        )

@router.post("/{deployment_id}/behaviors/tasks/{task_id}/cancel")
async def cancel_behavior_task(
    deployment_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Cancel a running async behavior execution task.
    """
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based and does not support behaviors"
        )
    
    try:
        from services.celery_tasks import celery_app
        
        # Revoke/cancel the task
        celery_app.control.revoke(task_id, terminate=True)
        
        return {
            "message": f"Task {task_id} has been cancelled",
            "task_id": task_id,
            "cancelled": True
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel task: {str(e)}"
        )

@router.get("/{deployment_id}/behaviors", response_model=List[Dict[str, Any]])
async def get_deployment_behaviors(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get information about all behaviors in a page-based deployment"""
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the page deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not active in memory"
            )

    page_deployment = deployment_info["page_deployment"]
    page_deployment.set_database_session(db)
    
    # Build behavior information
    behaviors = []
    for behavior in page_deployment.get_behavior_list():
        behavior_info = {
            "behavior_number": behavior.behavior_number,
            "behavior_type": behavior.get_behavior_deployment().get_behavior_type(),
            "has_input": behavior.has_input(),
            "input_type": behavior.input_type,
            "input_id": behavior.input_id,
            "has_output": behavior.has_output(),
            "output_type": behavior.output_type,
            "output_id": behavior.output_id,
            "config": behavior.get_behavior_deployment().get_config(),
            "can_execute": True  # Could add more complex logic here
        }
        behaviors.append(behavior_info)
    
    return behaviors

@router.get("/{deployment_id}/variables", response_model=Dict[str, Any])
async def get_deployment_variables(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get information about all variables in a page-based deployment"""
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the page deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not active in memory"
            )

    page_deployment = deployment_info["page_deployment"]
    page_deployment.set_database_session(db)
    
    # Get variable summary (behavior variables only for admin)
    return page_deployment.get_variable_summary(behavior_variables_only=True)

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
    
    # Get the page deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
    
    page_deployment = deployment_info["page_deployment"]
    
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

class PageStatistics(BaseModel):
    page_number: int
    page_deployment_id: str  # Add the actual deployment ID for this page
    deployment_type: str
    total_students_started: int
    total_students_completed: int
    completion_rate: float
    average_time_to_complete: Optional[float] = None
    requires_variable: bool
    variable_name: Optional[str] = None
    variable_populated: bool
    is_accessible: bool
    last_activity: Optional[datetime] = None

class BehaviorExecutionHistory(BaseModel):
    execution_id: str
    behavior_number: str
    behavior_type: str
    executed_at: datetime
    executed_by: str
    success: bool
    input_student_count: int
    output_groups_created: Optional[int] = None
    variable_written: Optional[str] = None
    execution_time: str
    error_message: Optional[str] = None

class DeploymentAnalytics(BaseModel):
    deployment_id: str
    total_pages: int
    total_behaviors: int
    total_variables: int
    active_students: int
    page_statistics: List[PageStatistics]
    variable_summary: Dict[str, Any]
    behavior_history: List[BehaviorExecutionHistory]
    last_updated: datetime

@router.get("/{deployment_id}/analytics", response_model=DeploymentAnalytics)
async def get_deployment_analytics(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get comprehensive analytics for a page-based deployment (instructor only)"""
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the page deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not active in memory"
            )
    
    page_deployment = deployment_info["page_deployment"]
    page_deployment.set_database_session(db)
    
    # Get page statistics
    page_stats = []
    for idx, page in enumerate(page_deployment.get_page_list()):
        page_number = idx + 1
        
        # Get statistics for this page
        stats = await _get_page_statistics(page, page_deployment, db)
        page_stats.append(PageStatistics(
            page_number=page_number,
            page_deployment_id=page.get_agent_deployment().deployment_id,
            deployment_type=page.get_agent_deployment().get_deployment_type().value,
            total_students_started=stats.get("started", 0),
            total_students_completed=stats.get("completed", 0),
            completion_rate=stats.get("completion_rate", 0.0),
            average_time_to_complete=stats.get("avg_time", None),
            requires_variable=page.is_input_from_variable(),
            variable_name=page.input_id if page.is_input_from_variable() else None,
            variable_populated=not page_deployment.get_variable_by_name(page.input_id).is_empty() if page.is_input_from_variable() and page.input_id else True,
            is_accessible=page_deployment.is_page_accessible(page_number),
            last_activity=stats.get("last_activity")
        ))
    
    # Get variable summary (behavior variables only for admin analytics)
    variable_summary = page_deployment.get_variable_summary(behavior_variables_only=True)
    
    # Get behavior execution history (mock for now - would need to implement proper tracking)
    behavior_history = []  # TODO: Implement behavior execution tracking
    
    # Calculate active students
    active_students = await _get_active_student_count(deployment_id, db)
    
    return DeploymentAnalytics(
        deployment_id=deployment_id,
        total_pages=page_deployment.get_page_count(),
        total_behaviors=page_deployment.get_behavior_count(),
        total_variables=len(page_deployment.get_deployment_variables()),
        active_students=active_students,
        page_statistics=page_stats,
        variable_summary=variable_summary,
        behavior_history=behavior_history,
        last_updated=datetime.now(timezone.utc)
    )

async def _get_page_statistics(page, page_deployment, db_session) -> Dict[str, Any]:
    """Get statistics for a specific page"""
    try:
        page_deployment_id = page.get_agent_deployment().deployment_id
        deployment_type = page.get_agent_deployment().get_deployment_type()
        
        if deployment_type.value == "prompt":
            # Get prompt session statistics
            from models.database.db_models import Deployment
            
            # Get the page deployment from database
            db_page_deployment = db_session.exec(
                select(Deployment).where(Deployment.deployment_id == page_deployment_id)
            ).first()
            
            if not db_page_deployment:
                return {"started": 0, "completed": 0, "completion_rate": 0.0}
            
            # Get session statistics
            total_sessions = db_session.exec(
                select(PromptSession).where(
                    PromptSession.deployment_id == db_page_deployment.id,
                    PromptSession.is_active == True
                )
            ).all()
            
            completed_sessions = [s for s in total_sessions if s.completed_at is not None]
            
            completion_rate = (len(completed_sessions) / len(total_sessions) * 100) if total_sessions else 0.0
            
            # Calculate average completion time
            avg_time = None
            if completed_sessions:
                completion_times = []
                for session in completed_sessions:
                    if session.completed_at and session.started_at:
                        delta = session.completed_at - session.started_at
                        completion_times.append(delta.total_seconds() / 60)  # minutes
                
                if completion_times:
                    avg_time = sum(completion_times) / len(completion_times)
            
            # Get last activity
            last_activity = None
            if total_sessions:
                latest_session = max(total_sessions, key=lambda s: s.started_at)
                last_activity = latest_session.started_at
            
            return {
                "started": len(total_sessions),
                "completed": len(completed_sessions),
                "completion_rate": completion_rate,
                "avg_time": avg_time,
                "last_activity": last_activity
            }
        
        # For other deployment types, return default values
        return {"started": 0, "completed": 0, "completion_rate": 0.0}
        
    except Exception as e:
        print(f"Error getting page statistics: {e}")
        return {"started": 0, "completed": 0, "completion_rate": 0.0}

async def _get_active_student_count(deployment_id: str, db_session) -> int:
    """Get count of students who have interacted with this deployment"""
    try:
        from models.database.db_models import Deployment
        
        # Get the main deployment
        db_deployment = db_session.exec(
            select(Deployment).where(Deployment.deployment_id == deployment_id)
        ).first()
        
        if not db_deployment:
            return 0
        
        # Count unique users across all related deployments (pages)
        unique_users = set()
        
        # Get all related page deployments
        related_deployments = db_session.exec(
            select(Deployment).where(
                Deployment.deployment_id.like(f"{deployment_id}_page_%")
            )
        ).all()
        
        # Count users from prompt sessions
        for page_deployment in related_deployments:
            sessions = db_session.exec(
                select(PromptSession.user_id).where(
                    PromptSession.deployment_id == page_deployment.id,
                    PromptSession.is_active == True
                )
            ).all()
            
            for session in sessions:
                unique_users.add(session)
        
        return len(unique_users)
        
    except Exception as e:
        print(f"Error getting active student count: {e}")
        return 0

@router.get("/{deployment_id}/student-access-ids", response_model=Dict[str, Any])
async def get_student_access_ids(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get the actual deployment IDs that students should use for sessions/prompts"""
    
    # Validate deployment access
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get the page deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
        if not deployment_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not active in memory"
            )
    
    page_deployment = deployment_info["page_deployment"]
    
    # Build student access ID mapping
    student_access_ids = []
    for page_idx, page_deploy in enumerate(page_deployment.get_deployment_list()):
        page_number = page_idx + 1
        page = page_deployment.get_page_list()[page_idx]
        
        student_access_ids.append({
            "page_number": page_number,
            "page_type": page.get_primary_node_type() or "unknown",
            "container_id": f"{deployment_id}_page_{page_number}",
            "student_access_id": page_deploy.deployment_id,
            "is_accessible": page_deployment.is_page_accessible(page_number),
            "use_this_for_sessions": True
        })
    
    return {
        "main_deployment_id": deployment_id,
        "total_pages": page_deployment.get_page_count(),
        "student_access_ids": student_access_ids,
        "note": "Use 'student_access_id' for creating prompt sessions and student interactions"
    }

@router.get("/{deployment_id}/behaviors/history", response_model=List[Dict[str, Any]])
async def get_behavior_execution_history_endpoint(
    deployment_id: str,
    behavior_number: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Get behavior execution history for a page-based deployment (instructor only)"""
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Get behavior execution history
    try:
        history = await get_behavior_execution_history(deployment_id, db, behavior_number)
        return history
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get behavior execution history: {str(e)}"
        )

class SetPagesAccessibleRequest(BaseModel):
    pages_accessible: int = Field(..., ge=-1, description="Number of pages accessible to students (-1 for all)")

@router.post("/{deployment_id}/pages-accessible")
async def set_deployment_pages_accessible(
    deployment_id: str,
    request: SetPagesAccessibleRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """Set the number of pages accessible to students (instructor only)"""
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based"
        )
    
    # Update pages accessible
    try:
        success = await set_pages_accessible(deployment_id, request.pages_accessible, db)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page deployment not found in memory"
            )
        
        return {
            "success": True,
            "pages_accessible": request.pages_accessible,
            "message": f"Pages accessible updated to {request.pages_accessible}"
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update pages accessible: {str(e)}"
        ) 

@router.get("/{deployment_id}/behaviors/{behavior_number}/diagnose", response_model=Dict[str, Any])
async def diagnose_behavior_input(
    deployment_id: str,
    behavior_number: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Diagnose behavior input configuration to help debug execution issues.
    This endpoint helps users understand why a behavior might be failing to execute.
    """
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based and does not support behaviors"
        )
    
    # Get the deployment from memory, try to load on-demand if not found
    deployment_info = get_active_page_deployment(deployment_id)
    if not deployment_info:
        # Try to load the page deployment on-demand
        if not await load_page_deployment_on_demand(deployment_id, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page deployment not found or failed to load"
            )
        deployment_info = get_active_page_deployment(deployment_id)
    
    # Get page deployment from memory
    page_deployment = deployment_info["page_deployment"]
    
    # Set database session for proper data retrieval
    page_deployment.set_db_session(db)
    
    # Validate behavior exists
    behavior = page_deployment.get_behavior_by_number(behavior_number)
    if not behavior:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Behavior {behavior_number} not found"
        )
    
    try:
        from datetime import datetime
        
        # Get diagnostic information
        diagnosis = behavior.diagnose_input_configuration()
        
        # Add additional context
        diagnosis["deployment_id"] = deployment_id
        diagnosis["behavior_type"] = behavior.get_behavior_deployment().get_behavior_type()
        diagnosis["timestamp"] = datetime.now().isoformat()
        
        return diagnosis
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Behavior diagnosis failed: {str(e)}"
        ) 

@router.get("/{deployment_id}/group-assignments", response_model=List[Dict[str, Any]])
async def get_group_assignments(
    deployment_id: str,
    execution_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Get group assignments for a deployment, optionally filtered by execution ID.
    Returns detailed group information including explanations and members.
    """
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based and does not support group assignments"
        )
    
    try:
        from models.database.grouping_models import GroupAssignment, Group, GroupMember
        from models.database.db_models import PageDeploymentState
        
        # Get the page deployment state
        page_state = db.exec(
            select(PageDeploymentState).where(
                PageDeploymentState.deployment_id == deployment_id,
                PageDeploymentState.is_active == True
            )
        ).first()
        
        if not page_state:
            return []
        
        # Build query for group assignments
        query = select(GroupAssignment).where(
            GroupAssignment.page_deployment_id == page_state.id,
            GroupAssignment.is_active == True
        )
        
        # Filter by execution ID if provided
        if execution_id:
            query = query.where(GroupAssignment.execution_id == execution_id)
        
        # Order by most recent first
        query = query.order_by(GroupAssignment.created_at.desc())
        
        group_assignments = db.exec(query).all()
        
        result = []
        for assignment in group_assignments:
            # Get all groups for this assignment
            groups = db.exec(
                select(Group).where(
                    Group.assignment_id == assignment.id,
                    Group.is_active == True
                ).order_by(Group.group_number)
            ).all()
            
            groups_data = []
            for group in groups:
                # Get all members for this group
                members = db.exec(
                    select(GroupMember).where(
                        GroupMember.group_id == group.id,
                        GroupMember.is_active == True
                    ).order_by(GroupMember.student_name)
                ).all()
                
                members_data = [
                    {
                        "student_name": member.student_name,
                        "student_text": member.student_text
                    }
                    for member in members
                ]
                
                groups_data.append({
                    "group_name": group.group_name,
                    "group_number": group.group_number,
                    "explanation": group.explanation,
                    "members": members_data,
                    "member_count": len(members_data)
                })
            
            result.append({
                "assignment_id": assignment.id,
                "execution_id": assignment.execution_id,
                "total_students": assignment.total_students,
                "total_groups": assignment.total_groups,
                "group_size_target": assignment.group_size_target,
                "grouping_method": assignment.grouping_method,
                "includes_explanations": assignment.includes_explanations,
                "created_at": assignment.created_at.isoformat(),
                "groups": groups_data
            })
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve group assignments: {str(e)}"
        )

@router.get("/{deployment_id}/theme-assignments", response_model=List[Dict[str, Any]])
async def get_theme_assignments(
    deployment_id: str,
    execution_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Get theme assignments for a deployment, optionally filtered by execution ID.
    Returns detailed theme information including keywords, snippets, and student associations.
    """
    
    # Validate deployment access and require instructor role
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    
    if not db_deployment.is_page_based:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This deployment is not page-based and does not support theme assignments"
        )
    
    try:
        from models.database.theme_models import (
            ThemeAssignment, Theme, ThemeKeyword, ThemeSnippet, ThemeStudentAssociation
        )
        from models.database.db_models import PageDeploymentState
        
        print(f"🔍 THEME ASSIGNMENTS API: Fetching themes for deployment {deployment_id}")
        
        # Get the page deployment state
        page_state = db.exec(
            select(PageDeploymentState).where(
                PageDeploymentState.deployment_id == deployment_id,
                PageDeploymentState.is_active == True
            )
        ).first()
        
        if not page_state:
            print(f"🔍 THEME API: No page deployment state found for deployment {deployment_id}")
            # Check if there are any page deployment states at all
            all_page_states = db.exec(select(PageDeploymentState)).all()
            print(f"🔍 THEME API: Total page deployment states in database: {len(all_page_states)}")
            for ps in all_page_states:
                print(f"   - {ps.deployment_id} (active: {ps.is_active})")
            return []
        
        print(f"🔍 THEME API: Found page deployment state {page_state.id} for deployment {deployment_id}")
        
        # Build query for theme assignments
        query = select(ThemeAssignment).where(
            ThemeAssignment.page_deployment_id == page_state.id,
            ThemeAssignment.is_active == True
        )
        
        # Filter by execution ID if provided
        if execution_id:
            query = query.where(ThemeAssignment.execution_id == execution_id)
        
        # Order by most recent first
        query = query.order_by(ThemeAssignment.created_at.desc())
        
        theme_assignments = db.exec(query).all()
        
        print(f"🔍 THEME API: Found {len(theme_assignments)} theme assignments in database for page_deployment_id {page_state.id}")
        
        # If no theme assignments found, check if there are any theme assignments at all
        if not theme_assignments:
            all_theme_assignments = db.exec(select(ThemeAssignment)).all()
            print(f"🔍 THEME API: Total theme assignments in database: {len(all_theme_assignments)}")
            for ta in all_theme_assignments:
                print(f"   - Assignment {ta.id}: page_deployment_id={ta.page_deployment_id}, execution_id={ta.execution_id}, active={ta.is_active}")
        
        result = []
        for assignment in theme_assignments:
            # Get all themes for this assignment
            themes = db.exec(
                select(Theme).where(
                    Theme.assignment_id == assignment.id,
                    Theme.is_active == True
                ).order_by(Theme.cluster_id)
            ).all()
            
            themes_data = []
            for theme in themes:
                # Get keywords for this theme
                keywords = db.exec(
                    select(ThemeKeyword).where(
                        ThemeKeyword.theme_id == theme.id,
                        ThemeKeyword.is_active == True
                    ).order_by(ThemeKeyword.order_index)
                ).all()
                
                # Get snippets for this theme
                snippets = db.exec(
                    select(ThemeSnippet).where(
                        ThemeSnippet.theme_id == theme.id,
                        ThemeSnippet.is_active == True
                    ).order_by(ThemeSnippet.order_index)
                ).all()
                
                # Get student associations for this theme
                student_associations = db.exec(
                    select(ThemeStudentAssociation).where(
                        ThemeStudentAssociation.theme_id == theme.id,
                        ThemeStudentAssociation.is_active == True
                    ).order_by(ThemeStudentAssociation.student_name)
                ).all()
                
                themes_data.append({
                    "title": theme.title,
                    "description": theme.description,
                    "cluster_id": theme.cluster_id,
                    "document_count": theme.document_count,
                    "student_count": theme.student_count,
                    "keywords": [kw.keyword for kw in keywords],
                    "snippets": [snippet.text for snippet in snippets],
                    "student_names": [assoc.student_name for assoc in student_associations],
                    "students": [
                        {
                            "student_name": assoc.student_name,
                            "student_text": assoc.student_text
                        }
                        for assoc in student_associations
                    ]
                })
            
            result.append({
                "assignment_id": assignment.id,
                "execution_id": assignment.execution_id,
                "total_students": assignment.total_students,
                "total_themes": assignment.total_themes,
                "num_themes_target": assignment.num_themes_target,
                "clustering_method": assignment.clustering_method,
                "includes_llm_polish": assignment.includes_llm_polish,
                "llm_polish_prompt": assignment.llm_polish_prompt,
                "created_at": assignment.created_at.isoformat(),
                "themes": themes_data
            })
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve theme assignments: {str(e)}"
        )

@router.get("/{deployment_id}/group-assignments/latest", response_model=Dict[str, Any])
async def get_latest_group_assignment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Get the most recent group assignment for a deployment.
    """
    
    # Get all group assignments and return the first (most recent)
    assignments = await get_group_assignments(deployment_id, None, current_user, db)
    
    if not assignments:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No group assignments found for this deployment"
        )
    
    return assignments[0] 
