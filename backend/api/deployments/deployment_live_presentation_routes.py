import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlmodel import Session
from typing import Dict, Any, Optional
from database.database import get_session, engine
from api.auth import get_current_user
from models.database.db_models import User
from .deployment_shared import _load_deployment_for_user

router = APIRouter()

# Store active WebSocket connections
active_connections: Dict[str, Dict[str, Any]] = {}  # deployment_id -> connection_info

@router.websocket("/ws/live-presentation/{deployment_id}/student")
async def websocket_student_endpoint(
    websocket: WebSocket,
    deployment_id: str
):
    """WebSocket endpoint for students to connect to live presentations"""
    try:
        # Accept the connection first
        await websocket.accept()
        
        # Wait for authentication message
        auth_message = await websocket.receive_text()
        auth_data = json.loads(auth_message)
        
        user_id = auth_data.get("user_id")
        user_name = auth_data.get("user_name")
        access_token = auth_data.get("access_token")
        
        if not all([user_id, user_name, access_token]):
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Missing authentication data"
            }))
            await websocket.close()
            return
        
        # Verify the user (you might want to add proper token validation here)
        print(f"🎤 Student connecting: {user_name} ({user_id}) to {deployment_id}")
        
        # Get the deployment - we need to create a dummy user object for authentication
        # In a real implementation, you'd properly validate the access_token
        db = Session(engine)
        try:
            # Create a temporary user object for deployment loading
            # This is a simplified approach - you should validate the token properly
            user = User(id=int(user_id), email=user_name, role="student")
            deployment = await _load_deployment_for_user(deployment_id, user, db)
            
            if not deployment:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Deployment not found"
                }))
                await websocket.close()
                return
            
            # Get the live presentation service
            mcp_deployment = deployment["mcp_deployment"]
            live_presentation_service = mcp_deployment.get_live_presentation_service()
            
            # Set up a fresh database session for the live presentation service
            # Don't close the db session yet - we need it for the WebSocket connection
            if live_presentation_service:
                live_presentation_service.set_database_session(db)
                
        except HTTPException as http_exc:
            # Handle HTTPException from _load_deployment_for_user
            db.close()
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": http_exc.detail
            }))
            await websocket.close()
            return
        except Exception as e:
            db.close()
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Failed to load deployment: {str(e)}"
            }))
            await websocket.close()
            return
        if not live_presentation_service:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Not a live presentation deployment"
            }))
            await websocket.close()
            return
        
        # Connect the student
        success = await live_presentation_service.connect_student(user_id, user_name, websocket)
        if not success:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Failed to connect to live presentation"
            }))
            await websocket.close()
            return
        
        try:
            # Handle incoming messages
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                await live_presentation_service.handle_student_message(user_id, message)
                
        except WebSocketDisconnect:
            print(f"🎤 Student disconnected: {user_name} ({user_id})")
            await live_presentation_service.disconnect_student(user_id)
        finally:
            # Close the database session when WebSocket connection ends
            db.close()
            
    except Exception as e:
        print(f"Error in student WebSocket: {e}")
        try:
            await websocket.close()
        except:
            pass

@router.websocket("/ws/live-presentation/{deployment_id}/teacher")
async def websocket_teacher_endpoint(
    websocket: WebSocket,
    deployment_id: str
):
    """WebSocket endpoint for teachers to control live presentations"""
    try:
        # Accept the connection first
        await websocket.accept()
        
        # Wait for authentication message
        auth_message = await websocket.receive_text()
        auth_data = json.loads(auth_message)
        
        access_token = auth_data.get("access_token")
        user_role = auth_data.get("user_role")
        
        if not access_token or user_role != "instructor":
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Unauthorized - instructors only"
            }))
            await websocket.close()
            return
        
        print(f"🎤 Teacher connecting to {deployment_id}")
        
        # Get the deployment
        db = Session(engine)
        try:
            # Create a temporary instructor user object for deployment loading
            user = User(id=1, email="instructor", role="instructor")
            deployment = await _load_deployment_for_user(deployment_id, user, db)
            
            if not deployment:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Deployment not found"
                }))
                await websocket.close()
                return
            
            # Get the live presentation service
            mcp_deployment = deployment["mcp_deployment"]
            live_presentation_service = mcp_deployment.get_live_presentation_service()
            
            # Set up a fresh database session for the live presentation service
            if live_presentation_service:
                live_presentation_service.set_database_session(db)
                
        except HTTPException as http_exc:
            # Handle HTTPException from _load_deployment_for_user
            db.close()
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": http_exc.detail
            }))
            await websocket.close()
            return
        except Exception as e:
            db.close()
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Failed to load deployment: {str(e)}"
            }))
            await websocket.close()
            return
        if not live_presentation_service:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Not a live presentation deployment"
            }))
            await websocket.close()
            return
        
        # Connect the teacher
        success = await live_presentation_service.connect_teacher(websocket)
        if not success:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Failed to connect to live presentation"
            }))
            await websocket.close()
            return
        
        try:
            # Handle incoming messages
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                await live_presentation_service.handle_teacher_message(websocket, message)
                
        except WebSocketDisconnect:
            print(f"🎤 Teacher disconnected from {deployment_id}")
            await live_presentation_service.disconnect_teacher(websocket)
        finally:
            # Close the database session when WebSocket connection ends
            db.close()
            
    except Exception as e:
        print(f"Error in teacher WebSocket: {e}")
        try:
            await websocket.close()
        except:
            pass

@router.get("/live-presentation/{deployment_id}/info")
async def get_live_presentation_info(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Get information about a live presentation deployment"""
    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    mcp_deployment = deployment["mcp_deployment"]
    live_presentation_info = mcp_deployment.get_live_presentation_info()
    if not live_presentation_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a live presentation deployment"
        )
    
    return live_presentation_info

@router.get("/live-presentation/{deployment_id}/stats")
async def get_live_presentation_stats(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Get current statistics for a live presentation (teachers only)"""
    # Check if user is instructor
    if current_user.role != "instructor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can view live presentation stats"
        )
    
    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    mcp_deployment = deployment["mcp_deployment"]
    live_presentation_service = mcp_deployment.get_live_presentation_service()
    if not live_presentation_service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a live presentation deployment"
        )
    
    return live_presentation_service.get_presentation_stats()

@router.get("/live-presentation/{deployment_id}/responses")
async def get_live_presentation_responses(
    deployment_id: str,
    prompt_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Get student responses for a live presentation (teachers only)"""
    # Check if user is instructor
    if current_user.role != "instructor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can view student responses"
        )
    
    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    
    mcp_deployment = deployment["mcp_deployment"]
    live_presentation_service = mcp_deployment.get_live_presentation_service()
    if not live_presentation_service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a live presentation deployment"
        )
    
    responses = live_presentation_service.get_student_responses(prompt_id)
    return {
        "deployment_id": deployment_id,
        "prompt_id": prompt_id,
        "response_count": len(responses),
        "responses": responses
    }
