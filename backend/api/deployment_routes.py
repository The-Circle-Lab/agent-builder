from fastapi import APIRouter

# Import all sub-router modules
from .deployments.deployment_core_routes import router as core_router
from .deployments.deployment_chat_routes import router as chat_router
from .deployments.deployment_code_routes import router as code_router
from .deployments.deployment_mcq_routes import router as mcq_router
from .deployments.deployment_prompt_routes import router as prompt_router
from .deployments.deployment_grade_routes import router as grade_router
from .deployments.deployment_page_routes import router as page_router
from .deployments.deployment_live_presentation_routes import router as live_presentation_router

router = APIRouter(prefix="/api/deploy", tags=["deployment"])

# Include all sub-routers
router.include_router(core_router)
router.include_router(chat_router)
router.include_router(code_router)
router.include_router(mcq_router)
router.include_router(prompt_router)
router.include_router(grade_router)
router.include_router(page_router)
router.include_router(live_presentation_router)
