"""Frame annotation utilities (bounding boxes, labels, virtual line)."""

from __future__ import annotations

from typing import Dict, Sequence, Tuple

import cv2
import numpy as np

from app.core.detector import Detection

# A fixed, dark-friendly palette keyed by class id.
_PALETTE = [
    (56, 142, 255), (94, 224, 163), (255, 176, 59), (231, 94, 130),
    (170, 120, 255), (72, 209, 204), (247, 220, 111), (255, 120, 71),
    (130, 224, 255), (196, 156, 255), (149, 231, 126), (255, 149, 200),
]


def color_for_class(class_id: int) -> Tuple[int, int, int]:
    return _PALETTE[class_id % len(_PALETTE)]


def draw_detections(
    frame: np.ndarray,
    detections: Sequence[Detection],
    line: Dict | None = None,
) -> np.ndarray:
    """Draw boxes, class labels, confidence and track IDs onto ``frame``."""
    for det in detections:
        x1, y1, x2, y2 = det.bbox()
        color = color_for_class(det.class_id)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        label = f"{det.class_name} {det.confidence:.2f}"
        if det.track_id is not None:
            label = f"#{det.track_id} {label}"

        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        top = max(y1 - th - baseline - 4, 0)
        cv2.rectangle(frame, (x1, top), (x1 + tw + 8, top + th + baseline + 6), color, -1)
        cv2.putText(
            frame,
            label,
            (x1 + 4, top + th + 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (18, 18, 24),
            1,
            cv2.LINE_AA,
        )

    if line and line.get("enabled"):
        _draw_line(frame, line)
    return frame


def _draw_line(frame: np.ndarray, line: Dict) -> None:
    height, width = frame.shape[:2]
    position = float(line.get("position", 0.5))
    color = (60, 200, 255)
    if line.get("orientation") == "horizontal":
        y = int(position * height)
        cv2.line(frame, (0, y), (width, y), color, 2)
        cv2.putText(frame, "count line", (12, max(y - 8, 16)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)
    else:
        x = int(position * width)
        cv2.line(frame, (x, 0), (x, height), color, 2)
        cv2.putText(frame, "count line", (x + 8, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)


def draw_hud(frame: np.ndarray, fps: float | None, objects: int, latency_ms: float | None) -> np.ndarray:
    """Draw a small heads-up display of live metrics."""
    height = frame.shape[0]
    lines = [f"Objects: {objects}"]
    if fps is not None:
        lines.append(f"FPS: {fps:.1f}")
    if latency_ms is not None:
        lines.append(f"Inference: {latency_ms:.0f} ms")
    y = height - 12 - (len(lines) - 1) * 20
    for text in lines:
        cv2.putText(frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (240, 240, 240), 1, cv2.LINE_AA)
        y += 20
    return frame
