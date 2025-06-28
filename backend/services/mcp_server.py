from pathlib import Path
from typing import Annotated, List

from langchain_community.vectorstores import Qdrant
from langchain_community.embeddings import FastEmbedEmbeddings
from qdrant_client import QdrantClient

from fastmcp import FastMCP

# server
mcp = FastMCP("agent-server")

EMBED = FastEmbedEmbeddings()
from pathlib import Path
import sys

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

# cached retriever for course
retriever_cache: dict[str, Qdrant] = {}

def get_retriever(course_id: str) -> Qdrant:
    if course_id not in retriever_cache:
        # Create Qdrant client first
        qdrant_client = QdrantClient(url=config.get("qdrant", {}).get("url", "http://localhost:6333"))
        
        # Check if collection exists
        try:
            collections = qdrant_client.get_collections()
            collection_names = [col.name for col in collections.collections]
            
            if course_id not in collection_names:
                print(f"Collection '{course_id}' does not exist in Qdrant")
                return None
        except Exception as e:
            print(f"Error checking collections in Qdrant: {e}")
            return None
        
        # Create Qdrant vector store using client
        try:
            retriever_cache[course_id] = Qdrant(
                client=qdrant_client,
                collection_name=course_id,
                embeddings=EMBED,
            )
        except Exception as e:
            print(f"Error creating Qdrant retriever for collection '{course_id}': {e}")
            return None
            
    return retriever_cache[course_id]

# document retriever
@mcp.tool()
async def search_documents(
    collection_id: Annotated[str, "Document collection name, e.g. workflow_myproject_123"],
    query:         Annotated[str, "Natural-language question to search for"],
    k:             Annotated[int, "Number of passages to return"] = 4,
) -> List[dict]:
    try:
        print(f"Searching collection '{collection_id}' for query: '{query}'")
        
        retriever = get_retriever(collection_id)
        if retriever is None:
            print(f"No retriever available for collection '{collection_id}'")
            return [{"error": f"Collection '{collection_id}' not found or unavailable"}]
        
        docs = retriever.similarity_search(query, k=k)
        # format what the LLM needs (text + citation data)
        res = [
            {
                "text": d.page_content,
                "source": d.metadata.get("source"),
                "page": d.metadata.get("page"),
            }
            for d in docs
        ]
        print(f"Document search results for '{collection_id}': {len(res)} documents found")
        return res
    except Exception as e:
        error_msg = f"Failed to search documents in collection '{collection_id}': {str(e)}"
        print(error_msg)
        return [{"error": error_msg}]

if __name__ == "__main__":
    mcp.run(transport="stdio") 
