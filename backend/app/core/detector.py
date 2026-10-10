"""Detection data structures, model registry and the inference engine.

Weights are loaded once per ``(model, device)`` pair and shared across
processing sessions.  A process-wide inference lock bounds concurrency to a
single inference at a time so a CPU-only machine is never oversubscribed by
overlapping webcam and video jobs.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.core.device import resolve_device
from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class Detection:
    """A single detected object in a frame."""

    class_id: int
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float
    track_id: Optional[int] = None

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    @property
    def area(self) -> float:
        return max(0.0, self.x2 - self.x1) * max(0.0, self.y2 - self.y1)

    def bbox(self) -> Tuple[int, int, int, int]:
        return (int(round(self.x1)), int(round(self.y1)), int(round(self.x2)), int(round(self.y2)))

    def as_dict(self) -> Dict[str, Any]:
        return {
            "class_id": self.class_id,
            "class_name": self.class_name,
            "confidence": round(float(self.confidence), 4),
            "track_id": self.track_id,
            "x1": round(float(self.x1), 2),
            "y1": round(float(self.y1), 2),
            "x2": round(float(self.x2), 2),
            "y2": round(float(self.y2), 2),
        }


# Process-wide inference lock: never run two inferences concurrently.
INFERENCE_LOCK = threading.Lock()


class ModelRegistry:
    """Caches loaded Ultralytics YOLO models keyed by ``(name, device)``."""

    def __init__(self, models_dir: Path) -> None:
        self.models_dir = Path(models_dir)
        self._models: Dict[Tuple[str, str], Any] = {}
        self._names: Dict[Tuple[str, str], Dict[int, str]] = {}
        self._lock = threading.Lock()

    def _resolve_path(self, model_name: str) -> str:
        """Resolve an approved model name to a local path.

        Only names from the approved list are accepted; the local ``models``
        directory is preferred, otherwise Ultralytics may resolve a bundled or
        downloadable weight by its plain filename.
        """
        candidate = self.models_dir / model_name
        if candidate.exists():
            return str(candidate)
        return model_name

    def get(self, model_name: str, device_preference: str = "auto"):
        device = resolve_device(device_preference)
        key = (model_name, device)
        with self._lock:
            if key not in self._models:
                # Imported lazily so tests that don't need torch stay light.
                from ultralytics import YOLO

                path = self._resolve_path(model_name)
                logger.info("Loading YOLO model '%s' on %s", model_name, device)
                model = YOLO(path)
                self._models[key] = model
                self._names[key] = dict(model.names)
            return self._models[key], self._names[key], device

    def is_loaded(self, model_name: str) -> bool:
        with self._lock:
            return any(name == model_name for (name, _dev) in self._models)

    def any_loaded(self) -> bool:
        with self._lock:
            return bool(self._models)

    def loaded(self) -> List[str]:
        with self._lock:
            return sorted({name for (name, _dev) in self._models})

    def reset_tracker(
        self,
        model_name: str,
        device_preference: str = "auto",
        tracker: Optional[str] = None,
    ) -> None:
        """Reset tracker state so sessions don't share tracks or track IDs.

        Three cases are handled:

        1. No tracker has been built yet -> nothing to do; the first
           ``model.track`` call builds one.
        2. A tracker of the same type exists -> call ``reset()`` on it. This
           clears tracks and the per-session ID counter **without** emptying
           ``predictor.trackers``.

           We must never leave an empty ``predictor.trackers`` list: Ultralytics'
           ``Model.track`` only registers its callbacks when the ``trackers``
           attribute is *absent*, and ``on_predict_start`` early-returns when
           ``persist=True`` and the attribute merely exists. An empty list
           therefore crashes the next session with ``IndexError`` on the first
           frame.
        3. A tracker of a *different* type is requested (the user changed the
           ``tracker`` setting) -> drop the instances and remove the previously
           registered tracker callbacks so the next ``model.track`` rebuilds a
           fresh tracker of the requested type without duplicating callbacks.
        """
        try:
            model, _names, _device = self.get(model_name, device_preference)
        except Exception:  # pragma: no cover - defensive
            return
        predictor = getattr(model, "predictor", None)
        trackers = getattr(predictor, "trackers", None)
        if not trackers:
            return

        if tracker is not None and not self._tracker_type_matches(trackers[0], tracker):
            self._rebuild_trackers(model, predictor)
            return

        for tracker_instance in trackers:
            reset = getattr(tracker_instance, "reset", None)
            if callable(reset):
                reset()

    @staticmethod
    def _tracker_type_matches(instance: Any, tracker_name: str) -> bool:
        wanted = "botsort" if "botsort" in tracker_name.lower() else "bytetrack"
        return wanted in type(instance).__name__.lower()

    @staticmethod
    def _rebuild_trackers(model: Any, predictor: Any) -> None:
        """Force a clean tracker rebuild and de-duplicate tracker callbacks."""
        try:
            del predictor.trackers
        except AttributeError:  # pragma: no cover - defensive
            pass
        try:
            from functools import partial

            from ultralytics.trackers.track import (
                on_predict_postprocess_end as tracker_post,
            )
            from ultralytics.trackers.track import on_predict_start as tracker_start
        except Exception:  # pragma: no cover - defensive
            return

        for event, func in (
            ("on_predict_start", tracker_start),
            ("on_predict_postprocess_end", tracker_post),
        ):
            registered = model.callbacks.get(event)
            if not registered:
                continue
            model.callbacks[event] = [
                callback
                for callback in registered
                if not (isinstance(callback, partial) and callback.func is func)
            ]


class Detector:
    """Runs YOLO detection/tracking over a single frame."""

    def __init__(self, registry: ModelRegistry) -> None:
        self.registry = registry

    def run(
        self,
        frame,
        settings,
        tracking: bool,
    ) -> Tuple[List[Detection], float, Dict[int, str]]:
        """Run inference on ``frame``.

        Returns ``(detections, inference_ms, class_names)``.  The class-name map
        is returned so callers can build class filters without an extra lookup.
        """
        import time

        model, class_names, device = self.registry.get(settings.model, settings.device)
        classes = settings.classes if settings.classes else None

        common: Dict[str, Any] = dict(
            conf=float(settings.confidence),
            iou=float(settings.iou),
            imgsz=int(settings.imgsz),
            device=device,
            verbose=False,
            classes=classes,
        )

        with INFERENCE_LOCK:
            start = time.perf_counter()
            if tracking:
                results = model.track(
                    frame,
                    persist=True,
                    tracker=settings.tracker,
                    **common,
                )
            else:
                results = model.predict(frame, **common)
            inference_ms = (time.perf_counter() - start) * 1000.0

        detections = self._parse(results[0] if results else None)
        return detections, inference_ms, class_names

    @staticmethod
    def _parse(result) -> List[Detection]:
        if result is None or getattr(result, "boxes", None) is None:
            return []
        boxes = result.boxes
        names = getattr(result, "names", {}) or {}
        detections: List[Detection] = []

        cls_list = boxes.cls.tolist() if boxes.cls is not None else []
        conf_list = boxes.conf.tolist() if boxes.conf is not None else []
        xyxy_list = boxes.xyxy.tolist() if boxes.xyxy is not None else []
        ids = boxes.id.tolist() if getattr(boxes, "id", None) is not None else [None] * len(cls_list)

        for idx in range(len(cls_list)):
            class_id = int(cls_list[idx])
            conf = float(conf_list[idx]) if idx < len(conf_list) else 0.0
            box = xyxy_list[idx] if idx < len(xyxy_list) else [0, 0, 0, 0]
            track_id = ids[idx] if idx < len(ids) else None
            track_id = int(track_id) if track_id is not None else None
            detections.append(
                Detection(
                    class_id=class_id,
                    class_name=names.get(class_id, str(class_id)),
                    confidence=conf,
                    x1=float(box[0]),
                    y1=float(box[1]),
                    x2=float(box[2]),
                    y2=float(box[3]),
                    track_id=track_id,
                )
            )
        return detections


def filter_detections(
    detections: Sequence[Detection],
    *,
    min_confidence: float = 0.0,
    classes: Optional[Sequence[int]] = None,
) -> List[Detection]:
    """Pure helper used by the API and tests."""
    allowed = set(classes) if classes else None
    result = []
    for det in detections:
        if det.confidence < min_confidence:
            continue
        if allowed is not None and det.class_id not in allowed:
            continue
        result.append(det)
    return result
