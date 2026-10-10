"""Video probing and safe metadata extraction."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import cv2


def probe_video(path: Path | str) -> Optional[Dict[str, Any]]:
    """Return basic metadata for a video file, or ``None`` if unreadable."""
    path = str(path)
    capture = cv2.VideoCapture(path)
    try:
        if not capture.isOpened():
            return None
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        ok, frame = capture.read()
        if not ok or frame is None:
            return None
        duration = (frame_count / fps) if fps > 0 else 0.0
        return {
            "width": width or int(frame.shape[1]),
            "height": height or int(frame.shape[0]),
            "fps": round(fps, 3),
            "frame_count": frame_count,
            "duration_s": round(duration, 3),
            "readable": True,
        }
    finally:
        capture.release()


def is_readable_video(path: Path | str) -> bool:
    return probe_video(path) is not None
