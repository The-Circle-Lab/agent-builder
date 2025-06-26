from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from services.chat_api import ChatRequest, chat, get_store, LLM, EMBED
from database.database import init_db, shutdown_db
from services.auth import router as auth_router, get_current_user
from services.workflow_api import router as workflow_router
from services.document_api import router as document_router
from services.deployment_mcp_api import router as deployment_router, cleanup_all_deployments
from database.db_models import User, Workflow, Document, AuthSession, Class, ClassMembership
from contextlib import asynccontextmanager
import logging
from datetime import datetime
from pathlib import Path
import os


logs_dir = Path(__file__).parent / 'logs'
logs_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(logs_dir / f'api_{datetime.now().strftime("%Y%m%d")}.log'),
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

app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=os.getenv("AUTH_SECRET_KEY")) 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(workflow_router)
app.include_router(document_router)
app.include_router(deployment_router)

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    return await chat(req)

@app.get("/me")
def me(user = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}
