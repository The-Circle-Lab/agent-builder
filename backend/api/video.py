from fastapi import APIRouter, Depends, HTTPException, Query
import boto3
import os

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.get("/get-upload-url")
def get_upload_url(filename: str, content_type: str):
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
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=600,
    )
    file_url = f"https://score-storage.tor1.digitaloceanspaces.com/{key}"
    return {"uploadUrl": upload_url, "fileUrl": file_url}


@router.delete("/{filename}")
def delete_video(filename: str):
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
    try:
        client.delete_object(Bucket=bucket, Key=key)
        return {"message": "Video deleted successfully", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete video: {str(e)}")
