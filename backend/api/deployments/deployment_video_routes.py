from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .deployment_shared import (
    DeploymentType,
    AgentDeployment,
    DBSession,
    User,
    ensure_deployment_loaded,
    get_current_user,
    get_deployment_and_check_access,
    get_session,
    validate_deployment_type,
)
from models.database.db_models import Video

router = APIRouter()


class VideoAssetResponse(BaseModel):
    id: str
    filename: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    duration_seconds: Optional[float] = None
    uploaded_at: Optional[str] = None
    status: Optional[str] = None
    stream_url: Optional[str] = None
    download_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    source: Optional[str] = None


class VideoDeploymentResponse(BaseModel):
    deployment_id: str
    video: Optional[VideoAssetResponse] = None
    message: Optional[str] = None


def _build_asset_from_db(video: Video) -> VideoAssetResponse:
    return VideoAssetResponse(
        id=str(video.id),
        filename=video.original_filename or video.filename,
        file_size=video.file_size,
        mime_type=video.mime_type,
        duration_seconds=video.duration_seconds,
        uploaded_at=video.uploaded_at.isoformat() if video.uploaded_at else None,
        status=video.status,
        stream_url=f"/api/videos/{video.id}/stream",
        download_url=f"/api/videos/{video.id}/download",
        thumbnail_url=None,
        source="database",
    )


def _coerce_optional_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_optional_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_asset_from_config(metadata: dict) -> VideoAssetResponse:
    video_id = metadata.get("id")
    if video_id is not None:
        video_id = str(video_id)
    stream_url = metadata.get("stream_url") or metadata.get("url")
    download_url = metadata.get("download_url")
    if video_id and not stream_url:
        stream_url = f"/api/videos/{video_id}/stream"
    if video_id and not download_url:
        download_url = f"/api/videos/{video_id}/download"

    raw_file_size = metadata.get("file_size")
    file_size = _coerce_optional_int(raw_file_size)
    if file_size is None:
        file_size = _coerce_optional_int(metadata.get("fileSize"))

    raw_duration = metadata.get("duration_seconds")
    duration_seconds = _coerce_optional_float(raw_duration)
    if duration_seconds is None:
        duration_seconds = _coerce_optional_float(metadata.get("durationSeconds"))

    return VideoAssetResponse(
        id=str(video_id) if video_id is not None else "",
        filename=metadata.get("filename"),
        file_size=file_size,
        mime_type=metadata.get("mime_type") or metadata.get("fileType"),
        duration_seconds=duration_seconds,
        uploaded_at=metadata.get("uploaded_at") or metadata.get("uploadedAt"),
        status=metadata.get("status"),
        stream_url=stream_url,
        download_url=download_url,
        thumbnail_url=metadata.get("thumbnail_url") or metadata.get("thumbnailUrl"),
        source="configuration",
    )


@router.get("/{deployment_id}/video", response_model=VideoDeploymentResponse)
async def get_video_deployment_details(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """Return metadata for the selected video in a video deployment."""

    db_deployment = await get_deployment_and_check_access(
        deployment_id, current_user, db
    )
    try:
        validate_deployment_type(db_deployment, DeploymentType.VIDEO)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_400_BAD_REQUEST:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deployment is not a video deployment",
            ) from exc
        raise

    deployment_info = await ensure_deployment_loaded(
        deployment_id, current_user.id, db
    )

    agent_deployment = deployment_info.get("mcp_deployment")
    if not isinstance(agent_deployment, AgentDeployment):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Video deployment is not loaded in memory",
        )

    video_service = agent_deployment.get_video_service()
    if not video_service:
        return VideoDeploymentResponse(
            deployment_id=deployment_id,
            message="No video configuration found for this deployment",
        )

    selected_id = video_service.get_selected_video_id()
    if not selected_id:
        return VideoDeploymentResponse(
            deployment_id=deployment_id,
            message="No video has been selected for this deployment",
        )

    # Attempt to load authoritative metadata from the database.
    db_video = None
    try:
        numeric_id = int(str(selected_id))
    except (TypeError, ValueError):
        numeric_id = None

    if numeric_id is not None:
        db_video = db.get(Video, numeric_id)
        if (
            not db_video
            or not db_video.is_active
            or db_video.workflow_id != db_deployment.workflow_id
        ):
            db_video = None

    if db_video:
        asset = _build_asset_from_db(db_video)
        return VideoDeploymentResponse(deployment_id=deployment_id, video=asset)

    # Fallback to workflow configuration metadata if database lookup fails.
    config_metadata = video_service.build_config_metadata()
    if config_metadata:
        asset = _build_asset_from_config(config_metadata)
        if not asset.id:
            asset.id = str(selected_id)
        return VideoDeploymentResponse(deployment_id=deployment_id, video=asset)

    return VideoDeploymentResponse(
        deployment_id=deployment_id,
        message="Selected video is no longer available",
    )
