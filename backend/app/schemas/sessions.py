"""Session schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.settings_models import UserSettings


class SessionCreate(BaseModel):
    """Create a processing session (webcam capture or video analysis)."""

    name: Optional[str] = None
    source_type: str = Field("webcam", pattern="^(webcam|video)$")
    camera_index: int = Field(0, ge=0, le=16)
    video_id: Optional[str] = None
    config: Optional[UserSettings] = None


class SessionResponse(BaseModel):
    id: str
    name: str
    source_type: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None
    total_frames: int = 0
    processed_frames: int = 0
    unique_tracks: int = 0
    event_count: int = 0
    avg_fps: Optional[float] = None
    avg_inference_ms: Optional[float] = None
    progress: float = 0.0
    config: Dict[str, Any] = {}
    source_meta: Dict[str, Any] = {}
    class_counts: Dict[str, int] = {}
    output_available: bool = False
    stream_available: bool = False
    download_url: Optional[str] = None
    stream_url: Optional[str] = None


class SessionListResponse(BaseModel):
    items: List[SessionResponse]
    total: int
