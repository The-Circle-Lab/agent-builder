from pathlib import Path
from typing import Annotated, List
import os, uuid, asyncio, json
import math

from langchain_community.vectorstores import Qdrant
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from qdrant_client import QdrantClient

from fastmcp import FastMCP

# server
mcp = FastMCP("agent-server")          # Extended server with multiple tools

EMBED = FastEmbedEmbeddings()
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

# cached retriever for course
retriever_cache: dict[str, Qdrant] = {}

def get_retriever(course_id: str) -> Qdrant:
    if course_id not in retriever_cache:
        # Create Qdrant client first
        qdrant_client = QdrantClient(url=QDRANT_URL)
        
        # Create Qdrant vector store using client
        retriever_cache[course_id] = Qdrant(
            client=qdrant_client,
            collection_name=course_id,
            embeddings=EMBED,
        )
    return retriever_cache[course_id]

# document retriever
@mcp.tool()
async def search_documents(
    collection_id: Annotated[str, "Document collection name, e.g. workflow_myproject_123"],
    query:         Annotated[str, "Natural-language question to search for"],
    k:             Annotated[int, "Number of passages to return"] = 4,
) -> List[dict]:
    try:
        docs = get_retriever(collection_id).similarity_search(query, k=k)
        # format what the LLM needs (text + citation data)
        return [
            {
                "text": d.page_content,
                "source": d.metadata.get("source"),
                "page": d.metadata.get("page"),
            }
            for d in docs
        ]
    except Exception as e:
        return [{"error": f"Failed to search documents: {str(e)}"}]

if __name__ == "__main__":
    mcp.run(transport="stdio") 
