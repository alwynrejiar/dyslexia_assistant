import io
from typing import Optional

from PIL import Image, UnidentifiedImageError
from fastapi import HTTPException, UploadFile

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
}

MAX_FILE_BYTES = 10 * 1024 * 1024


def validate_upload_file(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file name provided")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use jpg, png, webp, or bmp",
        )


def validate_image_bytes(image_bytes: bytes) -> None:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(image_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid image data")


def normalized_mime(content_type: Optional[str]) -> str:
    if not content_type:
        return "image/jpeg"
    if content_type == "image/jpg":
        return "image/jpeg"
    return content_type
