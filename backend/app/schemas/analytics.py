"""Analytics schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class AnalyticsSummary(BaseModel):
    total_sessions: int = 0
    total_events: int = 0
    total_detections: int = 0
    total_unique_tracks: int = 0
    total_processed_frames: int = 0
    total_video_seconds: float = 0.0
    unique_classes: int = 0
    avg_fps: Optional[float] = None
    avg_inference_ms: Optional[float] = None
    sessions_by_status: dict[str, int] = {}
    has_data: bool = False


class ClassStatistic(BaseModel):
    class_id: Optional[int] = None
    class_name: str
    event_count: int = 0
    unique_tracks: int = 0
    avg_confidence: Optional[float] = None


class TimeSeriesPoint(BaseModel):
    bucket: str
    events: int = 0


class SessionComparison(BaseModel):
    session_id: str
    name: str
    source_type: str
    status: str
    created_at: str
    processed_frames: int = 0
    unique_tracks: int = 0
    event_count: int = 0
    avg_fps: Optional[float] = None
    avg_inference_ms: Optional[float] = None


class MetricPoint(BaseModel):
    frame_index: Optional[int] = None
    created_at: str
    fps: Optional[float] = None
    inference_ms: Optional[float] = None
    object_count: Optional[int] = None
