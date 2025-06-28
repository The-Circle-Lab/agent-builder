from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession, select
from models.db_models import User, Document, Workflow, ChatConversation, ChatMessage, Deployment
from database.database import get_session
from api.auth import get_current_user
from models.deployment_models import (
    DeploymentRequest, DeploymentResponse, ChatRequest, ChatResponse,
    ConversationCreateRequest, ConversationResponse, MessageResponse
)
from services.deployment_config_service import parse_workflow_config
from services.deployment_manager import (
    load_deployment_on_demand, get_active_deployment, add_active_deployment,
    remove_active_deployment, is_deployment_active
)
from services.mcp_deployment_service import MCPChatDeployment
from typing import List
from datetime import datetime, timezone
import uuid
import os

router = APIRouter(prefix="/api/deploy", tags=["deployment"])

# Debug endpoint to check authentication
@router.get("/debug/auth")
async def debug_auth(current_user: User = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user_id": current_user.id,
        "user_email": current_user.email,
        "message": "Authentication is working correctly"
    }

# Deploy workflow to chatbot
@router.post("/", response_model=DeploymentResponse)
async def deploy_workflow(
    request: DeploymentRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Debug: Check if current_user is valid
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed: User not found"
            )
        
        if not hasattr(current_user, 'id') or current_user.id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed: User ID not available"
            )
        
        print(f"User authenticated: {current_user.id} ({current_user.email})")
        
        # Validate required environment variables
        required_env_vars = {
            "GOOGLE_CLOUD_PROJECT": "Google Cloud Project ID is required for Vertex AI"
        }
        
        missing_vars = []
        for var, description in required_env_vars.items():
            if not os.getenv(var):
                missing_vars.append(f"{var}: {description}")
        
        if missing_vars:
            error_msg = "Missing required environment variables:\n" + "\n".join(missing_vars)
            print(f"Error: {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Server configuration error: {error_msg}"
            )
        
        # Generate unique deployment ID
        deployment_id = str(uuid.uuid4())
        
        # Parse workflow configuration
        config = parse_workflow_config(request.workflow_data)
        
        # Get workflow and its documents
        workflow = db.get(Workflow, request.workflow_id)
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
        
        # Check for document collection if MCP is enabled and has documents
        collection_name = None
        if config["has_mcp"] and config.get("mcp_has_documents", True):
            # Check if we have documents for this specific workflow
            try:
                stmt = select(Document).where(
                    Document.workflow_id == workflow.id,
                    Document.uploaded_by_id == current_user.id,
                    Document.is_active == True
                )
                documents = db.exec(stmt).all()
            except Exception as doc_error:
                print(f"Error querying documents: {doc_error}")
                documents = []
            
            if documents:
                # Use the workflow-specific collection
                collection_name = f"{workflow.workflow_collection_id}_{current_user.id}"
                print(f"Using workflow collection: {collection_name}")
                print(f"Documents in workflow: {len(documents)}")
            else:
                print(f"No documents found for workflow {workflow.id}")
            
            config["collection_name"] = collection_name
        
        # Create MCP chat deployment
        mcp_deployment = MCPChatDeployment(deployment_id, config, collection_name)
        
        # Log LLM configuration for deployment
        llm_config = config["llm_config"]
        provider = llm_config.get("provider", "vertexai")
        print(f"[{deployment_id}] DEPLOYMENT CREATED - LLM Configuration:")
        print(f"[{deployment_id}]   Provider: {provider.upper()}")
        print(f"[{deployment_id}]   Model: {llm_config['model']}")
        print(f"[{deployment_id}]   Temperature: {llm_config['temperature']}")
        print(f"[{deployment_id}]   Max Tokens: {llm_config['max_tokens']}")
        print(f"[{deployment_id}]   Top P: {llm_config['top_p']}")
        print(f"[{deployment_id}]   Has MCP/RAG: {config['has_mcp']}")
        print(f"[{deployment_id}]   Collection: {collection_name}")
        
        # Store deployment configuration in database and memory
        try:
            # Save to database
            db_deployment = Deployment(
                deployment_id=deployment_id,
                user_id=current_user.id,
                workflow_id=workflow.id,
                workflow_name=request.workflow_name,
                collection_name=collection_name,
                config=config
            )
            db.add(db_deployment)
            db.commit()
            db.refresh(db_deployment)
            
            # Store in memory for active use
            add_active_deployment(deployment_id, {
                "user_id": current_user.id,
                "workflow_name": request.workflow_name,
                "config": config,
                "mcp_deployment": mcp_deployment,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "chat_history": []
            })
            print(f"Deployment stored successfully for user {current_user.id} (DB ID: {db_deployment.id})")
        except Exception as storage_error:
            print(f"Error storing deployment: {storage_error}")
            raise
        
        chat_url = f"/chat/{deployment_id}"
        
        return DeploymentResponse(
            deployment_id=deployment_id,
            chat_url=chat_url,
            message=f"Successfully deployed {request.workflow_name} with MCP server",
            configuration={
                "workflow_id": workflow.id,
                "workflow_collection_id": workflow.workflow_collection_id,
                "provider": config["llm_config"].get("provider", "vertexai"),
                "model": config["llm_config"]["model"],
                "has_rag": config["has_mcp"],
                "collection": collection_name,
                "mcp_enabled": config["has_mcp"]
            }
        )
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Full deployment error traceback:\n{error_traceback}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deployment failed: {str(e)}"
        )

# Chat with a deployed agent
@router.post("/chat/{deployment_id}", response_model=ChatResponse)
async def chat_with_deployment(
    deployment_id: str,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
    # Check user permission (redundant but safe)
    if deployment["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    try:
        print(f"Processing chat request for deployment {deployment_id}: {request.message}")
        mcp_deployment = deployment["mcp_deployment"]
        
        # Use MCP chat deployment
        result = await mcp_deployment.chat(request.message, request.history)
        
        # Store conversation in deployment history (for backward compatibility)
        deployment["chat_history"].append([request.message, result["response"]])
        
        # Save to database if conversation_id is provided
        saved_conversation_id = request.conversation_id
        if request.conversation_id:
            try:
                # Verify conversation exists and belongs to user
                conversation = db.get(ChatConversation, request.conversation_id)
                if conversation and conversation.user_id == current_user.id and conversation.deployment_id == deployment_id:
                    # Save user message
                    user_message = ChatMessage(
                        conversation_id=request.conversation_id,
                        message_text=request.message,
                        is_user_message=True
                    )
                    db.add(user_message)
                    
                    # Save assistant response
                    assistant_message = ChatMessage(
                        conversation_id=request.conversation_id,
                        message_text=result["response"],
                        is_user_message=False,
                        sources=result["sources"] if result["sources"] else None
                    )
                    db.add(assistant_message)
                    
                    # Update conversation timestamp
                    conversation.updated_at = datetime.now(timezone.utc)
                    db.add(conversation)
                    
                    db.commit()
                    print(f"Saved chat to conversation {request.conversation_id}")
                else:
                    print(f"Invalid conversation ID {request.conversation_id} for user {current_user.id}")
                    saved_conversation_id = None
            except Exception as save_error:
                print(f"Failed to save chat to database: {save_error}")
                db.rollback()
                saved_conversation_id = None
        
        print(f"Chat request completed for deployment {deployment_id}")
        return ChatResponse(
            response=result["response"],
            sources=result["sources"],
            conversation_id=saved_conversation_id
        )
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Full chat error traceback for deployment {deployment_id}:\n{error_traceback}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {str(e)}"
        )

# Get active deployments
@router.get("/active")
async def list_active_deployments(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Get deployments from database (don't load into memory yet)
        db_deployments = db.exec(
            select(Deployment).where(
                Deployment.user_id == current_user.id,
                Deployment.is_active == True
            )
        ).all()
        
        user_deployments = []
        
        for deployment in db_deployments:
            # Just list the deployment info without loading it into memory
            user_deployments.append({
                "deployment_id": deployment.deployment_id,
                "workflow_name": deployment.workflow_name,
                "created_at": deployment.created_at.isoformat(),
                "chat_url": f"/chat/{deployment.deployment_id}",
                "is_loaded": is_deployment_active(deployment.deployment_id),  # Show if currently loaded
                "configuration": {
                    "provider": deployment.config["llm_config"].get("provider", "vertexai"),
                    "model": deployment.config["llm_config"]["model"],
                    "has_rag": deployment.config["has_mcp"],
                    "mcp_enabled": deployment.config["has_mcp"]
                }
            })
        
        return {"deployments": user_deployments}
        
    except Exception as e:
        print(f"Error listing active deployments: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list deployments: {str(e)}"
        )

# Create new conversation for a deployment
@router.post("/{deployment_id}/conversations", response_model=ConversationResponse)
async def create_conversation(
    deployment_id: str,
    request: ConversationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
    # Generate title if not provided
    title = request.title or "New Conversation"
    
    conversation = ChatConversation(
        deployment_id=deployment_id,
        user_id=current_user.id,
        title=title,
        workflow_name=deployment["workflow_name"]
    )
    
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    
    return ConversationResponse(
        id=conversation.id,
        deployment_id=conversation.deployment_id,
        title=conversation.title,
        workflow_name=conversation.workflow_name,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=0
    )

# Get all conversations for a deployment
@router.get("/{deployment_id}/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Load deployment on-demand if not in memory  
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
    # Get conversations with message counts
    conversations = db.exec(
        select(ChatConversation).where(
            ChatConversation.deployment_id == deployment_id,
            ChatConversation.user_id == current_user.id,
            ChatConversation.is_active == True
        ).order_by(ChatConversation.updated_at.desc())
    ).all()
    
    result = []
    for conv in conversations:
        # Count messages for this conversation
        message_count = db.exec(
            select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
        ).all()
        
        result.append(ConversationResponse(
            id=conv.id,
            deployment_id=conv.deployment_id,
            title=conv.title,
            workflow_name=conv.workflow_name,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=len(message_count)
        ))
    
    return result

# Get messages for a specific conversation
@router.get("/{deployment_id}/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    deployment_id: str,
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
    # Verify conversation exists and belongs to user
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id or conversation.deployment_id != deployment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    messages = db.exec(
        select(ChatMessage).where(
            ChatMessage.conversation_id == conversation_id
        ).order_by(ChatMessage.created_at.asc())
    ).all()
    
    return [
        MessageResponse(
            id=msg.id,
            message_text=msg.message_text,
            is_user_message=msg.is_user_message,
            sources=msg.sources,
            created_at=msg.created_at
        )
        for msg in messages
    ]

# Delete a conversation
@router.delete("/{deployment_id}/conversations/{conversation_id}")
async def delete_conversation(
    deployment_id: str,
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
    # Verify conversation exists and belongs to user
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id or conversation.deployment_id != deployment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Soft delete the conversation
    conversation.is_active = False
    db.add(conversation)
    db.commit()
    
    return {"message": f"Conversation {conversation_id} deleted successfully"}

# Delete and cleanup deployment
@router.delete("/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    
    # Check if deployment exists in database
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.user_id == current_user.id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Clean up MCP server if loaded in memory
    if is_deployment_active(deployment_id):
        deployment = get_active_deployment(deployment_id)
        
        try:
            mcp_deployment = deployment.get("mcp_deployment")
            if mcp_deployment:
                await mcp_deployment.close()
        except Exception as e:
            print(f"Error cleaning up MCP deployment: {e}")
        
        remove_active_deployment(deployment_id)
    
    # Mark deployment as inactive in database
    db_deployment.is_active = False
    db_deployment.updated_at = datetime.now(timezone.utc)
    db.add(db_deployment)
    db.commit()
    
    return {"message": f"Deployment {deployment_id} deleted successfully"} 
