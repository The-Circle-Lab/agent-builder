import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .deployment_shared import *
from services.deployment_types.mcq import MCQDeployment

router = APIRouter()
logger = logging.getLogger(__name__)

class MCQSubmittedAnswer(BaseModel):
    question_index: int
    selected_answer: str
    is_correct: bool
    correct_answer: Optional[str] = None
    answered_at: datetime
    feedback_message: Optional[str] = None


class MCQSessionResponse(BaseModel):
    session_id: int
    deployment_id: str
    questions: List[Dict[str, Any]]
    total_questions: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    score: Optional[int] = None
    is_completed: bool
    submitted_answers: Optional[List[MCQSubmittedAnswer]] = None
    one_question_at_a_time: bool
    tell_answer_after_each_question: bool
    add_message_after_wrong_answer: bool
    wrong_answer_message: Optional[str] = None
    add_chatbot_after_wrong_answer: bool
    answered_count: int
    next_question_index: Optional[int] = None
    answers_revealed: bool
    allow_retry_wrong_answer: bool

class MCQAnswerRequest(BaseModel):
    question_index: int
    selected_answer: str

class MCQAnswerResponse(BaseModel):
    question_index: int
    selected_answer: str
    is_correct: bool
    correct_answer: Optional[str] = None
    answered_at: datetime
    feedback_message: Optional[str] = None
    chat_available: bool = False
    next_question_index: Optional[int] = None
    answered_count: int
    is_session_completed: bool
    total_questions: int
    answers_revealed: bool
    allow_retry_wrong_answer: bool

class MCQInstructorSessionView(BaseModel):
    session_id: int
    user_email: str
    started_at: datetime
    completed_at: Optional[datetime]
    score: Optional[int]
    total_questions: int
    is_completed: bool
    progress_percentage: float


class MCQChatRequest(BaseModel):
    message: str
    history: List[List[str]] = []


class MCQChatResponse(BaseModel):
    response: str
    sources: Optional[List[str]] = None


class MCQChatHistoryMessage(BaseModel):
    id: int
    message_text: str
    is_user_message: bool
    sources: Optional[List[str]] = None
    created_at: datetime


class MCQChatHistoryResponse(BaseModel):
    conversation_id: Optional[int] = None
    messages: List[MCQChatHistoryMessage] = []
    has_conversation: bool = False


def _serialize_question(mcq_service: "MCQDeployment", question_index: int) -> Dict[str, Any]:
    return {
        "index": question_index,
        "question": mcq_service.get_question_title(question_index),
        "answers": mcq_service.get_question_possible_answers(question_index),
    }


def _serialize_submitted_answer(
    answer: MCQAnswer,
    mcq_service: "MCQDeployment",
    *,
    reveal_answers: bool,
) -> MCQSubmittedAnswer:
    correct_answer = mcq_service.get_question_correct_answer(answer.question_index) if reveal_answers else None
    feedback_message = mcq_service.get_feedback_message_for_answer(
        answer.question_index,
        answer.selected_answer,
    )
    return MCQSubmittedAnswer(
        question_index=answer.question_index,
        selected_answer=answer.selected_answer,
        is_correct=answer.is_correct,
        correct_answer=correct_answer,
        answered_at=answer.answered_at,
        feedback_message=feedback_message,
    )


def _session_indices_valid(
    *,
    session: MCQSession,
    mcq_service: "MCQDeployment",
    answers: List[MCQAnswer],
) -> bool:
    total_questions = len(mcq_service.questions)
    if total_questions <= 0:
        return False

    for idx in session.question_indices:
        if not isinstance(idx, int) or idx < 0 or idx >= total_questions:
            return False

    for answer in answers:
        if answer.question_index < 0 or answer.question_index >= total_questions:
            return False

    return True


def _archive_incompatible_session(session: MCQSession, db: DBSession) -> None:
    logger.warning(
        "Archiving MCQ session %s because stored question indices no longer match deployment",
        session.id,
    )
    db.delete(session)
    db.commit()


def _build_session_payload(
    *,
    deployment_id: str,
    session: MCQSession,
    mcq_service: "MCQDeployment",
    submitted_answers: List[MCQAnswer],
) -> MCQSessionResponse:
    answered_count = len(submitted_answers)
    next_index: Optional[int] = None
    if answered_count < len(session.question_indices):
        next_index = session.question_indices[answered_count]

    answers_revealed = mcq_service.should_reveal_correct_answer(session_completed=session.completed_at is not None)

    serialized_answers = [
        _serialize_submitted_answer(answer, mcq_service, reveal_answers=answers_revealed)
        for answer in submitted_answers
    ]

    questions = [
        _serialize_question(mcq_service, idx)
        for idx in session.question_indices
    ]

    return MCQSessionResponse(
        session_id=session.id,
        deployment_id=deployment_id,
        questions=questions,
        total_questions=session.total_questions,
        started_at=session.started_at,
        completed_at=session.completed_at,
        score=session.score,
        is_completed=session.completed_at is not None,
        submitted_answers=serialized_answers if serialized_answers else None,
        one_question_at_a_time=mcq_service.one_question_at_a_time,
        tell_answer_after_each_question=mcq_service.tell_answer_after_each_question,
        add_message_after_wrong_answer=mcq_service.add_message_after_wrong_answer,
        wrong_answer_message=mcq_service.get_feedback_message(),
        add_chatbot_after_wrong_answer=mcq_service.chatbot_enabled(),
        answered_count=answered_count,
        next_question_index=next_index,
        answers_revealed=answers_revealed,
        allow_retry_wrong_answer=mcq_service.allow_retry_wrong_answer,
    )

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

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service

    if len(mcq_service.questions) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This quiz has no available questions. Please update the deployment before students begin.",
        )

    if existing_session:
        submitted_answers_data = db.exec(
            select(MCQAnswer).where(MCQAnswer.session_id == existing_session.id)
        ).all()
        if not _session_indices_valid(
            session=existing_session,
            mcq_service=mcq_service,
            answers=submitted_answers_data,
        ):
            _archive_incompatible_session(existing_session, db)
            existing_session = None
        else:
            return _build_session_payload(
                deployment_id=deployment_id,
                session=existing_session,
                mcq_service=mcq_service,
                submitted_answers=submitted_answers_data,
            )

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
    
    return _build_session_payload(
        deployment_id=deployment_id,
        session=new_session,
        mcq_service=mcq_service,
        submitted_answers=[],
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

    existing_answers = db.exec(
        select(MCQAnswer).where(MCQAnswer.session_id == session.id).order_by(MCQAnswer.answered_at.asc())
    ).all()

    existing_answer = next(
        (answer for answer in existing_answers if answer.question_index == request.question_index),
        None,
    )

    if existing_answer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Answer already submitted for this question. Cannot resubmit.",
        )

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service

    if not _session_indices_valid(
        session=session,
        mcq_service=mcq_service,
        answers=existing_answers,
    ):
        _archive_incompatible_session(session, db)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The quiz content has changed since you started. Please restart the quiz to continue.",
        )

    total_questions = len(mcq_service.questions)
    if request.question_index < 0 or request.question_index >= total_questions:
        _archive_incompatible_session(session, db)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected question is no longer available. Please restart the quiz.",
        )

    if mcq_service.one_question_at_a_time:
        expected_position = len(existing_answers)
        if expected_position >= len(session.question_indices):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MCQ session already complete.",
            )
        expected_question_index = session.question_indices[expected_position]
        if request.question_index != expected_question_index:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must answer the questions in order.",
            )

    correct_answer = mcq_service.get_question_correct_answer(request.question_index)
    is_correct = request.selected_answer == correct_answer

    allow_retry_wrong_answer = getattr(mcq_service, "allow_retry_wrong_answer", False)

    answers_revealed = mcq_service.should_reveal_correct_answer(
        session_completed=session.completed_at is not None
    )
    feedback_message = mcq_service.get_feedback_message_for_answer(
        request.question_index,
        request.selected_answer,
    )
    chat_available = (not is_correct) and mcq_service.chatbot_enabled()

    if allow_retry_wrong_answer and not is_correct:
        answered_count = len(existing_answers)
        next_question_index = request.question_index if mcq_service.one_question_at_a_time else None
        answer_timestamp = datetime.now(timezone.utc)

        return MCQAnswerResponse(
            question_index=request.question_index,
            selected_answer=request.selected_answer,
            is_correct=is_correct,
            correct_answer=correct_answer if answers_revealed else None,
            answered_at=answer_timestamp,
            feedback_message=feedback_message,
            chat_available=chat_available,
            next_question_index=next_question_index,
            answered_count=answered_count,
            is_session_completed=session.completed_at is not None,
            total_questions=session.total_questions,
            answers_revealed=answers_revealed,
            allow_retry_wrong_answer=allow_retry_wrong_answer,
        )

    # Save the answer
    answer = MCQAnswer(
        session_id=session.id,
        question_index=request.question_index,
        selected_answer=request.selected_answer,
        is_correct=is_correct,
    )

    db.add(answer)

    if len(existing_answers) + 1 == session.total_questions:
        correct_count = sum(1 for a in existing_answers if a.is_correct) + (1 if is_correct else 0)
        session.score = correct_count
        session.completed_at = datetime.now(timezone.utc)
        db.add(session)

    db.commit()
    db.refresh(answer)
    db.refresh(session)

    all_answers = existing_answers + [answer]
    answered_count = len(all_answers)

    next_question_index: Optional[int] = None
    if answered_count < session.total_questions:
        next_question_index = session.question_indices[answered_count]

    return MCQAnswerResponse(
        question_index=request.question_index,
        selected_answer=request.selected_answer,
        is_correct=is_correct,
        correct_answer=correct_answer if answers_revealed else None,
        answered_at=answer.answered_at,
        feedback_message=feedback_message,
        chat_available=chat_available,
        next_question_index=next_question_index,
        answered_count=answered_count,
        is_session_completed=session.completed_at is not None,
        total_questions=session.total_questions,
        answers_revealed=answers_revealed,
        allow_retry_wrong_answer=allow_retry_wrong_answer,
    )


@router.post("/{deployment_id}/mcq/chat", response_model=MCQChatResponse)
async def mcq_chat_after_wrong_answer(
    deployment_id: str,
    request: MCQChatRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.MCQ)
    check_deployment_open(db_deployment)

    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    mcq_service = deployment_mem["mcp_deployment"]._mcq_service

    if mcq_service is None or not mcq_service.chatbot_enabled():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A remediation chatbot is not configured for this deployment.",
        )

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
            detail="No MCQ session found for this deployment.",
        )

    submitted_answers = db.exec(
        select(MCQAnswer)
        .where(MCQAnswer.session_id == session.id)
        .order_by(MCQAnswer.answered_at.asc())
    ).all()

    if not _session_indices_valid(
        session=session,
        mcq_service=mcq_service,
        answers=submitted_answers,
    ):
        _archive_incompatible_session(session, db)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The quiz has been updated. Restart the quiz before using the tutor chat.",
        )

    # Get or create chat conversation for this session
    chat_conversation = db.exec(
        select(MCQChatConversation).where(
            MCQChatConversation.session_id == session.id,
            MCQChatConversation.user_id == current_user.id,
        )
    ).first()

    if not chat_conversation:
        chat_conversation = MCQChatConversation(
            session_id=session.id,
            user_id=current_user.id,
            deployment_id=db_deployment.id,
        )
        db.add(chat_conversation)
        db.commit()
        db.refresh(chat_conversation)

    # Load conversation history from database if not provided
    history_to_use = request.history
    if not history_to_use:
        # Load from database
        stored_messages = db.exec(
            select(MCQChatMessage)
            .where(MCQChatMessage.conversation_id == chat_conversation.id)
            .order_by(MCQChatMessage.created_at.asc())
        ).all()
        
        # Convert to history format [[user_msg, ai_msg], ...]
        history_to_use = []
        for i in range(0, len(stored_messages), 2):
            if i + 1 < len(stored_messages):
                user_msg = stored_messages[i]
                ai_msg = stored_messages[i + 1]
                if user_msg.is_user_message and not ai_msg.is_user_message:
                    history_to_use.append([user_msg.message_text, ai_msg.message_text])

    incorrect_answers = [answer for answer in submitted_answers if not answer.is_correct]

    context_lines: List[str] = []
    if incorrect_answers:
        context_lines.append("Incorrect answers the student has submitted:")
        for idx, answer in enumerate(incorrect_answers, start=1):
            question_text = mcq_service.get_question_title(answer.question_index)
            student_answer = answer.selected_answer or "(no answer provided)"
            correct_answer = mcq_service.get_question_correct_answer(answer.question_index)
            context_lines.append(f"{idx}. Question: {question_text}")
            context_lines.append(f"   Student answer: {student_answer}")
            context_lines.append(f"   Correct answer: {correct_answer}")
    else:
        context_lines.append("The student has not answered any questions incorrectly yet.")

    context_block = "\n".join(context_lines)

    try:
        result = await mcq_service.run_chat(
            message=request.message,
            history=history_to_use,
            user_id=current_user.id,
            context=context_block,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate remediation response: {exc}",
        ) from exc

    # Store the new messages in the database
    user_message = MCQChatMessage(
        conversation_id=chat_conversation.id,
        message_text=request.message,
        is_user_message=True,
    )
    db.add(user_message)

    ai_response = result.get("response", "")
    ai_sources = result.get("sources")
    
    assistant_message = MCQChatMessage(
        conversation_id=chat_conversation.id,
        message_text=ai_response,
        is_user_message=False,
        sources=ai_sources,
    )
    db.add(assistant_message)

    # Update conversation timestamp
    chat_conversation.updated_at = datetime.now(timezone.utc)
    db.add(chat_conversation)
    
    db.commit()

    return MCQChatResponse(
        response=ai_response,
        sources=ai_sources,
    )


@router.get("/{deployment_id}/mcq/chat/history", response_model=MCQChatHistoryResponse)
async def get_mcq_chat_history(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Retrieve the chat conversation history for the current user's MCQ session."""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.MCQ)
    
    # Get the user's MCQ session
    session = db.exec(
        select(MCQSession).where(
            MCQSession.user_id == current_user.id,
            MCQSession.deployment_id == db_deployment.id,
            MCQSession.is_active == True,
        )
    ).first()

    if not session:
        # No session yet, return empty history
        return MCQChatHistoryResponse(
            conversation_id=None,
            messages=[],
            has_conversation=False,
        )

    # Get chat conversation for this session
    chat_conversation = db.exec(
        select(MCQChatConversation).where(
            MCQChatConversation.session_id == session.id,
            MCQChatConversation.user_id == current_user.id,
        )
    ).first()

    if not chat_conversation:
        # No chat conversation yet
        return MCQChatHistoryResponse(
            conversation_id=None,
            messages=[],
            has_conversation=False,
        )

    # Load all messages from the conversation
    stored_messages = db.exec(
        select(MCQChatMessage)
        .where(MCQChatMessage.conversation_id == chat_conversation.id)
        .order_by(MCQChatMessage.created_at.asc())
    ).all()

    message_list = [
        MCQChatHistoryMessage(
            id=msg.id,
            message_text=msg.message_text,
            is_user_message=msg.is_user_message,
            sources=msg.sources,
            created_at=msg.created_at,
        )
        for msg in stored_messages
    ]

    return MCQChatHistoryResponse(
        conversation_id=chat_conversation.id,
        messages=message_list,
        has_conversation=True,
    )


@router.delete("/{deployment_id}/mcq/chat/history")
async def clear_mcq_chat_history(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Clear the chat conversation history for the current user's MCQ session."""
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    validate_deployment_type(db_deployment, DeploymentType.MCQ)
    
    # Get the user's MCQ session
    session = db.exec(
        select(MCQSession).where(
            MCQSession.user_id == current_user.id,
            MCQSession.deployment_id == db_deployment.id,
            MCQSession.is_active == True,
        )
    ).first()

    if not session:
        return {"message": "No session found"}

    # Get chat conversation for this session
    chat_conversation = db.exec(
        select(MCQChatConversation).where(
            MCQChatConversation.session_id == session.id,
            MCQChatConversation.user_id == current_user.id,
        )
    ).first()

    if not chat_conversation:
        return {"message": "No chat history found"}

    # Delete the conversation (cascade will delete messages)
    db.delete(chat_conversation)
    db.commit()

    return {"message": "Chat history cleared successfully"}


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

    submitted_answers_data = db.exec(
        select(MCQAnswer).where(MCQAnswer.session_id == session.id)
    ).all()

    if not _session_indices_valid(
        session=session,
        mcq_service=mcq_service,
        answers=submitted_answers_data,
    ):
        _archive_incompatible_session(session, db)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCQ session is no longer valid. Please start a new session.",
        )

    return _build_session_payload(
        deployment_id=deployment_id,
        session=session,
        mcq_service=mcq_service,
        submitted_answers=submitted_answers_data,
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
