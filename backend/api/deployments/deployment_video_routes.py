import boto3
from fastapi import APIRouter, Depends, Body
import os

from .deployment_shared import *

router = APIRouter()


def get_signed_video_url(filename: str):
    session = boto3.session.Session()
    client = session.client(
        "s3",
        region_name="tor1",
        endpoint_url="https://score-storage.tor1.digitaloceanspaces.com",
        aws_access_key_id=os.getenv("DO_SPACES_KEY"),
        aws_secret_access_key=os.getenv("DO_SPACES_SECRET"),
    )
    bucket = "score-storage"
    key = f"videos/{filename}"
    signed_url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=600,  # 10 minutes
    )
    return {"signedVideoUrl": signed_url}


@router.get("/{deployment_id}/video")
async def get_video_node(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    deployment_mem = await ensure_deployment_loaded(deployment_id, current_user, db)
    deployment = deployment_mem["mcp_deployment"]
    video_service = deployment._video_service
    video_url = video_service.get_video_url()
    filename = os.path.basename(video_url)
    signed_video_url = get_signed_video_url(filename)["signedVideoUrl"]
    return {
        "title": video_service.get_title(),
        "video_url": signed_video_url,
    }


@router.post("/{deployment_id}/video/progress")
async def update_video_progress(
    deployment_id: str,
    progress: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    """
    Update or create video progress for the current user.
    progress = { "watched_seconds": int, "total_seconds": int, "completed": bool }
    """
    from models.database.db_models import VideoProgress
    from sqlmodel import select

    vp = db.exec(
        select(VideoProgress).where(
            VideoProgress.user_id == current_user.id,
            VideoProgress.deployment_id == deployment_id,
        )
    ).first()

    if vp:
        vp.watched_seconds = progress.get("watched_seconds", vp.watched_seconds)
        vp.total_seconds = progress.get("total_seconds", vp.total_seconds)
        vp.completed = progress.get("completed", vp.completed)
        vp.last_updated = datetime.utcnow()
    else:
        vp = VideoProgress(
            user_id=current_user.id,
            deployment_id=deployment_id,
            watched_seconds=progress.get("watched_seconds", 0),
            total_seconds=progress.get("total_seconds", 0),
            completed=progress.get("completed", False),
        )
        db.add(vp)
    db.commit()
    return {"success": True}


@router.get("/{deployment_id}/video/progress")
async def get_all_video_progress(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_session),
):
    # Check instructor permissions here...
    from models.database.db_models import VideoProgress, User
    from sqlmodel import select

    progress_list = db.exec(
        select(VideoProgress, User.email)
        .join(User, User.id == VideoProgress.user_id)
        .where(VideoProgress.deployment_id == deployment_id)
    ).all()

    return [
        {
            "user_id": vp.user_id,
            "email": email,
            "watched_seconds": vp.watched_seconds,
            "total_seconds": vp.total_seconds,
            "completed": vp.completed,
            "last_updated": vp.last_updated.isoformat(),
        }
        for vp, email in progress_list
    ]
