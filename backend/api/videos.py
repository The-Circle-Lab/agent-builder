import uuid
import mimetypes
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse, FileResponse
from sqlmodel import Session as DBSession, select

from api.auth import get_current_user
from models.database.db_models import User, Workflow, Video, Deployment
from database.database import get_session
from scripts.permission_helpers import user_can_access_workflow, user_can_modify_workflow, user_can_access_deployment
from api.file_storage import store_file, delete_stored_file, STORAGE_BASE_DIR
import sys

# Ensure we can load configuration from scripts
sys.path.append(str(Path(__file__).parent.parent))
from scripts.config import load_config  # noqa: E402

config = load_config()
video_config = config.get("video_processing", {})

ALLOWED_VIDEO_EXTENSIONS = {
    ext.lower() for ext in video_config.get("allowed_extensions", [".mp4", ".mov", ".m4v", ".webm", ".mkv"])
}
ALLOWED_VIDEO_MIME_TYPES = {
    mime.lower()
    for mime in video_config.get(
        "allowed_mime_types",
        [
            "video/mp4",
            "video/quicktime",
            "video/x-m4v",
            "video/webm",
            "video/x-matroska",
        ],
    )
}
MAX_VIDEO_SIZE_MB = video_config.get("max_file_size_mb", 500)
MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024
MAX_FILES_PER_UPLOAD = video_config.get("max_files_per_upload", 5)

router = APIRouter(prefix="/api/videos", tags=["videos"])


def _sanitize_filename(name: str) -> str:
    stem = Path(name).stem or "video"
    safe = "".join(ch for ch in stem if ch.isalnum() or ch in {"-", "_"})
    return safe or "video"


def _determine_mime_type(original_name: str, content_type: str | None) -> str:
    if content_type:
        lowered = content_type.lower()
        if lowered in ALLOWED_VIDEO_MIME_TYPES:
            return lowered
    guessed, _ = mimetypes.guess_type(original_name)
    if guessed and guessed.lower() in ALLOWED_VIDEO_MIME_TYPES:
        return guessed.lower()
    return "video/mp4"


def _serialize_video(video: Video) -> dict:
    return {
        "id": video.id,
        "filename": video.original_filename,
        "file_size": video.file_size,
        "mime_type": video.mime_type,
        "duration_seconds": video.duration_seconds,
        "uploaded_at": video.uploaded_at.isoformat(),
        "thumbnail_url": None,
        "stream_url": f"/api/videos/{video.id}/stream",
        "download_url": f"/api/videos/{video.id}/download",
        "status": video.status,
    }


def _validate_video_file(upload: UploadFile, file_bytes: bytes) -> None:
    original_name = upload.filename or "video"
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_VIDEO_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_VIDEO_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid video type for '{original_name}'. Allowed extensions: {allowed}",
        )

    mime_type = (upload.content_type or "").lower()
    if mime_type and mime_type not in ALLOWED_VIDEO_MIME_TYPES:
        allowed_mime = ", ".join(sorted(ALLOWED_VIDEO_MIME_TYPES))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type '{mime_type}' for '{original_name}'. Allowed types: {allowed_mime}",
        )

    if len(file_bytes) > MAX_VIDEO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File '{original_name}' exceeds {MAX_VIDEO_SIZE_MB}MB limit",
        )


@router.post("/upload")
async def upload_videos(
    files: List[UploadFile] = File(...),
    workflow_id: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No video files provided",
        )

    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_FILES_PER_UPLOAD} videos allowed per upload",
        )

    workflow = db.get(Workflow, workflow_id)
    if not workflow or not workflow.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not user_can_modify_workflow(current_user, workflow, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors of this class can upload videos",
        )

    created_videos: list[Video] = []

    for file in files:
        original_name = file.filename or "video"
        file_bytes = await file.read()
        _validate_video_file(file, file_bytes)

        mime_type = _determine_mime_type(original_name, file.content_type)
        upload_id = uuid.uuid4().hex
        extension = Path(original_name).suffix.lower() or ".mp4"
        sanitized = _sanitize_filename(original_name)
        stored_filename = f"{sanitized}_{upload_id}{extension}"

        storage_path = store_file(file_bytes, workflow_id, upload_id, stored_filename)

        video = Video(
            filename=stored_filename,
            original_filename=original_name,
            file_size=len(file_bytes),
            mime_type=mime_type,
            storage_path=storage_path,
            upload_id=upload_id,
            workflow_id=workflow_id,
            uploaded_by_id=current_user.id,
            status="ready",
        )
        db.add(video)
        created_videos.append(video)

    db.commit()

    for video in created_videos:
        db.refresh(video)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "workflow_id": workflow_id,
            "videos": [_serialize_video(video) for video in created_videos],
            "message": "Videos uploaded successfully",
        },
    )


@router.get("/workflows/{workflow_id}/videos")
async def list_workflow_videos(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    workflow = db.get(Workflow, workflow_id)
    if not workflow or not workflow.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not user_can_access_workflow(current_user, workflow, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workflow",
        )

    videos = db.exec(
        select(Video)
        .where(Video.workflow_id == workflow_id, Video.is_active == True)  # noqa: E712
        .order_by(Video.uploaded_at.desc())
    ).all()

    return {
        "workflow_id": workflow_id,
        "workflow_name": workflow.name,
        "video_count": len(videos),
        "videos": [_serialize_video(video) for video in videos],
    }


@router.get("/{video_id}/stream")
async def stream_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    video = db.get(Video, video_id)
    if not video or not video.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    workflow = db.get(Workflow, video.workflow_id)
    if not workflow or not workflow.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Check if user has workflow access (owner/instructor)
    has_workflow_access = user_can_access_workflow(current_user, workflow, db)
    
    # If not, check if user has access through any deployment using this video
    has_deployment_access = False
    if not has_workflow_access:
        # Find deployments that use this workflow and check if user has access
        deployments = db.exec(
            select(Deployment).where(
                Deployment.workflow_id == workflow.id,
                Deployment.is_active == True
            )
        ).all()
        
        for deployment in deployments:
            if user_can_access_deployment(current_user, deployment, db):
                has_deployment_access = True
                break
    
    if not has_workflow_access and not has_deployment_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this video")

    full_path = STORAGE_BASE_DIR / video.storage_path
    if not full_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found")

    return FileResponse(
        path=str(full_path),
        filename=video.original_filename,
        media_type=video.mime_type or "video/mp4",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/{video_id}/download")
async def download_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    video = db.get(Video, video_id)
    if not video or not video.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    workflow = db.get(Workflow, video.workflow_id)
    if not workflow or not workflow.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Check if user has workflow access (owner/instructor)
    has_workflow_access = user_can_access_workflow(current_user, workflow, db)
    
    # If not, check if user has access through any deployment using this video
    has_deployment_access = False
    if not has_workflow_access:
        # Find deployments that use this workflow and check if user has access
        deployments = db.exec(
            select(Deployment).where(
                Deployment.workflow_id == workflow.id,
                Deployment.is_active == True
            )
        ).all()
        
        for deployment in deployments:
            if user_can_access_deployment(current_user, deployment, db):
                has_deployment_access = True
                break
    
    if not has_workflow_access and not has_deployment_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this video")

    full_path = STORAGE_BASE_DIR / video.storage_path
    if not full_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found")

    return FileResponse(
        path=str(full_path),
        filename=video.original_filename,
        media_type=video.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=\"{video.original_filename}\""},
    )


@router.delete("/{video_id}")
async def remove_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    video = db.get(Video, video_id)
    if not video or not video.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    workflow = db.get(Workflow, video.workflow_id)
    if not workflow or not workflow.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not user_can_modify_workflow(current_user, workflow, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors of this class can delete videos",
        )

    if video.storage_path:
        try:
            delete_stored_file(video.storage_path)
        except Exception as exc:  # pragma: no cover - best effort cleanup
            print(f"Warning: failed to delete stored video file {video.storage_path}: {exc}")

    video.is_active = False
    db.add(video)
    db.commit()

    return {
        "message": f"Video '{video.original_filename}' removed successfully",
        "video_id": video_id,
        "filename": video.original_filename,
    }
