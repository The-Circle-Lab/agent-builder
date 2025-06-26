from fastapi import FastAPI, Depends
from pydantic import BaseModel
from langchain_qdrant import QdrantVectorStore
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain.chains import ConversationalRetrievalChain
from langchain_google_vertexai import VertexAI
from qdrant_client import QdrantClient
import os

app = FastAPI()
EMBED = FastEmbedEmbeddings()

# Initialize Vertex AI LLM
LLM = VertexAI(
    model_name="gemini-2.5-flash",
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
    streaming=True
)

def get_store(course_id:str):
    client = QdrantClient(
        url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        prefer_grpc=False,
    )
    return QdrantVectorStore(
        client=client,
        collection_name=course_id,
        embedding=EMBED,
    )

class ChatRequest(BaseModel):
    course_id: str
    question : str
    history  : list[tuple[str,str]] = []

@app.post("/chat")
async def chat(req: ChatRequest):
    retriever = get_store(req.course_id).as_retriever(
        search_kwargs={"k": 5}
    )
    chain = ConversationalRetrievalChain.from_llm(
        llm=LLM,
        retriever=retriever,
        return_source_documents=True,
    )
    result = await chain.ainvoke({"question": req.question, "chat_history": req.history})
    return {
        "answer": result["answer"],
        "sources": [doc.metadata.get("source") for doc in result["source_documents"]],
    }
