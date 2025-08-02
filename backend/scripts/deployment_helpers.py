from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from fastapi import HTTPException, WebSocket, status
from fastapi.websockets import WebSocketDisconnect
from sqlmodel import Session as DBSession, select

from models.database.db_models import (
    AuthSession,
    ChatConversation,
    ChatMessage,
    Deployment,
    User,
)
from scripts.permission_helpers import user_can_access_deployment
from services.deployment_manager import (
    get_active_deployment,
    load_deployment_on_demand,
)

__all__ = [
    "_extract_sid_from_websocket",
    "_send_error_and_close",
    "_authenticate_websocket_user",
    "_save_chat_to_db",
    "_load_deployment_for_user",
]


# Return the session id from either cookies or query params.
def _extract_sid_from_websocket(websocket: WebSocket) -> str | None:  # noqa: D401

    cookie_header = websocket.headers.get("cookie", "")
    for cookie in cookie_header.split(";"):
        cookie = cookie.strip()
        if cookie.startswith("sid="):
            return cookie.split("=", 1)[1]

    # Fallback – query parameter
    return websocket.query_params.get("sid") 


async def _send_error_and_close(
    websocket: WebSocket,
    message: str,
    reason: str = "error",
) -> None:
    await websocket.send_json({"type": "error", "message": message})
    await websocket.close(code=1000, reason=reason)


async def _authenticate_websocket_user(
    websocket: WebSocket,
    deployment_id: str,
    db: DBSession,
) -> Tuple[User, Deployment]:
    sid = _extract_sid_from_websocket(websocket)
    if not sid:
        await _send_error_and_close(websocket, "No session cookie found", "No authentication")
        raise WebSocketDisconnect()

    session = db.get(AuthSession, sid)
    if not session or session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        await _send_error_and_close(websocket, "Invalid or expired session", "Invalid session")
        raise WebSocketDisconnect()

    user = db.get(User, session.user_id)
    if not user:
        await _send_error_and_close(websocket, "User not found", "User not found")
        raise WebSocketDisconnect()

    # Check deployment + access rights
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,  # noqa: E712 – SQLModel literal True
        )
    ).first()

    if not db_deployment:
        await _send_error_and_close(websocket, "Deployment not found", "Deployment not found")
        raise WebSocketDisconnect()

    if not user_can_access_deployment(user, db_deployment, db):
        await _send_error_and_close(
            websocket,
            "Access denied. You must be a member of this class to use this deployment.",
            "Access denied",
        )
        raise WebSocketDisconnect()

    return user, db_deployment

def _save_chat_to_db(
    db: DBSession,
    user_id: int,
    deployment_id: str,
    conversation_id: int,
    user_message: str,
    result: Dict[str, Any],
) -> None:
    try:
        conversation = db.get(ChatConversation, conversation_id)
        if (
            conversation
            and conversation.user_id == user_id
            and conversation.deployment_id == deployment_id
        ):
            db.add(
                ChatMessage(
                    conversation_id=conversation_id,
                    message_text=user_message,
                    is_user_message=True,
                )
            )
            db.add(
                ChatMessage(
                    conversation_id=conversation_id,
                    message_text=result["response"],
                    is_user_message=False,
                    sources=result["sources"] if result["sources"] else None,
                )
            )
            conversation.updated_at = datetime.now(timezone.utc)
            db.add(conversation)
            db.commit()
    except Exception as exc:
        print(f"Failed to save chat to DB: {exc}")
        db.rollback()

async def _load_deployment_for_user(
    deployment_id: str,
    user: User,
    db: DBSession,
) -> Dict[str, Any]:
    db_deployment = db.exec(
        select(Deployment).where(
            Deployment.deployment_id == deployment_id,
            Deployment.is_active == True,  # noqa: E712 – SQLModel literal True
        )
    ).first()

    if not db_deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    if not user_can_access_deployment(user, db_deployment, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You must be a member of this class to use this deployment.",
        )

    if not await load_deployment_on_demand(deployment_id, user.id, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found or failed to initialize",
        )

    return get_active_deployment(deployment_id) 
