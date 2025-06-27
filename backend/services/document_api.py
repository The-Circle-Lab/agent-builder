import os
import uuid
import tempfile
import shutil
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse
from sqlmodel import Session as DBSession, select
from services.auth import get_current_user
from database.db_models import User, Document, Workflow
from database.database import get_session
from dotenv import load_dotenv

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant
from qdrant_client import QdrantClient

load_dotenv()

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Security settings
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.doc'}
ALLOWED_MIME_TYPES = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
}

# Security Check
def validate_file(file: UploadFile) -> bool:
    # Check file extension
    file_ext = Path(file.filename or '').suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return False
    
    # Check MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        return False
    
    return True

def load_document(file_path: Path) -> List:
    docs = []
    try:
        if file_path.suffix.lower() == ".pdf":
            docs = PyPDFLoader(str(file_path)).load()
        elif file_path.suffix.lower() in {".docx", ".doc"}:
            docs = Docx2txtLoader(str(file_path)).load()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to load document: {str(e)}"
        )
    return docs

# Upload and injest document into vector store
# supports pdf doc docx
# max 10mb
# creates embedding and stores into qdrant
@router.post("/upload")
async def upload_documents(
    files: List[UploadFile] = File(...),
    workflow_id: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):  
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )
    
    if len(files) > 10:  # Limit number of files
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 files allowed per upload"
        )
    
    # Verify workflow exists and user has access
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )
    
    if workflow.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workflow"
        )
    
    processed_files = []
    temp_files = []
    all_chunks = []
    
    try:
        # Process each uploaded file
        for file in files:
            # Validate file
            if not validate_file(file):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid file type: {file.filename}. Only PDF, DOC, DOCX allowed."
                )
            
            # Check file size
            file_content = await file.read()
            if len(file_content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File {file.filename} exceeds 10MB limit"
                )
            
            # Create temporary file with secure name
            temp_file = tempfile.NamedTemporaryFile(
                delete=False,
                suffix=Path(file.filename or '').suffix.lower(),
                prefix=f"upload_{uuid.uuid4().hex[:8]}_"
            )
            
            # Write content to temp file
            temp_file.write(file_content)
            temp_file.close()
            temp_files.append(temp_file.name)
            
            # Load document
            docs = load_document(Path(temp_file.name))
            if not docs:
                continue
                
            # Split into chunks
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=800,
                chunk_overlap=100,
                add_start_index=True
            )
            chunks = splitter.split_documents(docs)
            
            # Generate unique upload ID for this document
            upload_id = str(uuid.uuid4())
            
            # Add metadata
            for chunk in chunks:
                chunk.metadata.update({
                    'user_id': current_user.id,
                    'filename': file.filename,
                    'source': file.filename,  # Override the temporary filename with original
                    'upload_id': upload_id
                })
            
            all_chunks.extend(chunks)
            processed_files.append({
                'filename': file.filename,
                'upload_id': upload_id,
                'chunks': len(chunks),
                'size': len(file_content),
                'file_type': Path(file.filename or '').suffix.lower().lstrip('.')
            })
        
        if not all_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No content could be extracted from uploaded files"
            )
        
        # Create embeddings and store in Qdrant
        embeddings = FastEmbedEmbeddings()
        
        # Use workflow-specific collection name
        user_collection = f"{workflow.workflow_collection_id}_{current_user.id}"
        
        vector_store = Qdrant.from_documents(
            documents=all_chunks,
            embedding=embeddings,
            url=os.getenv("QDRANT_URL"),
            prefer_grpc=False,
            collection_name=user_collection,
            ids=[str(uuid.uuid4()) for _ in all_chunks],
        )
        
        # Save document metadata to database
        saved_documents = []
        for file_info in processed_files:
            document = Document(
                filename=file_info['filename'],
                original_filename=file_info['filename'],
                file_size=file_info['size'],
                file_type=file_info['file_type'],
                collection_name=workflow.workflow_collection_id,
                user_collection_name=user_collection,
                upload_id=file_info['upload_id'],
                chunk_count=file_info['chunks'],
                uploaded_by_id=current_user.id,
                workflow_id=workflow.id
            )
            db.add(document)
            saved_documents.append(document)
        
        db.commit()
        
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "message": "Documents uploaded and ingested successfully",
                "workflow_id": workflow.id,
                "workflow_name": workflow.name,
                "collection_name": user_collection,
                "total_chunks": len(all_chunks),
                "files_processed": processed_files
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document processing failed: {str(e)}"
        )
    finally:
        # Clean up temporary files
        for temp_file in temp_files:
            try:
                os.unlink(temp_file)
            except OSError:
                pass  # File already deleted or doesn't exist

@router.get("/workflows/{workflow_id}/documents")
async def list_workflow_documents(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Verify workflow exists and user has access
        workflow = db.get(Workflow, workflow_id)
        if not workflow:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        
        if workflow.created_by_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this workflow"
            )
        
        documents = db.exec(
            select(Document).where(
                Document.workflow_id == workflow_id,
                Document.uploaded_by_id == current_user.id,
                Document.is_active == True
            ).order_by(Document.uploaded_at.desc())
        ).all()
        
        document_list = []
        for doc in documents:
            document_list.append({
                "id": doc.id,
                "filename": doc.original_filename,
                "file_size": doc.file_size,
                "file_type": doc.file_type,
                "chunk_count": doc.chunk_count,
                "upload_id": doc.upload_id,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "collection_name": doc.collection_name
            })
        
        return {
            "workflow_id": workflow_id,
            "workflow_name": workflow.name,
            "workflow_collection_id": workflow.workflow_collection_id,
            "document_count": len(document_list),
            "documents": document_list
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list documents: {str(e)}"
        )

# Get users docs
@router.get("/collections")
async def list_collections(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Get all collections for the user
        documents = db.exec(
            select(Document).where(
                Document.uploaded_by_id == current_user.id,
                Document.is_active == True
            )
        ).all()
        
        # Group by collection name
        collections = {}
        for doc in documents:
            if doc.collection_name not in collections:
                collections[doc.collection_name] = {
                    "collection_name": doc.collection_name,
                    "user_collection_name": doc.user_collection_name,
                    "document_count": 0,
                    "total_chunks": 0,
                    "last_uploaded": None
                }
            
            collections[doc.collection_name]["document_count"] += 1
            collections[doc.collection_name]["total_chunks"] += doc.chunk_count
            
            if (collections[doc.collection_name]["last_uploaded"] is None or 
                doc.uploaded_at > collections[doc.collection_name]["last_uploaded"]):
                collections[doc.collection_name]["last_uploaded"] = doc.uploaded_at.isoformat()
        
        return {
            "collections": list(collections.values())
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list collections: {str(e)}"
        )

# Remove single doc from collection
@router.delete("/documents/{document_id}")
async def remove_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Find the document
        document = db.exec(
            select(Document).where(
                Document.id == document_id,
                Document.uploaded_by_id == current_user.id,
                Document.is_active == True
            )
        ).first()
        
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        # Initialize Qdrant client
        qdrant_client = QdrantClient(url=os.getenv("QDRANT_URL"))
        
        # Remove document chunks from Qdrant using upload_id filter
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            
            qdrant_client.delete(
                collection_name=document.user_collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="upload_id",
                            match=MatchValue(value=document.upload_id)
                        )
                    ]
                )
            )
        except Exception as qdrant_error:
            # Log the error but don't fail the operation if Qdrant deletion fails
            print(f"Warning: Failed to delete from Qdrant: {qdrant_error}")
        
        # Mark document as inactive (soft delete)
        document.is_active = False
        db.add(document)
        db.commit()
        
        return {
            "message": f"Document '{document.original_filename}' removed successfully",
            "document_id": document_id,
            "filename": document.original_filename,
            "chunks_removed": document.chunk_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove document: {str(e)}"
        )

@router.delete("/collections/{collection_name}")
async def delete_collection(
    collection_name: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        user_collection = f"{collection_name}_{current_user.id}"
        
        # Find all documents in the collection
        documents = db.exec(
            select(Document).where(
                Document.user_collection_name == user_collection,
                Document.uploaded_by_id == current_user.id,
                Document.is_active == True
            )
        ).all()
        
        if not documents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Collection not found or already empty"
            )
        
        # Initialize Qdrant client
        qdrant_client = QdrantClient(url=os.getenv("QDRANT_URL"))
        
        # Delete the entire collection from Qdrant
        try:
            qdrant_client.delete_collection(collection_name=user_collection)
        except Exception as qdrant_error:
            print(f"Warning: Failed to delete collection from Qdrant: {qdrant_error}")
        
        # Mark all documents as inactive
        document_count = len(documents)
        total_chunks = sum(doc.chunk_count for doc in documents)
        
        for doc in documents:
            doc.is_active = False
            db.add(doc)
        
        db.commit()
        
        return {
            "message": f"Collection '{collection_name}' deleted successfully",
            "collection_name": collection_name,
            "documents_removed": document_count,
            "total_chunks_removed": total_chunks
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete collection: {str(e)}"
        ) 
