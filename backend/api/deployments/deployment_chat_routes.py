from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from typing import List

from .deployment_shared import *

router = APIRouter()

# Chat with a deployed agent
@router.post("/chat/{deployment_id}", response_model=ChatResponse)
async def chat_with_deployment(
    deployment_id: str,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    deployment = await _load_deployment_for_user(deployment_id, current_user, db)

    try:
        mcp_deployment = deployment["mcp_deployment"]

        if (not mcp_deployment.get_contains_chat()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deployment does not contain a chat agent"
            )

        result = await mcp_deployment.chat(request.message, request.history, user_id=current_user.id)

        # Keep history in memory
        deployment["chat_history"].append([request.message, result["response"]])

        # Persist conversation if requested
        if request.conversation_id:
            _save_chat_to_db(
                db,
                current_user.id,
                deployment_id,
                request.conversation_id,
                request.message,
                result,
            )

        return ChatResponse(
            response=result["response"],
            sources=result["sources"],
            conversation_id=request.conversation_id,
        )

    except Exception as exc:
        print(f"Chat failed for deployment {deployment_id}: {exc}")
        import traceback, sys
        print("Chat error traceback:\n" + traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {str(exc)}",
        )

# WebSocket chat
@router.websocket("/ws/{deployment_id}")
async def websocket_chat(
    websocket: WebSocket,
    deployment_id: str,
):
    await websocket.accept()
    db: DBSession = DBSession(engine)

    try:
        user, _ = await _authenticate_websocket_user(websocket, deployment_id, db)

        if not await load_deployment_on_demand(deployment_id, user.id, db):
            await _send_error_and_close(
                websocket,
                "Deployment not found or failed to initialize",
                "Deployment not available",
            )
            return

        deployment = get_active_deployment(deployment_id)

        if (not deployment["mcp_deployment"].get_contains_chat()):
            await _send_error_and_close(
                websocket,
                "Deployment does not contain a chat agent",
                "Deployment does not contain a chat agent",
            )
            return
        
        await websocket.send_json({"type": "auth_success", "message": "Authenticated successfully"})

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if msg_type != "chat":
                continue 

            message: str = data.get("message", "")
            history = data.get("history", [])
            conversation_id = data.get("conversation_id")

            mcp_deployment = deployment["mcp_deployment"]

            await websocket.send_json({"type": "typing", "message": "Assistant is typing..."})

            async def stream_callback(chunk: str) -> None:
                await websocket.send_json({"type": "stream", "chunk": chunk})

            result = await mcp_deployment.chat_streaming(message, history, stream_callback, user_id=user.id)

            await websocket.send_json({
                "type": "response",
                "response": result["response"],
                "sources": result["sources"],
            })

            deployment["chat_history"].append([message, result["response"]])

            if conversation_id:
                _save_chat_to_db(db, user.id, deployment_id, conversation_id, message, result)

    except WebSocketDisconnect:
        pass  # Normal client disconnect
    finally:
        try:
            db.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass

# Create new conversation for a deployment
@router.post("/{deployment_id}/conversations", response_model=ConversationResponse)
async def create_conversation(
    deployment_id: str,
    request: ConversationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    deployment = await ensure_deployment_loaded(deployment_id, current_user.id, db)
    
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
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
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
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db, require_instructor=True)
    
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
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
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
    db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
    
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

# Get files used for RAG in a deployment
@router.get("/{deployment_id}/files")
async def get_deployment_files(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session)
):
    try:
        print(f"[FILES] Getting files for deployment {deployment_id} requested by user {current_user.id}")
        
        db_deployment = await get_deployment_and_check_access(deployment_id, current_user, db)
        
        print(f"[FILES] Found deployment: ID={db_deployment.id}, workflow_id={db_deployment.workflow_id}, class_id={db_deployment.class_id}")
        print(f"[FILES] RAG document IDs: {db_deployment.rag_document_ids}")
        print(f"[FILES] Collection name: {db_deployment.collection_name}")
        
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
