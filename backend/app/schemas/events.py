"""Detection event schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class EventResponse(BaseModel):
    id: int
    session_id: str
    created_at: str
    frame_index: Optional[int] = None
    video_time_s: Optional[float] = None
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    confidence: Optional[float] = None
    track_id: Optional[int] = None
    x1: Optional[float] = None
    y1: Optional[float] = None
    x2: Optional[float] = None
    y2: Optional[float] = None
    source_type: Optional[str] = None
    event_type: str = "detection"


class EventFilter(BaseModel):
    session_id: Optional[str] = None
    class_name: Optional[str] = None
    class_id: Optional[int] = None
    min_confidence: Optional[float] = None
    start: Optional[str] = None
    end: Optional[str] = None
    event_type: Optional[str] = None
    track_id: Optional[int] = None


class EventListResponse(BaseModel):
    items: List[EventResponse]
    total: int
    limit: int
    offset: int
