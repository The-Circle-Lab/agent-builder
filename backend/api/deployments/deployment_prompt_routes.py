from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .deployment_shared import *

router = APIRouter()

class PromptSessionResponse(BaseModel):
    session_id: int
    deployment_id: str
    main_question: str
    submission_requirements: List[Dict[str, Any]]
    total_submissions: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    is_completed: bool
    submitted_responses: Optional[List[Dict[str, Any]]] = None

class PromptSubmissionRequest(BaseModel):
    submission_index: int
    response: str

class PromptSubmissionResponse(BaseModel):
    submission_index: int
    prompt_text: str
    media_type: str
    user_response: str
    submitted_at: datetime
    is_valid: bool
    validation_error: Optional[str] = None

class PromptInfoResponse(BaseModel):
    deployment_id: str
    main_question: str
    submission_requirements: List[Dict[str, Any]]
    total_submissions: int
    is_question_only: bool

class PromptInstructorSessionView(BaseModel):
    session_id: int
    user_email: str
    started_at: datetime
    completed_at: Optional[datetime]
    total_submissions: int
    submitted_count: int
    is_completed: bool
    progress_percentage: float

class PromptInstructorSubmissionView(BaseModel):
    session_id: int
    user_email: str
    submissions: List[Dict[str, Any]]
    completed_at: Optional[datetime]

@router.get("/{deployment_id}/prompt/info", response_model=PromptInfoResponse)
async def get_prompt_info(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Get basic information about the prompt deployment"""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    prompt_service = deployment_mem["mcp_deployment"]._prompt_service
    
    if not prompt_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prompt service not available"
        )
    
    prompt_info = prompt_service.to_dict()
    
    return PromptInfoResponse(
        deployment_id=deployment_id,
        main_question=prompt_info["main_question"],
        submission_requirements=prompt_info["submission_requirements"],
        total_submissions=prompt_info["submission_count"],
        is_question_only=prompt_service.is_question_only(),
    )

@router.post("/{deployment_id}/prompt/session", response_model=PromptSessionResponse)
async def start_prompt_session(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Start or retrieve an existing prompt session"""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)
    check_deployment_open(db_deployment)

    # Get prompt service to check if this is question-only
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    prompt_service = deployment_mem["mcp_deployment"]._prompt_service
    
    if not prompt_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prompt service not available"
        )
    
    prompt_info = prompt_service.to_dict()
    
    # For question-only prompts, return the info directly without creating a session
    if prompt_service.is_question_only():
        return PromptSessionResponse(
            session_id=0,  # Use 0 to indicate no session needed
            deployment_id=deployment_id,
            main_question=prompt_info["main_question"],
            submission_requirements=[],
            total_submissions=0,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),  # Immediately completed for question-only
            is_completed=True,
            submitted_responses=[],
        )

    # Check for existing session (only for prompts with submissions)
    existing_session = db.exec(
        select(PromptSession).where(
            PromptSession.user_id == current_user.id,
            PromptSession.deployment_id == db_deployment.id,
            PromptSession.is_active == True,
        )
    ).first()

    if existing_session:
        # Return existing session with submitted responses
        submitted_responses_data = db.exec(
            select(PromptSubmission).where(PromptSubmission.session_id == existing_session.id)
            .order_by(PromptSubmission.submission_index)
        ).all()
        
        submitted_responses = []
        for submission in submitted_responses_data:
            submitted_responses.append({
                "submission_index": submission.submission_index,
                "prompt_text": submission.prompt_text,
                "media_type": submission.media_type,
                "user_response": submission.user_response,
                "submitted_at": submission.submitted_at.isoformat()
            })
        
        return PromptSessionResponse(
            session_id=existing_session.id,
            deployment_id=deployment_id,
            main_question=existing_session.main_question,
            submission_requirements=existing_session.submission_requirements,
            total_submissions=len(existing_session.submission_requirements),
            started_at=existing_session.started_at,
            completed_at=existing_session.completed_at,
            is_completed=existing_session.completed_at is not None,
            submitted_responses=submitted_responses,
        )

    # Create new session for prompts with submissions
    new_session = PromptSession(
        user_id=current_user.id,
        deployment_id=db_deployment.id,
        main_question=prompt_info["main_question"],
        submission_requirements=prompt_info["submission_requirements"],
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    return PromptSessionResponse(
        session_id=new_session.id,
        deployment_id=deployment_id,
        main_question=prompt_info["main_question"],
        submission_requirements=prompt_info["submission_requirements"],
        total_submissions=prompt_info["submission_count"],
        started_at=new_session.started_at,
        completed_at=None,
        is_completed=False,
        submitted_responses=[],
    )

@router.post("/{deployment_id}/prompt/submit", response_model=PromptSubmissionResponse)
async def submit_prompt_response(
    deployment_id: str,
    request: PromptSubmissionRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Submit a response for a specific submission requirement"""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)
    check_deployment_open(db_deployment)

    # Get prompt service for validation
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    prompt_service = deployment_mem["mcp_deployment"]._prompt_service
    
    if not prompt_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prompt service not available"
        )

    # Check if this is a question-only prompt (no submissions allowed)
    if prompt_service.is_question_only():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This prompt does not accept submissions. It is a question-only prompt."
        )

    # Get the user's session
    session = db.exec(
        select(PromptSession).where(
            PromptSession.user_id == current_user.id,
            PromptSession.deployment_id == db_deployment.id,
            PromptSession.is_active == True,
        )
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active prompt session found. Please start a session first.",
        )

    if session.completed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt session is already completed.",
        )

    # Validate submission index
    if request.submission_index < 0 or request.submission_index >= len(session.submission_requirements):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid submission index. Must be between 0 and {len(session.submission_requirements) - 1}",
        )

    # Check if submission already exists
    existing_submission = db.exec(
        select(PromptSubmission).where(
            PromptSubmission.session_id == session.id,
            PromptSubmission.submission_index == request.submission_index,
        )
    ).first()

    if existing_submission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response already submitted for this requirement. Cannot resubmit.",
        )

    # Validate the submission
    validation_result = prompt_service.validate_submission(request.submission_index, request.response)
    
    if not validation_result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation_result["error"]
        )

    # Get submission requirement details
    requirement = session.submission_requirements[request.submission_index]
    
    # Save the submission
    submission = PromptSubmission(
        session_id=session.id,
        submission_index=request.submission_index,
        prompt_text=requirement["prompt"],
        media_type=requirement["mediaType"],
        user_response=request.response.strip(),
    )
    
    db.add(submission)
    db.flush()  # Flush to make the new submission visible to the next query
    
    # Check if all submissions are complete
    total_submissions = len(session.submission_requirements)
    current_submissions = db.exec(
        select(PromptSubmission).where(PromptSubmission.session_id == session.id)
    ).all()
    
    if len(current_submissions) == total_submissions:  # Now we can check the actual count
        session.completed_at = datetime.now(timezone.utc)
        db.add(session)
    
    db.commit()
    db.refresh(submission)
    
    return PromptSubmissionResponse(
        submission_index=submission.submission_index,
        prompt_text=submission.prompt_text,
        media_type=submission.media_type,
        user_response=submission.user_response,
        submitted_at=submission.submitted_at,
        is_valid=True,
        validation_error=None,
    )

@router.get("/{deployment_id}/prompt/session/{session_id}", response_model=PromptSessionResponse)
async def get_prompt_session(
    deployment_id: str,
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Get details of a specific prompt session"""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)

    # Get the session (either user's own or instructor viewing)
    session = db.exec(
        select(PromptSession).where(
            PromptSession.id == session_id,
            PromptSession.deployment_id == db_deployment.id,
            PromptSession.is_active == True,
        )
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Check permissions - users can only see their own sessions unless they're instructors
    if session.user_id != current_user.id:
        if not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own sessions.",
            )

    # Get submitted responses
    submitted_responses_data = db.exec(
        select(PromptSubmission).where(PromptSubmission.session_id == session.id)
        .order_by(PromptSubmission.submission_index)
    ).all()
    
    submitted_responses = []
    for submission in submitted_responses_data:
        submitted_responses.append({
            "submission_index": submission.submission_index,
            "prompt_text": submission.prompt_text,
            "media_type": submission.media_type,
            "user_response": submission.user_response,
            "submitted_at": submission.submitted_at.isoformat()
        })
    
    return PromptSessionResponse(
        session_id=session.id,
        deployment_id=deployment_id,
        main_question=session.main_question,
        submission_requirements=session.submission_requirements,
        total_submissions=len(session.submission_requirements),
        started_at=session.started_at,
        completed_at=session.completed_at,
        is_completed=session.completed_at is not None,
        submitted_responses=submitted_responses,
    )

@router.get("/{deployment_id}/prompt/instructor/sessions", response_model=List[PromptInstructorSessionView])
async def get_all_prompt_sessions_for_instructor(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Get all prompt sessions for instructor review"""
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)

    # Check if this is a question-only prompt
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    prompt_service = deployment_mem["mcp_deployment"]._prompt_service
    
    if not prompt_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prompt service not available"
        )

    # For question-only prompts, return empty list (no sessions to track)
    if prompt_service.is_question_only():
        return []

    # Get all sessions for this deployment
    sessions = db.exec(
        select(PromptSession, User.email).join(User).where(
            PromptSession.deployment_id == db_deployment.id,
            PromptSession.is_active == True,
        )
    ).all()

    session_views = []
    for session, user_email in sessions:
        # Count submitted responses
        submitted_count = len(db.exec(
            select(PromptSubmission).where(PromptSubmission.session_id == session.id)
        ).all())
        
        total_submissions = len(session.submission_requirements)
        progress_percentage = (submitted_count / total_submissions * 100) if total_submissions > 0 else 0
        
        session_views.append(PromptInstructorSessionView(
            session_id=session.id,
            user_email=user_email,
            started_at=session.started_at,
            completed_at=session.completed_at,
            total_submissions=total_submissions,
            submitted_count=submitted_count,
            is_completed=session.completed_at is not None,
            progress_percentage=progress_percentage,
        ))

    return session_views

@router.get("/{deployment_id}/prompt/instructor/submissions/{session_id}", response_model=PromptInstructorSubmissionView)
async def get_prompt_submissions_for_instructor(
    deployment_id: str,
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Get detailed submissions for a specific session (instructor view)"""
    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db, require_instructor=True
    )
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)

    # Get the session with user info
    session_data = db.exec(
        select(PromptSession, User.email).join(User).where(
            PromptSession.id == session_id,
            PromptSession.deployment_id == db_deployment.id,
            PromptSession.is_active == True,
        )
    ).first()

    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    session, user_email = session_data

    # Get all submissions for this session
    submissions_data = db.exec(
        select(PromptSubmission).where(PromptSubmission.session_id == session.id)
        .order_by(PromptSubmission.submission_index)
    ).all()
    
    submissions = []
    for submission in submissions_data:
        submissions.append({
            "submission_index": submission.submission_index,
            "prompt_text": submission.prompt_text,
            "media_type": submission.media_type,
            "user_response": submission.user_response,
            "submitted_at": submission.submitted_at.isoformat()
        })
    
    return PromptInstructorSubmissionView(
        session_id=session.id,
        user_email=user_email,
        submissions=submissions,
        completed_at=session.completed_at,
    ) 
