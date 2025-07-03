from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession, select
from models.db_models import User, Document, Workflow, ChatConversation, ChatMessage, Deployment, AuthSession, ClassRole
from database.database import get_session, engine
from api.auth import get_current_user
from scripts.permission_helpers import (
    user_can_modify_workflow, user_can_access_workflow, user_can_modify_deployment,
    user_can_access_deployment, user_has_role_in_class, user_can_create_resources
)
from models.deployment_models import (
    DeploymentRequest, DeploymentResponse, ChatRequest, ChatResponse,
    ConversationCreateRequest, ConversationResponse, MessageResponse
)
from services.deployment_config_service import parse_workflow_config
from services.deployment_manager import (
    load_deployment_on_demand, get_active_deployment, add_active_deployment,
    remove_active_deployment, is_deployment_active
)
from services.deployment_service import MCPChatDeployment
from typing import List
from datetime import datetime, timezone
import uuid
import os
from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio

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
        
        # Check if user can create deployments (must be instructor)
        if not user_can_create_resources(current_user, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors can deploy workflows"
            )
        
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
        if not workflow or not workflow.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        
        # Check if user can modify this workflow (must be instructor in class)
        if not user_can_modify_workflow(current_user, workflow, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors of this class can deploy workflows"
            )
        
        # Check for document collection if MCP is enabled and has documents
        collection_name = None
        rag_document_ids = []
        if config["has_mcp"] and config.get("mcp_has_documents", True):
            # Check if we have documents for this specific workflow (from any class member)
            try:
                print(f"[DEPLOY] Looking for documents in workflow {workflow.id}")
                stmt = select(Document).where(
                    Document.workflow_id == workflow.id,
                    Document.is_active == True
                )
                documents = db.exec(stmt).all()
                print(f"[DEPLOY] Found {len(documents)} documents for workflow {workflow.id}")
                if documents:
                    for doc in documents:
                        print(f"[DEPLOY]   - Document {doc.id}: {doc.original_filename} (uploaded by {doc.uploaded_by_id})")
            except Exception as doc_error:
                print(f"Error querying documents: {doc_error}")
                documents = []
            
            if documents:
                # Use the workflow-specific collection (should use the uploader's collection)
                # Get the first document's uploader to determine collection name
                first_doc_uploader_id = documents[0].uploaded_by_id
                collection_name = f"{workflow.workflow_collection_id}_{first_doc_uploader_id}"
                rag_document_ids = [doc.id for doc in documents]
                print(f"Using workflow collection: {collection_name}")
                print(f"Documents in workflow: {len(documents)} - IDs: {rag_document_ids}")
                print(f"Documents uploaded by user {first_doc_uploader_id}")
            else:
                print(f"[DEPLOY] No documents found for workflow {workflow.id}")
                # Debug: Check if there are any documents at all for this workflow (including inactive)
                debug_stmt = select(Document).where(Document.workflow_id == workflow.id)
                debug_docs = db.exec(debug_stmt).all()
                print(f"[DEPLOY] Total documents for workflow {workflow.id} (including inactive): {len(debug_docs)}")
                for doc in debug_docs:
                    print(f"[DEPLOY]   - Document {doc.id}: {doc.original_filename} (active: {doc.is_active}, uploaded by: {doc.uploaded_by_id})")
            
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
                class_id=workflow.class_id,
                workflow_name=request.workflow_name,
                collection_name=collection_name,
                config=config,
                rag_document_ids=rag_document_ids if rag_document_ids else None
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
                "mcp_enabled": config["has_mcp"],
                "file_count": len(rag_document_ids),
                "files_url": f"/api/deploy/{deployment_id}/files" if rag_document_ids else None
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
    # Get deployment from database first to check permissions
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Check if user can access this deployment (class membership based)
    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to use this deployment."
        )
    
    # Load deployment on-demand if not in memory
    if not await load_deployment_on_demand(deployment_id, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize"
        )
    
    deployment = get_active_deployment(deployment_id)
    
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

# WebSocket endpoint for real-time chat
@router.websocket("/ws/{deployment_id}")
async def websocket_chat(
    websocket: WebSocket,
    deployment_id: str
):
    await websocket.accept()
    print(f"[WebSocket] Connection accepted for deployment {deployment_id}")
    
    # Create database session for WebSocket using proper async handling
    db: DBSession = DBSession(engine)
    
    try:
        # Get session cookie from WebSocket headers
        cookie_header = websocket.headers.get("cookie", "")
        print(f"[WebSocket] Cookie header: {cookie_header[:100]}...")  # Log first 100 chars
        sid = None
        
        # Parse session ID from cookie header
        for cookie in cookie_header.split(";"):
            cookie = cookie.strip()
            if cookie.startswith("sid="):
                sid = cookie.split("=", 1)[1]
                break
        
        # Fallback: check query parameters for session ID
        if not sid and websocket.query_params.get("sid"):
            sid = websocket.query_params.get("sid")
            print(f"[WebSocket] Using session ID from query parameter")
        
        print(f"[WebSocket] Extracted session ID: {sid[:20] if sid else 'None'}...")  # Log first 20 chars
        
        if not sid:
            print(f"[WebSocket] No session cookie found in headers or query params")
            await websocket.send_json({
                "type": "error",
                "message": "No session cookie found"
            })
            await websocket.close(code=1000, reason="No authentication")
            return
        
        # Validate session
        session = db.get(AuthSession, sid)
        if not session:
            print(f"[WebSocket] Session not found in database: {sid[:20]}...")
            await websocket.send_json({
                "type": "error",
                "message": "Invalid session"
            })
            await websocket.close(code=1000, reason="Invalid session")
            return
        
        print(f"[WebSocket] Session found, expires at: {session.expires_at}")
        
        if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            print(f"[WebSocket] Session expired")
            await websocket.send_json({
                "type": "error",
                "message": "Session expired"
            })
            await websocket.close(code=1000, reason="Session expired")
            return
        
        # Get user from session
        user = db.get(User, session.user_id)
        if not user:
            print(f"[WebSocket] User not found for session user_id: {session.user_id}")
            await websocket.send_json({
                "type": "error",
                "message": "User not found"
            })
            await websocket.close(code=1000, reason="User not found")
            return
        
        print(f"[WebSocket] User authenticated: {user.email} (ID: {user.id})")
        
        # Get deployment from database first to check permissions
        db_deployment = db.exec(
            select(Deployment).where(
                Deployment.deployment_id == deployment_id,
                Deployment.is_active == True
            )
        ).first()
        
        if not db_deployment:
            print(f"[WebSocket] Deployment not found in database: {deployment_id}")
            await websocket.send_json({
                "type": "error",
                "message": "Deployment not found"
            })
            await websocket.close(code=1000, reason="Deployment not found")
            return
        
        # Check if user can access this deployment (class membership based)
        if not user_can_access_deployment(user, db_deployment, db):
            print(f"[WebSocket] Access denied: user {user.id} not authorized for deployment {deployment_id} in class {db_deployment.class_id}")
            await websocket.send_json({
                "type": "error",
                "message": "Access denied. You must be a member of this class to use this deployment."
            })
            await websocket.close(code=1000, reason="Access denied")
            return
        
        # Load deployment in memory
        print(f"[WebSocket] Loading deployment {deployment_id} for user {user.id}")
        if not await load_deployment_on_demand(deployment_id, user.id, db):
            print(f"[WebSocket] Failed to load deployment {deployment_id}")
            await websocket.send_json({
                "type": "error",
                "message": "Deployment not found or failed to initialize"
            })
            await websocket.close(code=1000, reason="Deployment not found")
            return
        
        print(f"[WebSocket] Deployment loaded successfully")
        deployment = get_active_deployment(deployment_id)
        
        print(f"[WebSocket] User permission verified")
        
        # Send authentication success
        await websocket.send_json({
            "type": "auth_success",
            "message": "Authenticated successfully"
        })
        
        print(f"[WebSocket] Entering message loop for deployment {deployment_id}")
        
        # Handle chat messages
        while True:
            try:
                print(f"[WebSocket] Waiting for message...")
                data = await websocket.receive_json()
                print(f"[WebSocket] Received message: {data}")
            except WebSocketDisconnect:
                print(f"[WebSocket] Client disconnected normally")
                break
            except Exception as recv_error:
                print(f"[WebSocket] Error receiving message: {recv_error}")
                import traceback
                print(f"[WebSocket] Receive error traceback:\n{traceback.format_exc()}")
                break
            
            if data.get("type") == "chat":
                message = data.get("message", "")
                history = data.get("history", [])
                conversation_id = data.get("conversation_id")
                
                print(f"WebSocket chat request for deployment {deployment_id}: {message}")
                
                try:
                    mcp_deployment = deployment["mcp_deployment"]
                    
                    # Send typing indicator
                    await websocket.send_json({
                        "type": "typing",
                        "message": "Assistant is typing..."
                    })
                    
                    # Pre-search for context to get sources early for real-time citation processing
                    search_results, context = await mcp_deployment._prepare_context(message)
                    sources = mcp_deployment._extract_unique_sources(search_results)
                    
                    # Send sources information early for real-time citation processing
                    if sources:
                        await websocket.send_json({
                            "type": "sources",
                            "sources": sources
                        })
                        print(f"WebSocket: Sent sources ({len(sources)} sources) for real-time citation processing")
                    
                    # Create a proper async callback for streaming
                    async def stream_callback(chunk):
                        try:
                            await websocket.send_json({
                                "type": "stream",
                                "chunk": chunk,
                                "sources": sources  # Include sources for real-time citation processing
                            })
                            print(f"WebSocket: Sent streaming chunk ({len(chunk)} chars)")
                        except Exception as e:
                            print(f"WebSocket: Failed to send streaming chunk: {e}")
                    
                    # Get response from MCP deployment with streaming support
                    result = await mcp_deployment.chat_streaming(
                        message, 
                        history,
                        stream_callback
                    )
                    
                    # Send final response
                    await websocket.send_json({
                        "type": "response",
                        "response": result["response"],
                        "sources": result["sources"]
                    })
                    
                    print(f"WebSocket: Sent final response ({len(result['response'])} chars) with {len(result.get('sources', []))} sources")
                    
                    # Store conversation in deployment history
                    deployment["chat_history"].append([message, result["response"]])
                    
                    # Save to database if conversation_id is provided
                    if conversation_id:
                        try:
                            conversation = db.get(ChatConversation, conversation_id)
                            if conversation and conversation.user_id == user.id and conversation.deployment_id == deployment_id:
                                # Save user message
                                user_message = ChatMessage(
                                    conversation_id=conversation_id,
                                    message_text=message,
                                    is_user_message=True
                                )
                                db.add(user_message)
                                
                                # Save assistant response
                                assistant_message = ChatMessage(
                                    conversation_id=conversation_id,
                                    message_text=result["response"],
                                    is_user_message=False,
                                    sources=result["sources"] if result["sources"] else None
                                )
                                db.add(assistant_message)
                                
                                # Update conversation timestamp
                                conversation.updated_at = datetime.now(timezone.utc)
                                db.add(conversation)
                                
                                db.commit()
                                print(f"WebSocket: Saved chat to conversation {conversation_id}")
                        except Exception as save_error:
                            print(f"WebSocket: Failed to save chat to database: {save_error}")
                            db.rollback()
                    
                except Exception as e:
                    print(f"WebSocket chat error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Chat failed: {str(e)}"
                    })
            
            elif data.get("type") == "ping":
                # Handle ping/pong for connection keepalive
                await websocket.send_json({
                    "type": "pong"
                })
    
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for deployment {deployment_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        print(f"WebSocket error traceback:\n{traceback.format_exc()}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"WebSocket error: {str(e)}"
            })
        except:
            pass
    finally:
        # Clean up database session
        try:
            db.close()
        except:
            pass
        
        try:
            await websocket.close()
        except:
            pass

# Get active deployments
@router.get("/active")
async def list_active_deployments(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        # Get all deployments accessible to user (based on class membership)
        from scripts.permission_helpers import get_accessible_deployments
        accessible_deployments = get_accessible_deployments(current_user, db)
        
        user_deployments = []
        
        for deployment in accessible_deployments:
            # Get file count for this deployment
            rag_document_ids = deployment.rag_document_ids or []
            file_count = 0
            
            if rag_document_ids:
                # Count active documents for this deployment
                active_docs = db.exec(
                    select(Document).where(
                        Document.id.in_(rag_document_ids),
                        Document.is_active == True
                    )
                ).all()
                file_count = len(active_docs)
            
            # Just list the deployment info without loading it into memory
            user_deployments.append({
                "deployment_id": deployment.deployment_id,
                "workflow_name": deployment.workflow_name,
                "created_at": deployment.created_at.isoformat(),
                "chat_url": f"/chat/{deployment.deployment_id}",
                "files_url": f"/api/deploy/{deployment.deployment_id}/files",
                "is_loaded": is_deployment_active(deployment.deployment_id),  # Show if currently loaded
                "file_count": file_count,
                "has_files": file_count > 0,
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
    # Get deployment from database to check permissions
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Check if user can access this deployment (class membership based)
    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to create conversations."
        )
    
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
    # Get deployment from database to check permissions
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Check if user can access this deployment (class membership based)
    if not user_can_access_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to view conversations."
        )
    
    # Get conversations with message counts (only user's own conversations)
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

# Get all student conversations for a deployment (instructors only)
@router.get("/{deployment_id}/all-conversations", response_model=List[ConversationResponse])
async def get_all_student_conversations(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    # Get deployment from database to check permissions
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Check if user is instructor in this class
    if not user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can view all student conversations"
        )
    
    # Get all conversations for this deployment
    conversations = db.exec(
        select(ChatConversation).where(
            ChatConversation.deployment_id == deployment_id,
            ChatConversation.is_active == True
        ).order_by(ChatConversation.updated_at.desc())
    ).all()
    
    result = []
    for conv in conversations:
        # Count messages for this conversation
        message_count = db.exec(
            select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
        ).all()
        
        # Get user info for the conversation owner
        conv_user = db.get(User, conv.user_id)
        user_email = conv_user.email if conv_user else "Unknown"
        
        result.append(ConversationResponse(
            id=conv.id,
            deployment_id=conv.deployment_id,
            title=f"{conv.title} (by {user_email})",
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
    # Get deployment from database to check permissions
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Verify conversation exists
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.deployment_id != deployment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check permissions - user can view their own conversations or instructors can view any
    user_can_view = (
        conversation.user_id == current_user.id or 
        user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db)
    )
    
    if not user_can_view:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view your own conversations or be an instructor of this class."
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
    # Get deployment from database to check permissions
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Verify conversation exists and belongs to user
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.deployment_id != deployment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check permissions - user can delete their own conversations or instructors can delete any
    user_can_delete = (
        conversation.user_id == current_user.id or 
        user_has_role_in_class(current_user, db_deployment.class_id, ClassRole.INSTRUCTOR, db)
    )
    
    if not user_can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only delete your own conversations or be an instructor of this class."
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
            Deployment.is_active == True
        )
    ).first()
    
    if not db_deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    # Check if user can modify this deployment (must be instructor in class)
    if not user_can_modify_deployment(current_user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors of this class can delete deployments"
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

# Get files used for RAG in a deployment
@router.get("/{deployment_id}/files")
async def get_deployment_files(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    """
    Get all files/documents used for RAG in a specific deployment
    """
    try:
        print(f"[FILES] Getting files for deployment {deployment_id} requested by user {current_user.id}")
        
        # Get deployment from database to check permissions
        db_deployment = db.exec(
            select(Deployment).where(
                Deployment.deployment_id == deployment_id,
                Deployment.is_active == True
            )
        ).first()
        
        if not db_deployment:
            print(f"[FILES] Deployment {deployment_id} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found"
            )
        
        print(f"[FILES] Found deployment: ID={db_deployment.id}, workflow_id={db_deployment.workflow_id}, class_id={db_deployment.class_id}")
        print(f"[FILES] RAG document IDs: {db_deployment.rag_document_ids}")
        print(f"[FILES] Collection name: {db_deployment.collection_name}")
        
        # Check if user can access this deployment (class membership based)
        if not user_can_access_deployment(current_user, db_deployment, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You must be a member of this class to view deployment files."
            )
        
        # Get RAG document IDs from deployment
        rag_document_ids = db_deployment.rag_document_ids or []
        print(f"[FILES] RAG document IDs from deployment: {rag_document_ids}")
        
        if not rag_document_ids:
            print(f"[FILES] No RAG document IDs found for deployment {deployment_id}")
            print(f"[FILES] Has MCP enabled: {db_deployment.config.get('has_mcp', False)}")
            return {
                "deployment_id": deployment_id,
                "workflow_name": db_deployment.workflow_name,
                "has_rag": db_deployment.config.get("has_mcp", False),
                "file_count": 0,
                "files": [],
                "message": "No files used for RAG in this deployment"
            }
        
        # Get documents by IDs
        documents = db.exec(
            select(Document).where(
                Document.id.in_(rag_document_ids),
                Document.is_active == True
            ).order_by(Document.uploaded_at.desc())
        ).all()
        
        print(f"[FILES] Found {len(documents)} documents in database for IDs: {rag_document_ids}")
        
        # Get the backend base URL from environment or default
        backend_host = os.getenv("BACKEND_HOST", "localhost")
        backend_port = os.getenv("BACKEND_PORT", "8000")
        backend_scheme = os.getenv("BACKEND_SCHEME", "http")
        backend_base_url = f"{backend_scheme}://{backend_host}:{backend_port}"
        
        # Prepare file list with viewing information
        file_list = []
        for doc in documents:
            file_info = {
                "id": doc.id,
                "filename": doc.original_filename,
                "file_size": doc.file_size,
                "file_type": doc.file_type,
                "chunk_count": doc.chunk_count,
                "upload_id": doc.upload_id,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "uploaded_by_id": doc.uploaded_by_id,
                "has_stored_file": doc.storage_path is not None,
                "can_view": doc.storage_path is not None,
                "can_download": doc.storage_path is not None,
                "view_url": f"{backend_base_url}/api/files/view/{doc.id}" if doc.storage_path else None,
                "download_url": f"{backend_base_url}/api/files/download/{doc.id}" if doc.storage_path else None
            }
            
            # Get uploader info for display
            if doc.uploaded_by_id:
                uploader = db.get(User, doc.uploaded_by_id)
                file_info["uploaded_by_email"] = uploader.email if uploader else "Unknown"
            
            file_list.append(file_info)
        
        return {
            "deployment_id": deployment_id,
            "workflow_name": db_deployment.workflow_name,
            "workflow_id": db_deployment.workflow_id,
            "class_id": db_deployment.class_id,
            "collection_name": db_deployment.collection_name,
            "has_rag": db_deployment.config.get("has_mcp", False),
            "rag_enabled": len(rag_document_ids) > 0,
            "file_count": len(file_list),
            "files": file_list,
            "created_at": db_deployment.created_at.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting deployment files: {e}")
        import traceback
        print(f"Deployment files error traceback:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get deployment files: {str(e)}"
        )

# Test streaming functionality for a deployment
@router.post("/{deployment_id}/test-streaming")
async def test_deployment_streaming(
    deployment_id: str,
    test_message: str = "Hello, this is a test message for streaming functionality.",
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
    mcp_deployment = deployment.get("mcp_deployment")
    
    if not mcp_deployment:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MCP deployment not available"
        )
    
    try:
        # Test streaming functionality
        result = await mcp_deployment.test_streaming(test_message)
        
        return {
            "deployment_id": deployment_id,
            "test_message": test_message,
            "streaming_test_result": result,
            "provider": deployment["config"]["llm_config"].get("provider", "vertexai"),
            "model": deployment["config"]["llm_config"]["model"]
        }
        
    except Exception as e:
        print(f"Error testing streaming for deployment {deployment_id}: {e}")
        import traceback
        print(f"Streaming test error traceback:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to test streaming: {str(e)}"
        ) 
