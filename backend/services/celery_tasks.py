import os
from celery import Celery
from database.database import get_session
from services.summary_agent import SummaryAgent

# Configure Celery
broker_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
result_backend = os.getenv("CELERY_RESULT_BACKEND", broker_url)

celery_app = Celery("agent_tasks", broker=broker_url, backend=result_backend)


@celery_app.task(name="embed_analyses_to_qdrant")
def embed_analyses_to_qdrant_task(problem_id: int):
    try:
        with get_session() as db:
            agent = SummaryAgent(db)
            agent.embed_analyses_to_qdrant(problem_id)
    except Exception as exc:
        print(f"[Celery] embed_analyses_to_qdrant_task failed for problem {problem_id}: {exc}") 
