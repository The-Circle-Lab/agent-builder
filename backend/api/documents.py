import os
import uuid
import tempfile
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse
from sqlmodel import Session as DBSession, select
from api.auth import get_current_user
from models.database.db_models import User, Document, Workflow, ClassRole
from database.database import get_session
from scripts.utils import create_qdrant_client, get_user_collection_name
from scripts.permission_helpers import (
    user_can_access_workflow, user_can_modify_workflow, user_has_role_in_class
)
from api.file_storage import store_file, delete_stored_file
import sys

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

router = APIRouter(prefix="/api/documents", tags=["documents"])

# File validation
def validate_file(file: UploadFile) -> bool:
    # Check file extension
    file_ext = Path(file.filename or '').suffix.lower()
    allowed_extensions = set(config.get("document_processing", {}).get("allowed_extensions", []))
    if file_ext not in allowed_extensions:
        return False
    
    # Check MIME type
    allowed_mime_types = set(config.get("document_processing", {}).get("allowed_mime_types", []))
    if file.content_type not in allowed_mime_types:
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
    
    max_files = config.get("document_processing", {}).get("max_files_per_upload", 10)
    if len(files) > max_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {max_files} files allowed per upload"
        )
    
    # Verify workflow exists and user has access
    workflow = db.get(Workflow, workflow_id)
    if not workflow or not workflow.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )
    
    # Check if user can modify this workflow (must be instructor in class)
    if not user_can_modify_workflow(current_user, workflow, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors of this class can upload documents to workflows"
        )
    
    # Stage files to temporary locations accessible by the Celery worker, then dispatch async task
    staged_files: list[dict] = []
    temp_files: list[str] = []
    try:
        for file in files:
            # Validate file
            if not validate_file(file):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid file type: {file.filename}. Only PDF, DOC, DOCX allowed."
                )
            # Check file size
            file_content = await file.read()
            max_file_size_mb = config.get("document_processing", {}).get("max_file_size_mb", 20)
            max_file_size = max_file_size_mb * 1024 * 1024
            if len(file_content) > max_file_size:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File {file.filename} exceeds {max_file_size_mb}MB limit"
                )

            # Write to temp file for the worker to pick up (use shared temp dir from config)
            temp_dir = Path(config.get("paths", {}).get("uploads_temp_dir", "./temp"))
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_path = temp_dir / f"upload_{uuid.uuid4().hex[:8]}_{Path(file.filename or '').name}"
            with open(temp_path, 'wb') as tf:
                tf.write(file_content)
            temp_files.append(str(temp_path))
            staged_files.append({
                'temp_path': str(temp_path),
                'filename': file.filename,
                'content_type': file.content_type or ''
            })

        # Enqueue Celery task
        from services.celery_tasks import process_document_uploads_task
        async_result = process_document_uploads_task.delay(
            workflow_id=workflow.id,
            user_id=current_user.id,
            files=staged_files,
        )

        # Return task id for client polling
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                'message': 'Upload accepted for processing',
                'task_id': async_result.id,
            }
        )
    except HTTPException:
        # If validation error, clean staged temps
        for p in temp_files:
            try:
                os.unlink(p)
            except OSError:
                pass
        raise
    except Exception as e:
        for p in temp_files:
            try:
                os.unlink(p)
            except OSError:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enqueue document processing: {str(e)}"
        )

@router.get("/workflows/{workflow_id}/documents")
async def list_workflow_documents(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Verify workflow exists and user has access
        workflow = db.get(Workflow, workflow_id)
        if not workflow or not workflow.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        
        # Check if user can access this workflow (class membership based)
        if not user_can_access_workflow(current_user, workflow, db):
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
                "collection_name": doc.collection_name,
                "has_stored_file": doc.storage_path is not None,
                "can_view": doc.storage_path is not None  # Indicates if file can be viewed/downloaded
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
                Document.is_active == True
            )
        ).first()
        
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        # Get the workflow to check class permissions
        workflow = db.get(Workflow, document.workflow_id)
        if not workflow or not workflow.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated workflow not found"
            )
        
        # Check if user can modify this workflow (must be instructor in class)
        if not user_can_modify_workflow(current_user, workflow, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors of this class can delete documents"
            )
        
        # Initialize Qdrant client
        qdrant_client = create_qdrant_client()
        
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
        
        # Delete stored file from disk if it exists
        if document.storage_path:
            try:
                delete_stored_file(document.storage_path)
            except Exception as storage_error:
                print(f"Warning: Failed to delete stored file: {storage_error}")
        
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
        user_collection = get_user_collection_name(collection_name, current_user.id)
        
        # Find all documents in the collection
        documents = db.exec(
            select(Document).where(
                Document.user_collection_name == user_collection,
                Document.is_active == True
            )
        ).all()
        
        if not documents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Collection not found or already empty"
            )
        
        # Check if user can modify workflows that contain these documents
        workflow_ids = set(doc.workflow_id for doc in documents if doc.workflow_id)
        for workflow_id in workflow_ids:
            workflow = db.get(Workflow, workflow_id)
            if workflow and workflow.is_active:
                if not user_can_modify_workflow(current_user, workflow, db):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Only instructors of the class can delete collections"
                    )
        
        # Initialize Qdrant client
        qdrant_client = create_qdrant_client()
        
        # Delete the entire collection from Qdrant
        try:
            qdrant_client.delete_collection(collection_name=user_collection)
        except Exception as qdrant_error:
            print(f"Warning: Failed to delete collection from Qdrant: {qdrant_error}")
        
        # Delete stored files and mark all documents as inactive
        document_count = len(documents)
        total_chunks = sum(doc.chunk_count for doc in documents)
        
        for doc in documents:
            # Delete stored file from disk if it exists
            if doc.storage_path:
                try:
                    delete_stored_file(doc.storage_path)
                except Exception as storage_error:
                    print(f"Warning: Failed to delete stored file {doc.original_filename}: {storage_error}")
            
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


@router.get("/upload/status/{task_id}")
async def get_upload_status(task_id: str):
    """Poll the status of an async document upload task."""
    from services.celery_tasks import celery_app
    from celery.result import AsyncResult

    try:
        result = AsyncResult(task_id, app=celery_app)
        state = result.state
        info = result.info if isinstance(result.info, dict) else {}

        if state == 'PENDING':
            return { 'state': state, 'status': 'Pending', 'progress': 0, 'stage': 'pending' }
        if state == 'PROGRESS':
            return {
                'state': state,
                'status': info.get('status', 'Processing...'),
                'progress': info.get('progress', 0),
                'stage': info.get('stage', 'processing'),
            }
        if state == 'SUCCESS':
            return {
                'state': state,
                'status': 'Completed',
                'result': result.result,
                'progress': 100,
                'stage': 'completed',
            }
        if state == 'FAILURE':
            return {
                'state': state,
                'status': str(result.info),
                'error': str(result.info),
                'progress': 0,
                'stage': 'failed',
            }
        return { 'state': state, 'status': 'Unknown', 'progress': 0, 'stage': 'unknown' }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching task status: {e}")
