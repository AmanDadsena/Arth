"""Upload validation. Photos and audio are processed in memory and discarded
(docs/SPEC.md §5.3): nothing here writes to disk.

Images are re-encoded, which drops EXIF (phone photos carry GPS coordinates)
and anything hidden after the image data.
"""

import base64
import io

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import ApiError

# Decompression-bomb guard: a 5 MB PNG can declare a 50k x 50k canvas.
Image.MAX_IMAGE_PIXELS = 40_000_000

_IMAGE_MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
}


def _sniff_image(head: bytes) -> str | None:
    for magic, kind in _IMAGE_MAGIC.items():
        if head.startswith(magic):
            return kind
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


async def read_limited(upload: UploadFile, limit: int, what: str) -> bytes:
    data = await upload.read(limit + 1)
    await upload.close()
    if len(data) > limit:
        raise ApiError(413, "too_large", f"The {what} is too large.")
    if not data:
        raise ApiError(400, f"missing_{what}", f"{what} is required")
    return data


async def prepare_image(upload: UploadFile | None, limit: int, max_side: int) -> str:
    """Validate, strip metadata, downscale; returns base64 JPEG for the model."""
    if upload is None:
        raise ApiError(400, "missing_image", "image is required")
    raw = await read_limited(upload, limit, "image")
    if _sniff_image(raw[:16]) is None:
        raise ApiError(415, "unsupported_image", "Please send a JPEG, PNG or WebP photo.")
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img)  # keep phone orientation, then drop EXIF
            img = img.convert("RGB")
            img.thumbnail((max_side, max_side))
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=85)  # no exif= argument: metadata is gone
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise ApiError(415, "unsupported_image", "This photo could not be opened.") from None
    return base64.b64encode(out.getvalue()).decode()


async def read_audio(upload: UploadFile | None, limit: int) -> bytes:
    if upload is None:
        raise ApiError(400, "missing_audio", "audio is required")
    raw = await read_limited(upload, limit, "audio")
    # WebM/Matroska (EBML), Ogg, WAV (RIFF....WAVE), MP4/M4A (....ftyp)
    head = raw[:12]
    if not (
        head.startswith(b"\x1a\x45\xdf\xa3")
        or head.startswith(b"OggS")
        or (head[:4] == b"RIFF" and head[8:12] == b"WAVE")
        or head[4:8] == b"ftyp"
    ):
        raise ApiError(415, "unsupported_audio", "Please send a WebM, Ogg, WAV or M4A recording.")
    return raw
