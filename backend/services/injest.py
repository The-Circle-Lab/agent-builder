import pathlib
import uuid
from pathlib import Path
import sys

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings  # local model
from langchain_community.vectorstores import Qdrant

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

# 1. Load one or many course files
def load_docs(files):
    docs = []
    for f in files:
        if f.suffix.lower() == ".pdf":
            docs += PyPDFLoader(str(f)).load()
        elif f.suffix.lower() in {".docx", ".doc"}:
            docs += Docx2txtLoader(str(f)).load()
    return docs

docs_path = pathlib.Path(__file__).parent / "docs"
print(f"Looking for documents in: {docs_path}")
print(f"Directory exists: {docs_path.exists()}")

files = list(docs_path.glob("*"))
print(f"Files found: {[f.name for f in files]}")

raw_docs = load_docs(files)
print(f"Documents loaded: {len(raw_docs)}")

if not raw_docs:
    print("No documents were loaded!")
    exit(1)

# 2. Chunk them (tweak chunk_size / overlap for your content)
splitter = RecursiveCharacterTextSplitter(
    chunk_size=800, chunk_overlap=100, add_start_index=True
)
chunks = splitter.split_documents(raw_docs)
print(f"Chunks created: {len(chunks)}")

if not chunks:
    print("No chunks were created")
    exit(1)

# 3. Embeddings
embeddings = FastEmbedEmbeddings()   # ~BAAI/bge-small-en-v1.5 under the hood

# 4. Persist to Qdrant (collection per course keeps things tidy)
vector_store = Qdrant.from_documents(
    documents=chunks,
    embedding=embeddings,
    url=config.get("qdrant", {}).get("url", "http://localhost:6333"),
    prefer_grpc=False,              # HTTP is fine for local dev
    collection_name="data_structures",  # change per course
    ids=[str(uuid.uuid4()) for _ in chunks],
)
print(f"Ingested {len(chunks)} chunks")
