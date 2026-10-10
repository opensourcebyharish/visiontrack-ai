"""Processing lifecycle tests using a deterministic fake detector.

These never load torch or touch a webcam, so they run everywhere.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

import pytest

from app.database.db import Database
from app.schemas.settings_models import UserSettings
from app.services.event_service import EventService
from app.services.session_service import SessionService
from app.workers.processing_manager import DeviceBusyError, ProcessingManager


def _build_manager(tmp_path, detector, registry):
    db = Database(tmp_path / "worker.db")
    session_service = SessionService(db)
    event_service = EventService(db)
    manager = ProcessingManager(
        session_service=session_service,
        event_service=event_service,
        detector=detector,
        model_registry=registry,
        db=db,
        max_workers=1,
    )
    return manager, session_service, db


def _wait(session_service, session_id, terminal=("completed", "cancelled", "failed", "stopped"), timeout=60):
    deadline = time.time() + timeout
    row = None
    while time.time() < deadline:
        row = session_service.get(session_id)
        if row and row["status"] in terminal:
            return row
        time.sleep(0.2)
    return row


def test_video_job_completes(tmp_path, sample_video, fake_detector, stub_registry):
    manager, sessions, db = _build_manager(tmp_path, fake_detector, stub_registry)
    row = sessions.create(
        name="fake-video",
        source_type="video",
        config=UserSettings(),
        input_path=str(sample_video),
        status="created",
        total_frames=20,
    )
    output = tmp_path / "out.mp4"
    manager.queue_video(row["id"], str(sample_video), str(output), UserSettings())

    # State must pass through queued/running before completing.
    seen = set()
    deadline = time.time() + 60
    while time.time() < deadline:
        current = sessions.get(row["id"])["status"]
        seen.add(current)
        if current in ("completed", "failed", "cancelled"):
            break
        time.sleep(0.1)

    final = _wait(sessions, row["id"])
    assert final["status"] == "completed", final
    assert final["processed_frames"] > 0
    assert final["event_count"] > 0
    assert final["unique_tracks"] >= 1
    assert output.exists() and output.stat().st_size > 0
    assert "running" in seen
    # The runtime must be released once the job finishes (no in-memory leak).
    assert manager.get_runtime(row["id"]) is None
    manager.shutdown()
    db.close()


def test_video_job_missing_file_fails(tmp_path, fake_detector, stub_registry):
    manager, sessions, db = _build_manager(tmp_path, fake_detector, stub_registry)
    missing = tmp_path / "missing.mp4"
    row = sessions.create(
        name="missing", source_type="video", config=UserSettings(),
        input_path=str(missing), status="created",
    )
    manager.queue_video(row["id"], str(missing), str(tmp_path / "o.mp4"), UserSettings())
    final = _wait(sessions, row["id"])
    assert final["status"] == "failed"
    assert final["error"]
    manager.shutdown()
    db.close()


def test_device_busy_guard(tmp_path, sample_video, fake_detector, stub_registry):
    manager, sessions, db = _build_manager(tmp_path, fake_detector, stub_registry)
    started = threading.Event()
    release = threading.Event()

    def slow_process(runtime, input_path, output_path):  # noqa: ARG001
        started.set()
        release.wait(15)
        return {"processed_frames": 0, "cancelled": runtime.is_cancelled}

    manager.video_processor.process = slow_process  # type: ignore[assignment]
    row = sessions.create(
        name="blocking", source_type="video", config=UserSettings(),
        input_path=str(sample_video), status="created",
    )
    manager.queue_video(row["id"], str(sample_video), str(tmp_path / "o.mp4"), UserSettings())
    assert started.wait(10)
    assert manager.is_busy() is True
    with pytest.raises(DeviceBusyError):
        manager.start_webcam("other", 0, UserSettings())

    release.set()
    _wait(sessions, row["id"])
    manager.shutdown()
    db.close()


def test_video_cancellation(tmp_path, sample_video, fake_detector, stub_registry):
    manager, sessions, db = _build_manager(tmp_path, fake_detector, stub_registry)

    def cancelable_process(runtime, input_path, output_path):  # noqa: ARG001
        while not runtime.is_cancelled:
            time.sleep(0.05)
        return {"processed_frames": 0, "cancelled": True}

    manager.video_processor.process = cancelable_process  # type: ignore[assignment]
    row = sessions.create(
        name="cancel-me", source_type="video", config=UserSettings(),
        input_path=str(sample_video), status="created",
    )
    manager.queue_video(row["id"], str(sample_video), str(tmp_path / "o.mp4"), UserSettings())
    manager.stop(row["id"], reason="test")
    final = _wait(sessions, row["id"])
    assert final["status"] == "cancelled"
    assert manager.get_runtime(row["id"]) is None
    manager.shutdown()
    db.close()


def test_webcam_unavailable_fails_gracefully(tmp_path, monkeypatch, fake_detector, stub_registry):
    class DeadCapture:
        def isOpened(self):
            return False

        def release(self):
            return None

        def set(self, *args):
            return True

    monkeypatch.setattr(
        "app.services.camera_manager._open_capture",
        lambda index, width=0, height=0: DeadCapture(),
    )
    manager, sessions, db = _build_manager(tmp_path, fake_detector, stub_registry)
    row = sessions.create(name="cam", source_type="webcam", config=UserSettings())
    manager.start_webcam(row["id"], 0, UserSettings())
    final = _wait(sessions, row["id"])
    assert final["status"] == "failed"
    assert "camera" in (final["error"] or "").lower()
    manager.shutdown()
    db.close()
