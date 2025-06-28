from qdrant_client import QdrantClient
from typing import Optional
from scripts.config import load_config

# Load config once
_config = load_config()

# Create a QdrantClient instance
def create_qdrant_client() -> QdrantClient:
    return QdrantClient(
        url=_config.get("qdrant", {}).get("url", "http://localhost:6333"),
        prefer_grpc=_config.get("qdrant", {}).get("prefer_grpc", False)
    )

# Generate a user-specific collection name
def get_user_collection_name(collection_id: str, user_id: int) -> str:
    return f"{collection_id}_{user_id}" 
