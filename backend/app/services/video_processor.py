"""Offline video processing pipeline (frame-by-frame, incremental)."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import cv2

from app.core.annotations import draw_detections, draw_hud
from app.core.counting import class_distribution
from app.core.detector import Detector
from app.core.metrics import AverageMeter, FpsMeter
from app.core.video import probe_video
from app.database.db import Database, utc_now_iso
from app.logging_config import get_logger
from app.services.event_service import EventSampler, EventService
from app.services.runtime import RuntimeState

logger = get_logger(__name__)

_METRIC_SAMPLE_EVERY = 5


class VideoProcessingError(RuntimeError):
    pass


class VideoProcessor:
    def __init__(self, detector: Detector, event_service: EventService, db: Database) -> None:
        self.detector = detector
        self.event_service = event_service
        self.db = db

    def process(self, runtime: RuntimeState, input_path: str, output_path: str) -> Dict:
        settings = runtime.settings
        source = Path(input_path)

        meta = probe_video(source)
        if not meta:
            raise VideoProcessingError("The uploaded video is unreadable or empty.")

        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise VideoProcessingError("OpenCV could not open the video file.")

        width = int(meta["width"])
        height = int(meta["height"])
        source_fps = float(meta["fps"]) or 25.0
        total_frames = int(meta["frame_count"]) or 0
        interval = max(1, int(settings.frame_interval))
        out_fps = max(1.0, source_fps / interval)

        writer = cv2.VideoWriter(
            output_path,
            cv2.VideoWriter_fourcc(*"mp4v"),
            out_fps,
            (width, height),
        )
        if not writer.isOpened():
            capture.release()
            raise VideoProcessingError(
                "Could not create the annotated output video (codec unavailable)."
            )

        sampler = EventSampler(settings)
        fps_meter = FpsMeter()
        inference_meter = AverageMeter()
        processed = 0
        read_index = 0
        recorded_events = 0
        jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(settings.jpeg_quality)]

        runtime.update_metrics(
            status="running",
            total_frames=total_frames,
            message="Processing video",
        )

        try:
            while True:
                if runtime.is_cancelled:
                    break
                ok, frame = capture.read()
                if not ok or frame is None:
                    break
                current_index = read_index
                read_index += 1
                if current_index % interval != 0:
                    continue

                detections, inference_ms, _names = self.detector.run(
                    frame, settings, tracking=settings.tracking_enabled
                )
                inference_meter.update(inference_ms)

                runtime.unique_counter.update(detections)
                line_crossings = []
                if runtime.line_counter is not None:
                    line_crossings = runtime.line_counter.update(detections, width, height)

                video_time = current_index / source_fps if source_fps else 0.0
                recorded_events += self.event_service.record(
                    runtime.session_id,
                    "video",
                    current_index,
                    round(video_time, 3),
                    detections,
                    sampler,
                    line_crossings,
                )

                annotated = draw_detections(frame, detections, line=_line_dict(settings))
                fps_value = fps_meter.tick()
                draw_hud(annotated, fps_value, len(detections), inference_ms)
                writer.write(annotated)
                processed += 1

                runtime.update_metrics(
                    fps=fps_value,
                    inference_ms=inference_ms,
                    object_count=len(detections),
                    frame_index=current_index,
                    processed_frames=processed,
                    unique_tracks=runtime.unique_counter.total,
                    event_count=recorded_events,
                    class_counts=class_distribution(detections),
                    line_counts=runtime.line_counter.per_class() if runtime.line_counter else {},
                    detections=[d.as_dict() for d in detections],
                )

                if processed % _METRIC_SAMPLE_EVERY == 0:
                    self._record_metric(runtime.session_id, current_index, fps_value, inference_ms, len(detections))

                ok, buffer = cv2.imencode(".jpg", annotated, jpeg_params)
                if ok:
                    runtime.frames.put(buffer.tobytes())
        finally:
            capture.release()
            writer.release()

        avg_fps = fps_meter.value
        return {
            "processed_frames": processed,
            "total_frames": total_frames if total_frames else read_index,
            "unique_tracks": runtime.unique_counter.total,
            "class_counts": runtime.unique_counter.per_class(),
            "event_count": recorded_events,
            "line_counts": runtime.line_counter.per_class() if runtime.line_counter else {},
            "avg_inference_ms": inference_meter.value,
            "avg_fps": avg_fps,
            "cancelled": runtime.is_cancelled,
        }

    def _record_metric(
        self, session_id: str, frame_index: int, fps: Optional[float],
        inference_ms: Optional[float], objects: int,
    ) -> None:
        self.db.execute(
            """
            INSERT INTO metrics(session_id, frame_index, created_at, fps, inference_ms, object_count)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, frame_index, utc_now_iso(), fps, inference_ms, objects),
        )


def _line_dict(settings) -> Optional[Dict]:
    if not settings.line_crossing_enabled:
        return None
    return {
        "enabled": True,
        "orientation": settings.line_orientation,
        "position": settings.line_position,
    }
