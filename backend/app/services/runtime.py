"""In-memory runtime state for active processing sessions.

Persistent state lives in SQLite; this module holds the volatile, per-session
state required by the worker threads and the streaming endpoints (latest
annotated frame, live counters, cancellation flag).
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from app.core.counting import LineCounter, UniqueCounter
from app.schemas.settings_models import UserSettings


@dataclass
class LiveMetrics:
    status: str = "created"
    fps: Optional[float] = None
    inference_ms: Optional[float] = None
    object_count: int = 0
    frame_index: int = 0
    processed_frames: int = 0
    total_frames: int = 0
    unique_tracks: int = 0
    event_count: int = 0
    class_counts: Dict[str, int] = field(default_factory=dict)
    line_counts: Dict[str, int] = field(default_factory=dict)
    detections: List[dict] = field(default_factory=list)
    error: Optional[str] = None
    message: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "fps": round(self.fps, 2) if self.fps is not None else None,
            "inference_ms": round(self.inference_ms, 2) if self.inference_ms is not None else None,
            "object_count": self.object_count,
            "frame_index": self.frame_index,
            "processed_frames": self.processed_frames,
            "total_frames": self.total_frames,
            "unique_tracks": self.unique_tracks,
            "event_count": self.event_count,
            "class_counts": dict(self.class_counts),
            "line_counts": dict(self.line_counts),
            "detections": list(self.detections),
            "error": self.error,
            "message": self.message,
        }


class FrameBuffer:
    """Bounded, drop-oldest buffer holding only the most recent frame."""

    def __init__(self, maxlen: int = 1) -> None:
        self._items: Deque[bytes] = deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self._version = 0

    def put(self, jpeg: bytes) -> None:
        with self._lock:
            self._items.append(jpeg)
            self._version += 1

    def get(self, last_version: int = -1, timeout: float = 2.0) -> tuple[Optional[bytes], int]:
        """Return the latest frame and its version, waiting briefly for new data."""
        waited = 0.0
        step = 0.02
        while True:
            with self._lock:
                if self._version != last_version and self._items:
                    return self._items[-1], self._version
                version = self._version
                if waited >= timeout:
                    return (self._items[-1] if self._items else None), version
            time.sleep(step)
            waited += step

    def latest(self) -> Optional[bytes]:
        with self._lock:
            return self._items[-1] if self._items else None


class RuntimeState:
    """Volatile state for one processing session."""

    def __init__(self, session_id: str, settings: UserSettings) -> None:
        self.session_id = session_id
        self.settings = settings
        self.cancel_event = threading.Event()
        self.stop_reason: Optional[str] = None
        self.metrics = LiveMetrics()
        self.frames = FrameBuffer(maxlen=1)
        self.unique_counter = UniqueCounter()
        self.line_counter: Optional[LineCounter] = None
        if settings.line_crossing_enabled:
            self.line_counter = LineCounter(
                orientation=settings.line_orientation,
                position=settings.line_position,
                direction=settings.line_direction,
            )
        self.output_path: Optional[str] = None
        self.thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self.metrics_lock = threading.Lock()

    def update_metrics(self, **kwargs) -> None:
        with self.metrics_lock:
            for key, value in kwargs.items():
                setattr(self.metrics, key, value)

    @property
    def is_cancelled(self) -> bool:
        return self.cancel_event.is_set()

    def request_cancel(self, reason: str = "user") -> None:
        self.stop_reason = reason
        self.cancel_event.set()
