from sqlmodel import SQLModel, create_engine, Session
import sys
from pathlib import Path

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

engine = create_engine(
    config.get("database", {}).get("url", "sqlite:///./database/app.db"), 
    connect_args=config.get("database", {}).get("connect_args", {})
)


def get_session():
    with Session(engine) as session:
        yield session


def init_db():
    SQLModel.metadata.create_all(engine)


def shutdown_db():
    engine.dispose()
