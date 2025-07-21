import os
import shutil
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlmodel import Session as DBSession, select
from api.auth import get_current_user
from models.database.db_models import User, Document, Workflow
from database.database import get_session
from scripts.permission_helpers import user_can_access_workflow
import sys

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

router = APIRouter(prefix="/api/files", tags=["file_storage"])

# Storage configuration
STORAGE_BASE_DIR = Path(config.get("file_storage", {}).get("base_directory", "uploads"))
ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx'}

# Ensure the storage directory exists
def ensure_storage_directory():
    STORAGE_BASE_DIR.mkdir(parents=True, exist_ok=True)

# Generate the storage path for a file organized by workflow
def get_file_storage_path(workflow_id: int, upload_id: str, filename: str) -> Path:
    ensure_storage_directory()
    # Organize files by workflow_id/upload_id/filename
    file_path = STORAGE_BASE_DIR / str(workflow_id) / upload_id / filename
    file_path.parent.mkdir(parents=True, exist_ok=True)
    return file_path

# Store file content to disk and return the storage path
def store_file(file_content: bytes, workflow_id: int, upload_id: str, filename: str) -> str:
    try:
        file_path = get_file_storage_path(workflow_id, upload_id, filename)
        
        # Write file content to disk
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # Return relative path from storage base
        return str(file_path.relative_to(STORAGE_BASE_DIR))
        
    except Exception as e:
        raise Exception(f"Failed to store file {filename}: {str(e)}")

# Delete a stored file from disk
def delete_stored_file(storage_path: str) -> bool:
    try:
        full_path = STORAGE_BASE_DIR / storage_path
        if full_path.exists():
            full_path.unlink()
            
            # Remove empty parent directories
            try:
                full_path.parent.rmdir()  # Remove upload_id directory if empty
                full_path.parent.parent.rmdir()  # Remove workflow_id directory if empty
            except OSError:
                pass  # Directories not empty, which is fine
            
            return True
        return False
    except Exception:
        return False

# Delete all files for a specific workflow
def delete_workflow_files(workflow_id: int) -> int:
    try:
        workflow_dir = STORAGE_BASE_DIR / str(workflow_id)
        if workflow_dir.exists():
            file_count = sum(1 for f in workflow_dir.rglob('*') if f.is_file())
            shutil.rmtree(workflow_dir)
            return file_count
        return 0
    except Exception:
        return 0

# View a document file
@router.get("/view/{document_id}")
async def view_document(
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
        
        # Get the workflow to check permissions
        workflow = db.get(Workflow, document.workflow_id)
        if not workflow or not workflow.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated workflow not found"
            )
        
        # Check if user can access this workflow (class membership based)
        if not user_can_access_workflow(current_user, workflow, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You must be a member of this class to view this document"
            )
        
        # Check if file exists on disk
        if not document.storage_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found on storage"
            )
        
        full_path = STORAGE_BASE_DIR / document.storage_path
        if not full_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found on disk"
            )
        
        # Determine media type based on file extension
        media_type_map = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
        
        file_ext = Path(document.original_filename).suffix.lower()
        media_type = media_type_map.get(file_ext, 'application/octet-stream')
        
        return FileResponse(
            path=str(full_path),
            filename=document.original_filename,
            media_type=media_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{document.original_filename}\"",
                "Cache-Control": "private, max-age=3600"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve document: {str(e)}"
        )

# Download a document file
@router.get("/download/{document_id}")
async def download_document(
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
        
        # Get the workflow to check permissions
        workflow = db.get(Workflow, document.workflow_id)
        if not workflow or not workflow.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated workflow not found"
            )
        
        # Check if user can access this workflow (class membership based)
        if not user_can_access_workflow(current_user, workflow, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You must be a member of this class to download this document"
            )
        
        # Check if file exists on disk
        if not document.storage_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found on storage"
            )
        
        full_path = STORAGE_BASE_DIR / document.storage_path
        if not full_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found on disk"
            )
        
        return FileResponse(
            path=str(full_path),
            filename=document.original_filename,
            media_type='application/octet-stream',
            headers={
                "Content-Disposition": f"attachment; filename=\"{document.original_filename}\""
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download document: {str(e)}"
        )
