"""Video upload / status schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.sessions import SessionResponse


class UploadResponse(BaseModel):
    video_id: str
    session: SessionResponse
    filename: str
    size_bytes: int
    metadata: dict[str, Any] = {}


class VideoStatusResponse(BaseModel):
    session: SessionResponse
    progress: float
    output_available: bool
    download_url: str | None = None
