from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession

from database.database import get_session
from api.auth import get_current_user
from models.db_models import User, Problem, ClassRole
from services.summary_agent import SummaryAgent
from scripts.permission_helpers import user_has_role_in_class

router = APIRouter(prefix="/api/summary", tags=["summary"])

@router.get("/problem/{problem_id}/summary")
async def get_problem_summary(
    problem_id: int,
    llm_model: str = "gpt-3.5-turbo",
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    try:
        problem: Problem | None = db.get(Problem, problem_id)
        if not problem:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Problem not found",
            )

        # Check that the requesting user is an instructor in the owning class
        if not user_has_role_in_class(current_user, problem.class_id, ClassRole.INSTRUCTOR, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors can retrieve cohort summaries",
            )

        # Create SummaryAgent and generate summary
        agent = SummaryAgent(db)
        summary_text = await agent.generate_llm_summary(problem_id, llm_model=llm_model)

        # Compute basic metrics (median attempts) for context
        median_attempts = agent.compute_median_attempts(problem_id)

        return {
            "short_summary": summary_text,
            "detailed_breakdown": summary_text,
            "median_attempts": median_attempts,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate summary: {exc}",
        ) 
