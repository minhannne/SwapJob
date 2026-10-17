from io import BytesIO
from pathlib import Path
from uuid import uuid4
import warnings

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import UserResponse


AVATAR_DIRECTORY = (
    Path(__file__).resolve().parent.parent / "uploads" / "avatars"
)
AVATAR_DIRECTORY.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000

router = APIRouter(prefix="/api/users/me", tags=["Avatar"])


def prepare_avatar(content: bytes) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)

            with Image.open(
                BytesIO(content),
                formats=["JPEG", "PNG", "WEBP"],
            ) as source:
                if source.width * source.height > MAX_PIXELS:
                    raise HTTPException(
                        status_code=413,
                        detail="Image dimensions are too large",
                    )

                source.verify()

            with Image.open(
                BytesIO(content),
                formats=["JPEG", "PNG", "WEBP"],
            ) as source:
                image = ImageOps.exif_transpose(source).convert("RGBA")
                image.thumbnail((512, 512))

                clean_image = Image.new("RGBA", image.size)
                clean_image.paste(image)

                output = BytesIO()
                clean_image.save(output, format="PNG")
                return output.getvalue()

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid image. Please choose a JPG, PNG, or WebP file",
        ) from None


@router.post("/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        content = file.file.read(MAX_FILE_SIZE + 1)
    finally:
        file.file.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Please choose an image",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must not exceed 5 MB",
        )

    image_content = prepare_avatar(content)
    filename = f"{uuid4().hex}.png"
    destination = AVATAR_DIRECTORY / filename
    avatar_url = f"/api/avatars/{filename}"

    try:
        destination.write_bytes(image_content)

        with engine.begin() as connection:
            updated_user_id = connection.execute(
                text("""
                    UPDATE users
                    SET avatar_url = :avatar_url
                    WHERE id = :user_id
                    RETURNING id
                """),
                {
                    "avatar_url": avatar_url,
                    "user_id": current_user.id,
                },
            ).scalar_one_or_none()

            if updated_user_id is None:
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

    except HTTPException:
        destination.unlink(missing_ok=True)
        raise

    except SQLAlchemyError:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503,
            detail="Unable to save avatar to database",
        ) from None

    except OSError:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503,
            detail="Avatar storage unavailable",
        ) from None

    return {"avatar_url": avatar_url}