import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlmodel import Session
from typing import Dict, Any, Optional
from database.database import get_session, engine
from api.auth import get_current_user
from models.database.db_models import User
from .deployment_shared import _load_deployment_for_user, _authenticate_websocket_user

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
        
        # Authenticate user using session cookie (same as chat WebSocket)
        db = Session(engine)
        try:
            user, db_deployment = await _authenticate_websocket_user(websocket, deployment_id, db)
            print(f"🎤 Student authenticated: {user.email} ({user.id}) to {deployment_id}")
            print(f"🎤 DB deployment class_id: {db_deployment.class_id}, user_id: {user.id}")
            
            # Load deployment for the authenticated user with proper instance sharing
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
            live_presentation_service = None
            
            # Try to get the live presentation service with error handling
            try:
                if hasattr(mcp_deployment, 'get_live_presentation_service'):
                    live_presentation_service = mcp_deployment.get_live_presentation_service()
                else:
                    print(f"🎤 Student: mcp_deployment missing get_live_presentation_service method")
                    print(f"🎤 Student: mcp_deployment type: {type(mcp_deployment)}")
                    print(f"🎤 Student: mcp_deployment methods: {[m for m in dir(mcp_deployment) if not m.startswith('_')]}")
            except Exception as service_error:
                print(f"🎤 Student: Error getting live presentation service: {service_error}")
                print(f"🎤 Student: mcp_deployment type: {type(mcp_deployment)}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Failed to load deployment: {str(service_error)}"
                }))
                await websocket.close()
                return
            
            if not live_presentation_service:
                print(f"🎤 Student: No live presentation service found in mcp_deployment")
                print(f"🎤 Student: mcp_deployment type: {type(mcp_deployment)}")
            
            # Set up a fresh database session for the live presentation service
            # Don't close the db session yet - we need it for the WebSocket connection
            if live_presentation_service:
                live_presentation_service.set_database_session(db)
                print(f"🎤 Database session set for live presentation service - Student {user.email}")
                print(f"🎤 Current students in service: {len(live_presentation_service.students)}")
                print(f"🎤 Service deployment_id: {live_presentation_service.deployment_id}")
                print(f"🎤 Requested deployment_id: {deployment_id}")
                
        except HTTPException as http_exc:
            # Handle HTTPException from _authenticate_websocket_user or _load_deployment_for_user
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
        
        # Connect the student using the authenticated user info
        print(f"🎤 About to connect student {user.email} to live presentation service")
        print(f"🎤 Live presentation service deployment_id: {live_presentation_service.deployment_id}")
        print(f"🎤 Current students before connection: {len(live_presentation_service.students)}")
        
        success = await live_presentation_service.connect_student(str(user.id), user.email, websocket)
        if not success:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Failed to connect to live presentation"
            }))
            await websocket.close()
            return
        
        print(f"🎤 Student connection successful. Current students after connection: {len(live_presentation_service.students)}")
        
        try:
            # Handle incoming messages
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                await live_presentation_service.handle_student_message(str(user.id), message)
                
        except WebSocketDisconnect:
            print(f"🎤 Student disconnected: {user.email} ({user.id})")
            await live_presentation_service.disconnect_student(str(user.id))
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
        
        # Authenticate user using session cookie (same as chat WebSocket)
        db = Session(engine)
        try:
            user, db_deployment = await _authenticate_websocket_user(websocket, deployment_id, db)
            print(f"🎤 Teacher authenticated: {user.email} ({user.id}) to {deployment_id}")
            print(f"🎤 DB deployment class_id: {db_deployment.class_id}, user_id: {user.id}")
            
            # Verify user is an instructor
            from scripts.permission_helpers import user_is_instructor
            if not user_is_instructor(user, db):
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Unauthorized - instructors only"
                }))
                await websocket.close()
                return
            
            # Load deployment for the authenticated user with proper instance sharing
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
            live_presentation_service = None
            
            # Try to get the live presentation service with error handling
            try:
                if hasattr(mcp_deployment, 'get_live_presentation_service'):
                    live_presentation_service = mcp_deployment.get_live_presentation_service()
                else:
                    print(f"🎤 Teacher: mcp_deployment missing get_live_presentation_service method")
                    print(f"🎤 Teacher: mcp_deployment type: {type(mcp_deployment)}")
                    print(f"🎤 Teacher: mcp_deployment methods: {[m for m in dir(mcp_deployment) if not m.startswith('_')]}")
            except Exception as service_error:
                print(f"🎤 Teacher: Error getting live presentation service: {service_error}")
                print(f"🎤 Teacher: mcp_deployment type: {type(mcp_deployment)}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Failed to load deployment: {str(service_error)}"
                }))
                await websocket.close()
                return
            
            if not live_presentation_service:
                print(f"🎤 Teacher: No live presentation service found in mcp_deployment")
                print(f"🎤 Teacher: mcp_deployment type: {type(mcp_deployment)}")
            
            # Set up a fresh database session for the live presentation service
            if live_presentation_service:
                live_presentation_service.set_database_session(db)
                print(f"🎤 Database session set for live presentation service - Teacher {user.email}")
                print(f"🎤 Current students in service: {len(live_presentation_service.students)}")
                print(f"🎤 Current teacher websockets: {len(live_presentation_service.teacher_websockets)}")
                print(f"🎤 Service deployment_id: {live_presentation_service.deployment_id}")
                print(f"🎤 Requested deployment_id: {deployment_id}")
                
        except HTTPException as http_exc:
            # Handle HTTPException from _authenticate_websocket_user or _load_deployment_for_user
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
        print(f"🎤 About to connect teacher to live presentation service")
        print(f"🎤 Live presentation service deployment_id: {live_presentation_service.deployment_id}")
        print(f"🎤 Current students before teacher connection: {len(live_presentation_service.students)}")
        print(f"🎤 Current teachers before connection: {len(live_presentation_service.teacher_websockets)}")
        
        success = await live_presentation_service.connect_teacher(websocket)
        if not success:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Failed to connect to live presentation"
            }))
            await websocket.close()
            return
        
        print(f"🎤 Teacher connection successful. Current students: {len(live_presentation_service.students)}")
        print(f"🎤 Current teachers after connection: {len(live_presentation_service.teacher_websockets)}")
        
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
    from scripts.permission_helpers import user_is_instructor
    if not user_is_instructor(current_user, db):
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
    from scripts.permission_helpers import user_is_instructor
    if not user_is_instructor(current_user, db):
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
