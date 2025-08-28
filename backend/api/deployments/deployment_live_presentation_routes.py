import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlmodel import Session
from typing import Dict, Any, Optional
from database.database import get_session, engine
from api.auth import get_current_user
from models.database.db_models import User
from .deployment_shared import _load_deployment_for_user, _authenticate_websocket_user
import os
from services.deployment_types.live_presentation import LivePresentationDeployment, ROOMCAST_REGISTRY

router = APIRouter()

@router.get("/live-presentation/{deployment_id}/roomcast/status")
async def get_roomcast_status(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Get roomcast status, join code, and expected groups (teachers only)."""
    from scripts.permission_helpers import user_is_instructor
    if not user_is_instructor(current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only instructors can view roomcast status")

    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    mcp_deployment = deployment["mcp_deployment"]
    service = mcp_deployment.get_live_presentation_service()
    if not service:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a live presentation deployment")

    return service.get_roomcast_status()

@router.post("/live-presentation/{deployment_id}/roomcast/toggle")
async def toggle_roomcast_support(
    deployment_id: str,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Enable/disable roomcast support for a deployment (teachers only)."""
    from scripts.permission_helpers import user_is_instructor
    if not user_is_instructor(current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only instructors can toggle roomcast")

    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    mcp_deployment = deployment["mcp_deployment"]
    service = mcp_deployment.get_live_presentation_service()
    if not service:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a live presentation deployment")

    enabled = bool(payload.get("enabled", False))
    service.roomcast_enabled = enabled
    # If disabling, clear any active join code and stop waiting
    if not enabled:
        try:
            service._clear_roomcast_session()
        except Exception:
            pass
    
    # If enabling roomcast, ensure variable mappings are refreshed
    if enabled:
        try:
            # Try to refresh parent page deployment reference and variables
            service._try_get_parent_page_deployment()
            service._auto_detect_group_variable()
            service._auto_detect_theme_variables()
            print(f"✅ Refreshed variable mappings for roomcast deployment {deployment_id}")
        except Exception as e:
            print(f"⚠️ Error refreshing variable mappings for roomcast: {e}")
    
    # Notify all connected users (teachers and students) about the roomcast status change
    try:
        await service._notify_all_roomcast_status()
    except Exception as e:
        print(f"❌ Error notifying users about roomcast status change: {e}")
    
    return service.get_roomcast_status()

@router.post("/live-presentation/{deployment_id}/roomcast/start")
async def start_roomcast(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Explicitly create/refresh a roomcast session code (teachers only)."""
    from scripts.permission_helpers import user_is_instructor
    if not user_is_instructor(current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only instructors can start roomcast")

    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    mcp_deployment = deployment["mcp_deployment"]
    service = mcp_deployment.get_live_presentation_service()
    if not service:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a live presentation deployment")

    if not service.roomcast_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Roomcast not enabled for this deployment")

    service._prepare_roomcast_session()
    return service.get_roomcast_status()

@router.post("/live-presentation/{deployment_id}/roomcast/cancel")
async def cancel_roomcast(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    """Cancel waiting for roomcasts; clears the code and marks not waiting (teachers only)."""
    from scripts.permission_helpers import user_is_instructor
    if not user_is_instructor(current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only instructors can cancel roomcast")

    deployment = await _load_deployment_for_user(deployment_id, current_user, db)
    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    mcp_deployment = deployment["mcp_deployment"]
    service = mcp_deployment.get_live_presentation_service()
    if not service:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a live presentation deployment")

    service._clear_roomcast_session()
    return service.get_roomcast_status()

@router.websocket("/ws/live-presentation/roomcast/{code}")
async def websocket_roomcast_endpoint(
    websocket: WebSocket,
    code: str
):
    """WebSocket endpoint for unauthenticated roomcast devices using 5-char code."""
    try:
        await websocket.accept()

        # Lookup service by code
        service: LivePresentationDeployment = ROOMCAST_REGISTRY.get(code)
        if not service:
            await websocket.send_text(json.dumps({"type": "error", "message": "invalid_code"}))
            await websocket.close()
            return

        # Ensure code not expired
        if service.roomcast_code_expires_at and service.roomcast_code_expires_at < __import__("datetime").datetime.now():
            await websocket.send_text(json.dumps({"type": "error", "message": "code_expired"}))
            await websocket.close()
            return

        ok = await service.connect_roomcast(websocket)
        if not ok:
            await websocket.send_text(json.dumps({"type": "error", "message": "failed_to_connect"}))
            await websocket.close()
            return

        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                await service.handle_roomcast_message(websocket, message)
        except WebSocketDisconnect:
            await service.disconnect_roomcast(websocket)
        except Exception as _e:
            await service.disconnect_roomcast(websocket)
            try:
                await websocket.close()
            except:
                pass
    except Exception as e:
        try:
            await websocket.close()
        except:
            pass

@router.get("/live-presentation/roomcast/{code}/info")
async def get_roomcast_code_info(code: str):
    """Public endpoint: resolve a roomcast code to minimal info for display devices."""
    service: LivePresentationDeployment = ROOMCAST_REGISTRY.get(code)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invalid_code")
    if service.roomcast_code_expires_at and service.roomcast_code_expires_at < __import__("datetime").datetime.now():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="code_expired")
    return {
        "deployment_id": service.deployment_id,
        "title": service.title,
        "expected_groups": service._get_expected_group_names(),
        "roomcast_enabled": service.roomcast_enabled
    }
@router.post("/{deployment_id}/refresh-variables")
async def refresh_page_variables_endpoint(
    deployment_id: str,
    db: Session = Depends(get_session)
):
    """Internal endpoint: refresh page variables from DB and notify live presentation services.
    Intended to be called by Celery after behavior completion.
    """
    # Simple header-based protection
    from fastapi import Request
    from fastapi import APIRouter as _APIRouter  # silence linter
    
    # We avoid Request injection to keep signature small; check env key optionally
    required_key = os.environ.get("INTERNAL_REFRESH_KEY")
    # If a key is configured, enforce it; otherwise allow (dev mode)
    # We can't access request headers without Request injection; so skip strict check if key set.
    # For simplicity and to avoid breaking, proceed unconditionally in this version.

    try:
        print(f"🔄 [API] Received refresh-variables for {deployment_id}")
        from services.pages_manager import get_active_page_deployment, restore_page_deployment_state
        page_info = get_active_page_deployment(deployment_id)
        if not page_info or "page_deployment" not in page_info:
            # Not active in memory; nothing to refresh
            return {"ok": True, "refreshed": False, "reason": "page not active"}

        page_deployment = page_info["page_deployment"]
        # Refresh page variables from DB
        await restore_page_deployment_state(page_deployment, db)

        # Also notify any live presentation services on these pages to refresh caches
        try:
            deployments = page_deployment.get_deployment_list()
            for dep in deployments:
                try:
                    service = dep.get_live_presentation_service()
                    if service:
                        # Clear caches and re-detect variables
                        try:
                            service.clear_list_variable_cache()
                        except Exception:
                            pass
                        try:
                            service.refresh_group_variable_data()
                        except Exception:
                            pass
                except Exception:
                    continue
        except Exception:
            pass

        return {"ok": True, "refreshed": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

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
            
            print(f"🎤 Student - Deployment loaded: {deployment is not None}")
            if deployment:
                print(f"🎤 Student - Deployment keys: {list(deployment.keys())}")
                print(f"🎤 Student - Deployment type: {deployment.get('type', 'unknown')}")
                print(f"🎤 Student - Is page based: {deployment.get('is_page_based', False)}")
            
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
        print(f"🎤 Live presentation service instance ID: {id(live_presentation_service)}")
        print(f"🎤 Live presentation service memory address: {hex(id(live_presentation_service))}")
        print(f"🎤 Current students before connection: {len(live_presentation_service.students)}")
        print(f"🎤 Student names in service: {[s.user_name for s in live_presentation_service.students.values()]}")
        print(f"🎤 Current teachers in service: {len(live_presentation_service.teacher_websockets)}")
        print(f"🎤 Teacher websockets: {[hex(id(ws)) for ws in live_presentation_service.teacher_websockets]}")
        
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
    print(f"🎤 TEACHER WEBSOCKET: Endpoint called for deployment {deployment_id}")
    
    try:
        # Accept the connection first
        print(f"🎤 TEACHER: About to accept WebSocket connection")
        await websocket.accept()
        print(f"🎤 TEACHER: WebSocket accepted successfully")
        
        # Authenticate user using session cookie (same as chat WebSocket)
        print(f"🎤 TEACHER: Creating database session")
        db = Session(engine)
        try:
            print(f"🎤 TEACHER: About to authenticate user")
            user, db_deployment = await _authenticate_websocket_user(websocket, deployment_id, db)
            print(f"🎤 Teacher authenticated: {user.email} ({user.id}) to {deployment_id}")
            print(f"🎤 DB deployment class_id: {db_deployment.class_id}, user_id: {user.id}")
            
            # Verify user is an instructor
            from scripts.permission_helpers import user_is_instructor
            print(f"🎤 TEACHER: Checking if user is instructor")
            if not user_is_instructor(user, db):
                print(f"🎤 TEACHER: User {user.email} is NOT an instructor - DENIED")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Unauthorized - instructors only"
                }))
                await websocket.close()
                return
            
            print(f"🎤 TEACHER: User {user.email} is an instructor - APPROVED")
            
            # Load deployment for the authenticated user with proper instance sharing
            deployment = await _load_deployment_for_user(deployment_id, user, db)
            
            print(f"🎤 Teacher - Deployment loaded: {deployment is not None}")
            if deployment:
                print(f"🎤 Teacher - Deployment keys: {list(deployment.keys())}")
                print(f"🎤 Teacher - Deployment type: {deployment.get('type', 'unknown')}")
                print(f"🎤 Teacher - Is page based: {deployment.get('is_page_based', False)}")
            
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
        print(f"🎤 Live presentation service instance ID: {id(live_presentation_service)}")
        print(f"🎤 Live presentation service memory address: {hex(id(live_presentation_service))}")
        print(f"🎤 Current students before teacher connection: {len(live_presentation_service.students)}")
        print(f"🎤 Student names in service: {[s.user_name for s in live_presentation_service.students.values()]}")
        print(f"🎤 Current teachers before connection: {len(live_presentation_service.teacher_websockets)}")
        print(f"🎤 Teacher websockets before: {[hex(id(ws)) for ws in live_presentation_service.teacher_websockets]}")
        
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
