from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, Session as DBSession
from database.db_models import User, Workflow, Class, Document
from database.database import get_session
from services.auth import get_current_user
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from scripts.utils import create_qdrant_client
import sys

# Add parent directory to path to import from config
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config

# Load config
config = load_config()

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    workflow_data: Dict[str, Any]

class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    workflow_data: Optional[Dict[str, Any]] = None

class WorkflowResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    workflow_data: Dict[str, Any]
    workflow_collection_id: str
    created_at: datetime
    updated_at: datetime

@router.get("/", response_model=List[WorkflowResponse])
def get_user_workflows(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    workflows = db.exec(
        select(Workflow).where(Workflow.created_by_id == current_user.id)
    ).all()
    return workflows

@router.post("/", response_model=WorkflowResponse)
def create_workflow(
    request: WorkflowCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get or create default class
    default_class = db.exec(select(Class).where(Class.code == "DEFAULT")).first()
    if not default_class:
        # Create default class if it doesn't exist
        default_class = Class(
            code="DEFAULT",
            name="Default Class",
            description="Default class for workflows",
            admin_id=current_user.id
        )
        db.add(default_class)
        db.commit()
        db.refresh(default_class)
    
    workflow = Workflow(
        name=request.name,
        description=request.description,
        workflow_data=request.workflow_data,
        created_by_id=current_user.id,
        class_id=default_class.id
    )
    
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow

@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    if workflow.created_by_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    
    return workflow

@router.put("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: int,
    request: WorkflowUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    if workflow.created_by_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    
    if request.name is not None:
        workflow.name = request.name
    if request.description is not None:
        workflow.description = request.description
    if request.workflow_data is not None:
        workflow.workflow_data = request.workflow_data
    
    workflow.updated_at = datetime.now(timezone.utc)
    
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow

@router.delete("/{workflow_id}")
def delete_workflow(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    if workflow.created_by_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    
    # Delete associated document collection
    user_collection_name = f"{workflow.workflow_collection_id}_{current_user.id}"
    
    try:
        # Find all documents in this workflow's collection
        documents = db.exec(
            select(Document).where(
                Document.workflow_id == workflow_id,
                Document.uploaded_by_id == current_user.id,
                Document.is_active == True
            )
        ).all()
        
        documents_deleted = len(documents)
        total_chunks_deleted = sum(doc.chunk_count for doc in documents)
        
        # Delete from Qdrant if documents exist
        if documents:
            try:
                qdrant_client = create_qdrant_client()
                qdrant_client.delete_collection(collection_name=user_collection_name)
                print(f"Deleted Qdrant collection: {user_collection_name}")
            except Exception as qdrant_error:
                print(f"Warning: Failed to delete Qdrant collection {user_collection_name}: {qdrant_error}")
        
        # Soft delete all documents in the database
        for doc in documents:
            doc.is_active = False
            db.add(doc)
        
        # Delete the workflow
        db.delete(workflow)
        db.commit()
        
        return {
            "message": "Workflow and associated documents deleted successfully",
            "workflow_id": workflow_id,
            "documents_deleted": documents_deleted,
            "chunks_deleted": total_chunks_deleted,
            "collection_deleted": user_collection_name if documents else None
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete workflow and associated data: {str(e)}"
        ) 
