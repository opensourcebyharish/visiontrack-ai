"""Background processing manager.

Owns the runtime registry, a bounded worker pool (a single inference slot by
default) and the lifecycle of webcam and video sessions.  Heavy work never runs
inside an HTTP handler.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List, Optional

from app.core.detector import Detector, ModelRegistry
from app.database.db import Database, utc_now_iso
from app.logging_config import get_logger
from app.schemas.settings_models import UserSettings
from app.services.camera_manager import CameraError, CameraWorker
from app.services.event_service import EventService
from app.services.runtime import RuntimeState
from app.services.session_service import SessionService
from app.services.video_processor import VideoProcessingError, VideoProcessor

logger = get_logger(__name__)


class DeviceBusyError(RuntimeError):
    """Raised when a requested job would conflict with an active one."""


class SessionNotFoundError(RuntimeError):
    pass


class ProcessingManager:
    def __init__(
        self,
        *,
        session_service: SessionService,
        event_service: EventService,
        detector: Detector,
        model_registry: ModelRegistry,
        db: Database,
        max_workers: int = 1,
    ) -> None:
        self.session_service = session_service
        self.event_service = event_service
        self.detector = detector
        self.model_registry = model_registry
        self.db = db
        self.video_processor = VideoProcessor(detector, event_service, db)
        self._runtimes: Dict[str, RuntimeState] = {}
        self._futures: Dict[str, Future] = {}
        self._live: Dict[str, str] = {}  # session_id -> kind
        self._active_cameras: Dict[int, str] = {}
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="vt-worker")

    # -- registry ---------------------------------------------------------
    def get_runtime(self, session_id: str) -> Optional[RuntimeState]:
        with self._lock:
            return self._runtimes.get(session_id)

    def get_frame(self, session_id: str, last_version: int = -1):
        runtime = self.get_runtime(session_id)
        if runtime is None:
            return None, -1
        return runtime.frames.get(last_version, timeout=1.5)

    def latest_frame(self, session_id: str) -> Optional[bytes]:
        runtime = self.get_runtime(session_id)
        return runtime.frames.latest() if runtime else None

    def active_session_ids(self) -> List[str]:
        with self._lock:
            return list(self._live.keys())

    def is_busy(self) -> bool:
        with self._lock:
            return bool(self._live)

    def camera_in_use(self, camera_index: int) -> bool:
        with self._lock:
            return camera_index in self._active_cameras

    # -- lifecycle --------------------------------------------------------
    def start_webcam(
        self, session_id: str, camera_index: int, settings: UserSettings
    ) -> RuntimeState:
        with self._lock:
            if self.is_busy():
                raise DeviceBusyError(
                    "Another capture or analysis session is already running. "
                    "Stop it before starting a new one."
                )
            if camera_index in self._active_cameras:
                raise DeviceBusyError(f"Camera {camera_index} is already in use.")
            runtime = RuntimeState(session_id, settings)
            self._runtimes[session_id] = runtime
            self._live[session_id] = "webcam"
            self._active_cameras[camera_index] = session_id
            future = self._executor.submit(
                self._run_webcam_job, session_id, camera_index
            )
            self._futures[session_id] = future
            return runtime

    def queue_video(
        self, session_id: str, input_path: str, output_path: str, settings: UserSettings
    ) -> RuntimeState:
        with self._lock:
            runtime = RuntimeState(session_id, settings)
            self._runtimes[session_id] = runtime
            self._live[session_id] = "video"
            self.session_service.update(session_id, status="queued", message="Queued for processing")
            runtime.update_metrics(status="queued", message="Queued for processing")
            future = self._executor.submit(
                self._run_video_job, session_id, input_path, output_path
            )
            self._futures[session_id] = future
            return runtime

    def stop(self, session_id: str, reason: str = "user") -> bool:
        with self._lock:
            runtime = self._runtimes.get(session_id)
        if runtime is None:
            raise SessionNotFoundError("Session is not active.")
        runtime.request_cancel(reason)
        return True

    def delete(self, session_id: str) -> None:
        with self._lock:
            if session_id in self._live:
                raise DeviceBusyError("Cannot delete a running session; stop it first.")
            self._runtimes.pop(session_id, None)
            future = self._futures.pop(session_id, None)
        if future is not None:
            future.cancel()

    def shutdown(self) -> None:
        with self._lock:
            runtimes = list(self._runtimes.values())
        for runtime in runtimes:
            runtime.request_cancel("shutdown")
        self._executor.shutdown(wait=False, cancel_futures=True)

    # -- jobs -------------------------------------------------------------
    def _run_webcam_job(self, session_id: str, camera_index: int) -> None:
        runtime = self.get_runtime(session_id)
        if runtime is None:
            return
        try:
            if runtime.is_cancelled:
                self._finalize(session_id, runtime, None, status="cancelled")
                return
            self._mark_started(session_id, runtime)
            self.model_registry.reset_tracker(
                runtime.settings.model,
                runtime.settings.device,
                runtime.settings.tracker,
            )
            worker = CameraWorker(runtime, camera_index, self.detector, self.event_service, self.db)
            summary = worker.run()
            status = "cancelled" if runtime.is_cancelled else "stopped"
            self._finalize(session_id, runtime, summary, status=status)
        except CameraError as exc:
            self._finalize(session_id, runtime, None, status="failed", error=str(exc))
        except Exception as exc:  # pragma: no cover - unexpected
            logger.exception("Webcam session %s failed", session_id)
            self._finalize(session_id, runtime, None, status="failed", error=str(exc))
        finally:
            self._release(session_id, camera_index)

    def _run_video_job(self, session_id: str, input_path: str, output_path: str) -> None:
        runtime = self.get_runtime(session_id)
        if runtime is None:
            return
        try:
            if runtime.is_cancelled:
                self._finalize(session_id, runtime, None, status="cancelled")
                return
            self._mark_started(session_id, runtime)
            self.model_registry.reset_tracker(
                runtime.settings.model,
                runtime.settings.device,
                runtime.settings.tracker,
            )
            summary = self.video_processor.process(runtime, input_path, output_path)
            status = "cancelled" if summary.get("cancelled") else "completed"
            self._finalize(session_id, runtime, summary, status=status, output_path=output_path)
        except (VideoProcessingError, ValueError) as exc:
            self._finalize(session_id, runtime, None, status="failed", error=str(exc))
        except Exception as exc:  # pragma: no cover - unexpected
            logger.exception("Video session %s failed", session_id)
            self._finalize(session_id, runtime, None, status="failed", error=str(exc))
        finally:
            self._release(session_id, None)

    # -- helpers ----------------------------------------------------------
    def _mark_started(self, session_id: str, runtime: RuntimeState) -> None:
        runtime.update_metrics(status="running", message="Running")
        self.session_service.update(
            session_id, status="running", started_at=utc_now_iso(), error=None
        )

    def _finalize(
        self,
        session_id: str,
        runtime: RuntimeState,
        summary: Optional[Dict],
        *,
        status: str,
        output_path: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        summary = summary or {}
        metrics = runtime.metrics
        update: Dict = {
            "status": status,
            "ended_at": utc_now_iso(),
            "processed_frames": summary.get("processed_frames", metrics.processed_frames),
            "unique_tracks": summary.get("unique_tracks", metrics.unique_tracks),
            "event_count": summary.get("event_count", metrics.event_count),
            "avg_fps": summary.get("avg_fps", metrics.fps),
            "avg_inference_ms": summary.get("avg_inference_ms", metrics.inference_ms),
            "error": error,
            "message": {
                "completed": "Processing completed",
                "cancelled": "Processing cancelled",
                "stopped": "Capture stopped",
                "failed": error or "Processing failed",
            }.get(status, status),
        }
        if summary.get("total_frames"):
            update["total_frames"] = summary["total_frames"]
        if summary.get("class_counts"):
            update["class_counts_json"] = summary["class_counts"]
        if output_path:
            update["output_path"] = output_path

        runtime.update_metrics(
            status=status,
            error=error,
            message=update["message"],
            processed_frames=update["processed_frames"] or 0,
            unique_tracks=update["unique_tracks"] or 0,
            event_count=update["event_count"] or 0,
            fps=update["avg_fps"],
            inference_ms=update["avg_inference_ms"],
        )
        self.session_service.update(session_id, **update)

    def _release(self, session_id: str, camera_index: Optional[int]) -> None:
        with self._lock:
            self._live.pop(session_id, None)
            self._runtimes.pop(session_id, None)
            if camera_index is not None:
                self._active_cameras.pop(camera_index, None)
