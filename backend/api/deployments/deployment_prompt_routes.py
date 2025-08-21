from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .deployment_shared import *
from api.file_storage import store_file
from scripts.utils import get_user_collection_name
import uuid
from pathlib import Path
import tempfile
import sys

# Optional config loading similar to documents API
try:
    from scripts.config import load_config
    _prompt_config = load_config()
except Exception:
    _prompt_config = {}

# For PDF ingestion
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant

router = APIRouter()

class GroupInfo(BaseModel):
    group_name: str
    group_members: List[str]
    member_count: int
    explanation: Optional[str] = None

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
    group_info: Optional[GroupInfo] = None

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
    group_info: Optional[GroupInfo] = None

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

async def get_user_group_info(deployment_id: str, user_email: str, db: DBSession) -> Optional[GroupInfo]:
    """
    Get group information for a user if the deployment is part of a page-based workflow
    with group input.
    """
    try:
        # Check if this is a page-based deployment
        from services.pages_manager import get_active_page_deployment
        
        # First try to find the parent page deployment
        parent_deployment_id = None
        
        # Check if this deployment ID is a page deployment (contains "_page_")
        if "_page_" in deployment_id:
            # Extract parent deployment ID
            parent_deployment_id = deployment_id.split("_page_")[0]
        else:
            # This might be the parent deployment itself
            parent_deployment_id = deployment_id
        
        # Get the active page deployment
        page_deployment_info = get_active_page_deployment(parent_deployment_id)
        if not page_deployment_info:
            return None
        
        page_deployment = page_deployment_info.get("page_deployment")
        if not page_deployment:
            return None
        
        # Find the specific page by deployment ID
        target_page = None
        for i, page in enumerate(page_deployment.get_page_list()):
            page_dep_id = page.get_agent_deployment().deployment_id
            if page_dep_id == deployment_id:
                target_page = page
                break
        
        if not target_page:
            return None
        
        if not target_page.has_group_input():
            return None
        
        # Get group data for the user
        group_data = target_page.get_group_data_for_user(user_email)
        if not group_data:
            return None
        
        # Try to get explanations from the latest group assignment
        explanation = None
        try:
            from models.database.grouping_models import GroupAssignment, Group
            from models.database.db_models import Deployment
            from sqlalchemy.orm import selectinload
            
            # First, get the database ID for the parent deployment
            parent_deployment_record = db.query(Deployment).filter(
                Deployment.deployment_id == parent_deployment_id
            ).first()
            
            if parent_deployment_record:
                # Query using the database integer ID, not the UUID
                latest_assignment = db.query(GroupAssignment).filter(
                    GroupAssignment.page_deployment_id == parent_deployment_record.id
                ).options(selectinload(GroupAssignment.groups)).order_by(
                    GroupAssignment.created_at.desc()
                ).first()
                
                if latest_assignment:
                    # Find the group that contains this user
                    for group in latest_assignment.groups:
                        if group.group_name == group_data["group_name"]:
                            explanation = group.explanation
                            break
                else:
                    # Fallback: try to find the most recent assignment with this group name
                    all_recent_assignments = db.query(GroupAssignment).options(
                        selectinload(GroupAssignment.groups)
                    ).order_by(GroupAssignment.created_at.desc()).limit(5).all()
                    
                    for assignment in all_recent_assignments:
                        for group in assignment.groups:
                            if group.group_name == group_data["group_name"]:
                                explanation = group.explanation
                                break
                        if explanation:
                            break
        except Exception as e:
            pass  # Silently continue if explanation cannot be retrieved
        
        result = GroupInfo(
            group_name=group_data["group_name"],
            group_members=group_data["group_members"],
            member_count=group_data["member_count"],
            explanation=explanation
        )
        
        return result
    
    except Exception as e:
        return None

def get_all_prompt_submissions_for_deployment(deployment_id: str, db_session) -> Dict[str, Any]:
    """
    Get all prompt submissions for a specific deployment, formatted for behavior input.
    
    Args:
        deployment_id: The deployment ID to get submissions for
        db_session: Database session
        
    Returns:
        Dictionary with 'students' (list of student data) and 'prompt_context' (main question)
    """
    try:
        # Get the deployment to find its database ID
        from models.database.db_models import Deployment
        db_deployment = db_session.exec(
            select(Deployment).where(Deployment.deployment_id == deployment_id)
        ).first()
        
        if not db_deployment:
            return {"students": [], "prompt_context": None}
        
        # Get all prompt sessions for this deployment
        sessions = db_session.exec(
            select(PromptSession, User.email).join(User).where(
                PromptSession.deployment_id == db_deployment.id,
                PromptSession.is_active == True,
                PromptSession.completed_at.isnot(None)  # Only get completed sessions
            )
        ).all()
        
        user_submissions = []
        prompt_context = None
        
        for session, user_email in sessions:
            # Capture the main question from the first session
            if prompt_context is None and session.main_question:
                prompt_context = session.main_question
            # Get all submissions for this session
            submissions = db_session.exec(
                select(PromptSubmission).where(PromptSubmission.session_id == session.id)
                .order_by(PromptSubmission.submission_index)
            ).all()
            
            if submissions:
                # Separate out PDF document IDs and textual responses
                pdf_document_ids: List[int] = []
                text_responses: List[str] = []
                submission_responses: Dict[str, Any] = {}
                
                for sub in submissions:
                    # Create a unique key for this submission (could be improved with actual prompt IDs)
                    submission_key = f"submission_{sub.submission_index}"
                    
                    if getattr(sub, 'media_type', None) == 'pdf':
                        try:
                            pdf_id = int(sub.user_response)
                            pdf_document_ids.append(pdf_id)
                            # Store PDF submission in responses
                            submission_responses[submission_key] = {
                                "media_type": "pdf",
                                "response": sub.user_response,
                                "text": "",  # PDFs don't have direct text
                                "submission_index": sub.submission_index
                            }
                        except Exception:
                            # Ignore bad IDs and treat as text
                            text_responses.append(sub.user_response)
                            submission_responses[submission_key] = {
                                "media_type": "text",
                                "response": sub.user_response,
                                "text": sub.user_response,
                                "submission_index": sub.submission_index
                            }
                    else:
                        text_responses.append(sub.user_response)
                        submission_responses[submission_key] = {
                            "media_type": "text",
                            "response": sub.user_response,
                            "text": sub.user_response,
                            "submission_index": sub.submission_index
                        }

                combined_text = " ".join(text_responses)
                user_submissions.append({
                    "name": user_email,
                    "text": combined_text,
                    "pdf_document_ids": pdf_document_ids,
                    "submission_responses": submission_responses,
                    "session_id": session.id,
                    "completed_at": session.completed_at.isoformat() if session.completed_at else None
                })
        
        return {
            "students": user_submissions,
            "prompt_context": prompt_context
        }
    
    except Exception as e:
        print(f"Error getting prompt submissions for deployment {deployment_id}: {e}")
        return {"students": [], "prompt_context": None}

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
    
    group_info = await get_user_group_info(deployment_id, current_user.email, db)
    
    return PromptInfoResponse(
        deployment_id=deployment_id,
        main_question=prompt_info["main_question"],
        submission_requirements=prompt_info["submission_requirements"],
        total_submissions=prompt_info["submission_count"],
        is_question_only=prompt_service.is_question_only(),
        group_info=group_info,
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
    
    # Get group information for the user
    group_info = await get_user_group_info(deployment_id, current_user.email, db)
    
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
            group_info=group_info,
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
            group_info=group_info,
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
        group_info=group_info,
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

@router.post("/{deployment_id}/prompt/submit_pdf", response_model=PromptSubmissionResponse)
async def submit_prompt_pdf(
    deployment_id: str,
    submission_index: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Submit a PDF file for a specific submission requirement that expects a PDF."""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.PROMPT)
    check_deployment_open(db_deployment)

    # Load prompt service (for configuration and count)
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    prompt_service = deployment_mem["mcp_deployment"]._prompt_service
    if not prompt_service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prompt service not available"
        )

    # Get or create active session
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

    # Validate index
    if submission_index < 0 or submission_index >= len(session.submission_requirements):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid submission index. Must be between 0 and {len(session.submission_requirements) - 1}",
        )

    # Ensure requirement expects a PDF
    requirement = session.submission_requirements[submission_index]
    if requirement.get("mediaType") != "pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This submission does not accept a PDF file",
        )

    # Disallow resubmission
    existing_submission = db.exec(
        select(PromptSubmission).where(
            PromptSubmission.session_id == session.id,
            PromptSubmission.submission_index == submission_index,
        )
    ).first()
    if existing_submission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Response already submitted for this requirement. Cannot resubmit.",
        )

    # Validate file
    filename = file.filename or "uploaded.pdf"
    suffix = Path(filename).suffix.lower()
    if suffix != ".pdf" or file.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file. Only PDF files are allowed."
        )

    file_bytes = await file.read()
    max_mb = (
        _prompt_config.get("document_processing", {}).get("max_file_size_mb", 20)
    )
    if len(file_bytes) > max_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {max_mb}MB limit",
        )

    # Prepare Document record fields (no embedding for prompt PDF submission)
    upload_id = str(uuid.uuid4())
    workflow = db.get(Workflow, db_deployment.workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Store the file on disk
    try:
        storage_path = store_file(
            file_content=file_bytes,
            workflow_id=workflow.id,
            upload_id=upload_id,
            filename=filename,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store PDF: {str(e)}",
        )

    # Ingest to Qdrant similar to documents API
    # Load PDF from a temporary file to split into chunks
    chunks = []
    try:
        with tempfile.NamedTemporaryFile(delete=True, suffix=Path(filename).suffix.lower()) as tmp:
            tmp.write(file_bytes)
            tmp.flush()
            docs = PyPDFLoader(tmp.name).load()
        if docs:
            chunk_settings = _prompt_config.get("document_processing", {}).get("chunk_settings", {})
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_settings.get("chunk_size", 800),
                chunk_overlap=chunk_settings.get("chunk_overlap", 100),
                add_start_index=chunk_settings.get("add_start_index", True)
            )
            chunks = splitter.split_documents(docs)
            for chunk in chunks:
                chunk.metadata.update({
                    'user_id': current_user.id,
                    'filename': filename,
                    'source': filename,
                    'upload_id': upload_id
                })
    except Exception as e:
        # Continue without embeddings if processing fails
        chunks = []

    chunk_count = 0
    try:
        if chunks:
            embeddings = FastEmbedEmbeddings()
            user_collection = get_user_collection_name(workflow.workflow_collection_id, current_user.id)
            Qdrant.from_documents(
                documents=chunks,
                embedding=embeddings,
                url=_prompt_config.get("qdrant", {}).get("url", "http://localhost:6333"),
                prefer_grpc=_prompt_config.get("qdrant", {}).get("prefer_grpc", False),
                collection_name=user_collection,
                ids=[str(uuid.uuid4()) for _ in chunks],
            )
            chunk_count = len(chunks)
    except Exception:
        # Swallow embedding/Qdrant errors, file is still stored and referenced
        pass

    # Create Document row
    # Also persist a few snippet texts to aid later RAG/explanations
    snippet_texts: List[str] = []
    try:
        for d in (chunks or [])[:5]:
            content = getattr(d, 'page_content', '')
            if content:
                snippet_texts.append(content.strip()[:400])
    except Exception:
        snippet_texts = []

    document = Document(
        filename=filename,
        original_filename=filename,
        file_size=len(file_bytes),
        file_type="pdf",
        collection_name=workflow.workflow_collection_id,
        user_collection_name=get_user_collection_name(workflow.workflow_collection_id, current_user.id),
        upload_id=upload_id,
        chunk_count=chunk_count,
        storage_path=storage_path,
        uploaded_by_id=current_user.id,
        workflow_id=workflow.id,
        doc_metadata={"snippets": snippet_texts} if snippet_texts else None,
    )
    db.add(document)
    db.flush()

    # Save prompt submission referencing the document by ID
    submission = PromptSubmission(
        session_id=session.id,
        submission_index=submission_index,
        prompt_text=requirement.get("prompt", ""),
        media_type="pdf",
        user_response=str(document.id),  # store document id as reference
    )
    db.add(submission)
    db.flush()

    # Mark completed if all submissions present
    total_submissions = len(session.submission_requirements)
    current_submissions = db.exec(
        select(PromptSubmission).where(PromptSubmission.session_id == session.id)
    ).all()
    if len(current_submissions) == total_submissions:
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
        item = {
            "submission_index": submission.submission_index,
            "prompt_text": submission.prompt_text,
            "media_type": submission.media_type,
            "user_response": submission.user_response,
            "submitted_at": submission.submitted_at.isoformat()
        }
        # If this is a PDF submission, enrich with document metadata for admin UI
        if submission.media_type == 'pdf':
            try:
                from models.database.db_models import Document
                doc_id = int(submission.user_response)
                doc = db.get(Document, doc_id)
                if doc and doc.is_active:
                    item["document_id"] = doc.id
                    item["document_filename"] = doc.original_filename or doc.filename
            except Exception:
                pass
        submissions.append(item)
    
    return PromptInstructorSubmissionView(
        session_id=session.id,
        user_email=user_email,
        submissions=submissions,
        completed_at=session.completed_at,
    ) 
