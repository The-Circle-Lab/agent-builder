from fastapi import FastAPI, Depends, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from database.database import init_db, shutdown_db
from api.auth import router as auth_router, get_current_user
from api.workflow_api import router as workflow_router
from api.document_api import router as document_router
from api.deployment_routes import router as deployment_router
from api.class_api import router as class_router
from services.deployment_manager import cleanup_all_deployments
from models.db_models import User
from contextlib import asynccontextmanager
import logging
from datetime import datetime
from pathlib import Path
from scripts.config import load_config
import os

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
    expose_headers=["*"],  # Add this for WebSocket
)
app.include_router(auth_router)
app.include_router(class_router)
app.include_router(workflow_router)
app.include_router(document_router)
app.include_router(deployment_router)

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/me")
def me(user = Depends(get_current_user)):
    # Get user's roles from class memberships
    from database.database import get_session
    from scripts.permission_helpers import user_is_student_only
    from sqlmodel import Session as DBSession
    
    db: DBSession = next(get_session())
    is_student = user_is_student_only(user, db)
    db.close()
    
    return {"id": user.id, "email": user.email, "student": is_student}

# Test WebSocket endpoint
@app.websocket("/ws/test")
async def websocket_test(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_text("Test WebSocket connection successful!")
    await websocket.close()

if __name__ == "__main__":
    import uvicorn
    import sys
    
    # Check if running with uvicorn command (don't start server in that case)
    if "uvicorn" not in sys.modules:
        # Load configuration for server settings
        config = load_config()
        
        # Get server settings
        host = config.get("server", {}).get("host", "0.0.0.0")
        port = config.get("server", {}).get("port", 8000)
        reload = os.getenv("ENV", "development") == "development"
        
        # Run the server with WebSocket support
        uvicorn.run(
            "main:app",
            host=host,
            port=port,
            reload=reload,
            ws_ping_interval=30,  # WebSocket ping interval
            ws_ping_timeout=10,   # WebSocket ping timeout
            access_log=True,
            log_level="info"
        )
