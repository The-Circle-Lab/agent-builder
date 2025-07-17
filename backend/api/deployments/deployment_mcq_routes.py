from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .deployment_shared import *

router = APIRouter()

class MCQSessionResponse(BaseModel):
    session_id: int
    deployment_id: str
    questions: List[Dict[str, Any]]  
    total_questions: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    score: Optional[int] = None
    is_completed: bool
    submitted_answers: Optional[List[Dict[str, Any]]] = None 

class MCQAnswerRequest(BaseModel):
    question_index: int
    selected_answer: str

class MCQAnswerResponse(BaseModel):
    question_index: int
    selected_answer: str
    is_correct: bool
    correct_answer: str
    answered_at: datetime

class MCQInstructorSessionView(BaseModel):
    session_id: int
    user_email: str
    started_at: datetime
    completed_at: Optional[datetime]
    score: Optional[int]
    total_questions: int
    is_completed: bool
    progress_percentage: float

@router.post("/{deployment_id}/mcq/session", response_model=MCQSessionResponse)
async def start_mcq_session(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.MCQ)
    check_deployment_open(db_deployment)

    existing_session = db.exec(
        select(MCQSession).where(
            MCQSession.user_id == current_user.id,
            MCQSession.deployment_id == db_deployment.id,
            MCQSession.is_active == True,
        )
    ).first()

    if existing_session:
        deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
        mcq_service = deployment_mem["mcp_deployment"]._mcq_service
        
        submitted_answers_data = db.exec(
            select(MCQAnswer).where(MCQAnswer.session_id == existing_session.id)
        ).all()
        
        submitted_answers = []
        for answer in submitted_answers_data:
            correct_answer = mcq_service.get_question_correct_answer(answer.question_index)
            submitted_answers.append({
                "question_index": answer.question_index,
                "selected_answer": answer.selected_answer,
                "is_correct": answer.is_correct,
                "correct_answer": correct_answer,
                "answered_at": answer.answered_at.isoformat()
            })
        
        questions = []
        for idx in existing_session.question_indices:
            question = {
                "index": idx,
                "question": mcq_service.get_question_title(idx),
                "answers": mcq_service.get_question_possible_answers(idx),
            }
            questions.append(question)
        
        return MCQSessionResponse(
            session_id=existing_session.id,
            deployment_id=deployment_id,
            questions=questions,
            total_questions=existing_session.total_questions,
            started_at=existing_session.started_at,
            completed_at=existing_session.completed_at,
            score=existing_session.score,
            is_completed=existing_session.completed_at is not None,
            submitted_answers=submitted_answers,
        )

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service
    
    question_indices = mcq_service.create_question_set(mcq_service.question_count, mcq_service.randomize)
    
    new_session = MCQSession(
        user_id=current_user.id,
        deployment_id=db_deployment.id,
        question_indices=question_indices,
        total_questions=len(question_indices),
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    questions = []
    for idx in question_indices:
        question = {
            "index": idx,
            "question": mcq_service.get_question_title(idx),
            "answers": mcq_service.get_question_possible_answers(idx),
        }
        questions.append(question)
    
    return MCQSessionResponse(
        session_id=new_session.id,
        deployment_id=deployment_id,
        questions=questions,
        total_questions=len(question_indices),
        started_at=new_session.started_at,
        completed_at=None,
        score=None,
        is_completed=False,
    )

@router.post("/{deployment_id}/mcq/answer", response_model=MCQAnswerResponse)
async def submit_mcq_answer(
    deployment_id: str,
    request: MCQAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.MCQ)
    check_deployment_open(db_deployment)

    session = db.exec(
        select(MCQSession).where(
            MCQSession.user_id == current_user.id,
            MCQSession.deployment_id == db_deployment.id,
            MCQSession.is_active == True,
        )
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active MCQ session found. Please start a session first.",
        )

    if session.completed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MCQ session is already completed.",
        )

    # Check if question index is valid for this session
    if request.question_index not in session.question_indices:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid question index for this session.",
        )

    existing_answer = db.exec(
        select(MCQAnswer).where(
            MCQAnswer.session_id == session.id,
            MCQAnswer.question_index == request.question_index,
        )
    ).first()

    if existing_answer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Answer already submitted for this question. Cannot resubmit.",
        )

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service
    
    # Get correct answer and check if submitted answer is correct
    correct_answer = mcq_service.get_question_correct_answer(request.question_index)
    is_correct = request.selected_answer == correct_answer
    
    # Save the answer
    answer = MCQAnswer(
        session_id=session.id,
        question_index=request.question_index,
        selected_answer=request.selected_answer,
        is_correct=is_correct,
    )
    
    db.add(answer)
    
    # Check if all questions are answered
    # Note: answered_count will include the current answer since it's in the same database session
    answered_count = db.exec(
        select(MCQAnswer).where(MCQAnswer.session_id == session.id)
    ).all()
    
    if len(answered_count) == session.total_questions:  # Current answer is already included in the count
        # Calculate final score and mark session as completed
        correct_count = sum(1 for a in answered_count if a.is_correct)
        session.score = correct_count
        session.completed_at = datetime.now(timezone.utc)
        db.add(session)
    
    db.commit()
    db.refresh(answer)
    
    return MCQAnswerResponse(
        question_index=request.question_index,
        selected_answer=request.selected_answer,
        is_correct=is_correct,
        correct_answer=correct_answer,
        answered_at=answer.answered_at,
    )

# Get student's session status and results
@router.get("/{deployment_id}/mcq/session", response_model=MCQSessionResponse)
async def get_mcq_session_status(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)

    session = db.exec(
        select(MCQSession).where(
            MCQSession.user_id == current_user.id,
            MCQSession.deployment_id == db_deployment.id,
            MCQSession.is_active == True,
        )
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No MCQ session found.",
        )

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service
    
    # Get previously submitted answers
    submitted_answers_data = db.exec(
        select(MCQAnswer).where(MCQAnswer.session_id == session.id)
    ).all()
    
    submitted_answers = []
    for answer in submitted_answers_data:
        # Get the correct answer for this question
        correct_answer = mcq_service.get_question_correct_answer(answer.question_index)
        submitted_answers.append({
            "question_index": answer.question_index,
            "selected_answer": answer.selected_answer,
            "is_correct": answer.is_correct,
            "correct_answer": correct_answer,
            "answered_at": answer.answered_at.isoformat()
        })
    
    questions = []
    for idx in session.question_indices:
        question = {
            "index": idx,
            "question": mcq_service.get_question_title(idx),
            "answers": mcq_service.get_question_possible_answers(idx),
        }
        questions.append(question)
    
    return MCQSessionResponse(
        session_id=session.id,
        deployment_id=deployment_id,
        questions=questions,
        total_questions=session.total_questions,
        started_at=session.started_at,
        completed_at=session.completed_at,
        score=session.score,
        is_completed=session.completed_at is not None,
        submitted_answers=submitted_answers,
    )

# Get all student sessions for MCQ deployment (instructors only)
@router.get("/{deployment_id}/mcq/sessions", response_model=List[MCQInstructorSessionView])
async def get_all_mcq_sessions(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)
    validate_deployment_type(db_deployment, DeploymentType.MCQ)

    # Get all sessions for this deployment
    sessions = db.exec(
        select(MCQSession).where(
            MCQSession.deployment_id == db_deployment.id,
            MCQSession.is_active == True,
        ).order_by(MCQSession.started_at.desc())
    ).all()

    result = []
    for session in sessions:
        # Get user email
        user = db.get(User, session.user_id)
        user_email = user.email if user else "Unknown"
        
        # Calculate progress
        answered_count = db.exec(
            select(MCQAnswer).where(MCQAnswer.session_id == session.id)
        ).all()
        
        progress_percentage = (len(answered_count) / session.total_questions) * 100 if session.total_questions > 0 else 0
        
        result.append(MCQInstructorSessionView(
            session_id=session.id,
            user_email=user_email,
            started_at=session.started_at,
            completed_at=session.completed_at,
            score=session.score,
            total_questions=session.total_questions,
            is_completed=session.completed_at is not None,
            progress_percentage=progress_percentage,
        ))
    
    return result

# Get detailed view of a specific student's MCQ session (instructors only)
@router.get("/{deployment_id}/mcq/sessions/{session_id}")
async def get_mcq_session_details(
    deployment_id: str,
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)

    session = db.get(MCQSession, session_id)
    if not session or session.deployment_id != db_deployment.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get user info
    user = db.get(User, session.user_id)
    
    # Get all answers for this session
    answers = db.exec(
        select(MCQAnswer).where(MCQAnswer.session_id == session_id).order_by(MCQAnswer.answered_at.asc())
    ).all()

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service
    
    # Build detailed response
    questions_with_answers = []
    for idx in session.question_indices:
        # Find answer for this question
        answer = next((a for a in answers if a.question_index == idx), None)
        
        question_detail = {
            "index": idx,
            "question": mcq_service.get_question_title(idx),
            "possible_answers": mcq_service.get_question_possible_answers(idx),
            "correct_answer": mcq_service.get_question_correct_answer(idx),
            "student_answer": answer.selected_answer if answer else None,
            "is_correct": answer.is_correct if answer else None,
            "answered_at": answer.answered_at.isoformat() if answer else None,
        }
        questions_with_answers.append(question_detail)
    
    return {
        "session_id": session.id,
        "user_email": user.email if user else "Unknown",
        "deployment_id": deployment_id,
        "started_at": session.started_at.isoformat(),
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "score": session.score,
        "total_questions": session.total_questions,
        "is_completed": session.completed_at is not None,
        "questions": questions_with_answers,
    } 
