"""Webcam capture and lifecycle management."""

from __future__ import annotations

import os
import threading
import time
from typing import Dict, List, Optional

import cv2

from app.core.annotations import draw_detections, draw_hud
from app.core.counting import class_distribution
from app.core.detector import Detector
from app.core.metrics import AverageMeter, FpsMeter
from app.database.db import Database, utc_now_iso
from app.logging_config import get_logger
from app.schemas.system import CameraInfo
from app.services.event_service import EventSampler, EventService
from app.services.runtime import RuntimeState

logger = get_logger(__name__)

_MAX_READ_FAILURES = 60
_METRIC_SAMPLE_EVERY = 5


class CameraError(RuntimeError):
    pass


def _open_capture(index: int, width: int = 0, height: int = 0) -> cv2.VideoCapture:
    if os.name == "nt":
        capture = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    else:
        capture = cv2.VideoCapture(index)
    if width > 0 and height > 0:
        # Best-effort: many drivers ignore or approximate this. Requesting a
        # smaller capture size reduces decode/annotate/JPEG cost downstream.
        try:
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, float(width))
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, float(height))
        except Exception:  # pragma: no cover - backend dependent
            pass
    try:
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:  # pragma: no cover - backend dependent
        pass
    return capture


class CameraWorker:
    """Runs the webcam loop on a worker thread until cancelled."""

    def __init__(
        self,
        runtime: RuntimeState,
        camera_index: int,
        detector: Detector,
        event_service: EventService,
        db: Database,
    ) -> None:
        self.runtime = runtime
        self.camera_index = camera_index
        self.detector = detector
        self.event_service = event_service
        self.db = db

    def run(self) -> Dict:
        settings = self.runtime.settings
        capture = _open_capture(
            self.camera_index, settings.camera_width, settings.camera_height
        )
        if not capture.isOpened():
            capture.release()
            raise CameraError(
                f"Camera {self.camera_index} could not be opened. "
                "It may be in use by another application or not connected."
            )

        sampler = EventSampler(settings)
        fps_meter = FpsMeter()
        inference_meter = AverageMeter()
        interval = max(1, int(settings.frame_interval))
        frame_count = 0
        processed = 0
        recorded_events = 0
        failures = 0
        jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(settings.jpeg_quality)]

        message = (
            "Live capture running"
            if interval == 1
            else f"Live capture running (inference every {interval} frames)"
        )
        self.runtime.update_metrics(status="running", message=message)

        try:
            while not self.runtime.is_cancelled:
                ok, frame = capture.read()
                if not ok or frame is None:
                    failures += 1
                    if failures >= _MAX_READ_FAILURES:
                        raise CameraError("Camera stream stopped returning frames.")
                    time.sleep(0.02)
                    continue
                failures = 0
                frame_count += 1
                if interval > 1 and (frame_count - 1) % interval != 0:
                    # Skip inference on this frame but keep draining the camera so
                    # we always analyse a fresh frame (never a stale backlog). The
                    # last annotated frame stays in the runtime buffer for the
                    # live stream, so the browser view does not freeze.
                    continue
                height, width = frame.shape[:2]

                detections, inference_ms, _names = self.detector.run(
                    frame, settings, tracking=settings.tracking_enabled
                )
                inference_meter.update(inference_ms)

                self.runtime.unique_counter.update(detections)
                line_crossings = []
                if self.runtime.line_counter is not None:
                    line_crossings = self.runtime.line_counter.update(detections, width, height)

                recorded_events += self.event_service.record(
                    self.runtime.session_id, "webcam", processed, None,
                    detections, sampler, line_crossings,
                )

                annotated = draw_detections(frame, detections, line=_line_dict(settings))
                fps_value = fps_meter.tick()
                draw_hud(annotated, fps_value, len(detections), inference_ms)

                processed += 1
                self.runtime.update_metrics(
                    fps=fps_value,
                    inference_ms=inference_ms,
                    object_count=len(detections),
                    frame_index=processed,
                    processed_frames=processed,
                    unique_tracks=self.runtime.unique_counter.total,
                    event_count=recorded_events,
                    class_counts=class_distribution(detections),
                    line_counts=self.runtime.line_counter.per_class() if self.runtime.line_counter else {},
                    detections=[d.as_dict() for d in detections],
                )

                if processed % _METRIC_SAMPLE_EVERY == 0:
                    self._record_metric(fps_value, inference_ms, len(detections))

                ok, buffer = cv2.imencode(".jpg", annotated, jpeg_params)
                if ok:
                    self.runtime.frames.put(buffer.tobytes())
        finally:
            capture.release()

        return {
            "processed_frames": processed,
            "unique_tracks": self.runtime.unique_counter.total,
            "class_counts": self.runtime.unique_counter.per_class(),
            "event_count": recorded_events,
            "line_counts": self.runtime.line_counter.per_class() if self.runtime.line_counter else {},
            "avg_inference_ms": inference_meter.value,
            "avg_fps": fps_meter.value,
            "cancelled": self.runtime.is_cancelled,
        }

    def _record_metric(self, fps: Optional[float], inference_ms: Optional[float], objects: int) -> None:
        self.db.execute(
            """
            INSERT INTO metrics(session_id, frame_index, created_at, fps, inference_ms, object_count)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (self.runtime.session_id, self.runtime.metrics.frame_index, utc_now_iso(),
             fps, inference_ms, objects),
        )


class CameraManager:
    """Best-effort local camera enumeration with a short-lived cache."""

    def __init__(self, max_index: int = 5, cache_seconds: float = 15.0) -> None:
        self.max_index = max_index
        self.cache_seconds = cache_seconds
        self._cache: Dict[bool, tuple[float, List[CameraInfo]]] = {}
        self._lock = threading.Lock()

    def list_cameras(self, probe: bool = True) -> List[CameraInfo]:
        now = time.time()
        with self._lock:
            cached = self._cache.get(probe)
            if cached and now - cached[0] < self.cache_seconds:
                return list(cached[1])

        if not probe:
            result = [CameraInfo(index=i, name=f"Camera {i}", available=False) for i in range(self.max_index)]
        else:
            result = [self._probe(index) for index in range(self.max_index)]

        with self._lock:
            self._cache[probe] = (now, result)
        return result

    def probe_index(self, index: int) -> CameraInfo:
        return self._probe(index)

    def _probe(self, index: int) -> CameraInfo:
        capture = _open_capture(index)
        try:
            if not capture.isOpened():
                return CameraInfo(index=index, name=f"Camera {index}", available=False)
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
            available = True
            ok, frame = capture.read()
            if not ok or frame is None:
                available = False
            else:
                width = width or int(frame.shape[1])
                height = height or int(frame.shape[0])
            backend = "CAP_DSHOW" if os.name == "nt" else "default"
            return CameraInfo(
                index=index,
                name=f"Camera {index}",
                available=available,
                width=width or None,
                height=height or None,
                fps=round(fps, 2) if fps else None,
                backend=backend,
            )
        except Exception as exc:  # pragma: no cover - hardware dependent
            logger.warning("Camera probe %s failed: %s", index, exc)
            return CameraInfo(index=index, name=f"Camera {index}", available=False)
        finally:
            capture.release()


def _line_dict(settings) -> Optional[Dict]:
    if not settings.line_crossing_enabled:
        return None
    return {
        "enabled": True,
        "orientation": settings.line_orientation,
        "position": settings.line_position,
    }
