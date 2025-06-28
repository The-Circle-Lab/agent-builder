from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from database.database import init_db, shutdown_db
from api.auth import router as auth_router, get_current_user
from api.workflow_api import router as workflow_router
from api.document_api import router as document_router
from api.deployment_routes import router as deployment_router
from services.deployment_manager import cleanup_all_deployments
from models.db_models import User
from contextlib import asynccontextmanager
import logging
from datetime import datetime
from pathlib import Path
from scripts.config import load_config

# Load config
config = load_config()

# Setup logging
logs_dir = Path(__file__).parent / config.get("paths", {}).get("logs_dir", "logs")
logs_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=getattr(logging, config.get("app", {}).get("log_level", "INFO")),
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(logs_dir / datetime.now().strftime(config.get("app", {}).get("log_file_pattern", "api_%Y%m%d.log"))),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    logger.info("Database initialized")
    
    yield
    # Shutdown
    await cleanup_all_deployments()
    logger.info("MCP deployments cleaned up")
    shutdown_db()
    logger.info("Database connections closed")

app = FastAPI(
    title=config.get("app", {}).get("name", "Agent Builder Backend"),
    lifespan=lifespan
)

# Add session middleware
app.add_middleware(
    SessionMiddleware, 
    secret_key=config.get("auth", {}).get("secret_key")
)

# Add CORS middleware
cors_config = config.get("server", {}).get("cors", {})
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_config.get("origins", ["http://localhost:3000"]),
    allow_credentials=cors_config.get("allow_credentials", True),
    allow_methods=cors_config.get("allow_methods", ["*"]),
    allow_headers=cors_config.get("allow_headers", ["*"]),
)
app.include_router(auth_router)
app.include_router(workflow_router)
app.include_router(document_router)
app.include_router(deployment_router)

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/me")
def me(user = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}
