"""Webcam-loop behaviour tests that never touch a real camera.

``cv2.VideoCapture`` is monkeypatched with a fake source so we exercise the real
``_open_capture`` / ``CameraWorker.run`` code paths (resolution requests and
``frame_interval`` skipping) without loading torch or opening a device.
"""

from __future__ import annotations

import cv2
import numpy as np

from app.schemas.settings_models import UserSettings
from app.services import camera_manager as cm
from app.services.camera_manager import CameraWorker
from app.services.runtime import RuntimeState


class _DummyDB:
    def execute(self, *args, **kwargs):  # pragma: no cover - not hit in these tests
        return None


class _DummyEvents:
    def __init__(self) -> None:
        self.records = 0

    def record(self, *args, **kwargs) -> int:
        self.records += 1
        return 0


class _CountingDetector:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, frame, settings, tracking):
        self.calls += 1
        return [], 3.0, {}


class _FakeCapture:
    """Returns ``frame_count`` frames, then triggers cancellation on empty."""

    def __init__(self, frame_count: int, on_empty) -> None:
        self._remaining = frame_count
        self._on_empty = on_empty
        self.sets: dict = {}
        self.released = False
        self._frame = np.zeros((48, 64, 3), dtype=np.uint8)

    def isOpened(self) -> bool:
        return True

    def set(self, prop, value) -> bool:
        self.sets[prop] = value
        return True

    def read(self):
        if self._remaining > 0:
            self._remaining -= 1
            return True, self._frame.copy()
        self._on_empty()
        return False, None

    def release(self) -> None:
        self.released = True


def _run_worker(monkeypatch, settings: UserSettings, frames: int):
    runtime = RuntimeState("session-webcam", settings)
    holder: dict = {"runtime": runtime}

    def fake_video_capture(*args, **kwargs):
        capture = _FakeCapture(frames, lambda: runtime.request_cancel())
        holder["capture"] = capture
        holder["capture_args"] = args
        return capture

    # Patch the OpenCV constructor so the real _open_capture() runs (and thus the
    # resolution / buffer-size calls are exercised).
    monkeypatch.setattr(cm.cv2, "VideoCapture", fake_video_capture)

    detector = _CountingDetector()
    worker = CameraWorker(runtime, 0, detector, _DummyEvents(), _DummyDB())
    summary = worker.run()
    return runtime, summary, detector, holder


def test_webcam_frame_interval_skips_inference(monkeypatch):
    settings = UserSettings(frame_interval=3)
    _runtime, summary, detector, holder = _run_worker(monkeypatch, settings, frames=10)

    # Frames 1, 4, 7 and 10 run inference; the other six are read and dropped.
    assert detector.calls == 4
    assert summary["processed_frames"] == 4
    assert summary["cancelled"] is True
    assert holder["capture"].released is True


def test_webcam_frame_interval_one_infers_every_frame(monkeypatch):
    settings = UserSettings(frame_interval=1)
    _runtime, summary, detector, _holder = _run_worker(monkeypatch, settings, frames=5)
    assert detector.calls == 5
    assert summary["processed_frames"] == 5


def test_webcam_capture_resolution_requested(monkeypatch):
    settings = UserSettings(camera_width=640, camera_height=480)
    _runtime, _summary, _detector, holder = _run_worker(monkeypatch, settings, frames=3)

    assert holder["capture"].sets.get(cv2.CAP_PROP_FRAME_WIDTH) == 640.0
    assert holder["capture"].sets.get(cv2.CAP_PROP_FRAME_HEIGHT) == 480.0
    assert holder["capture"].sets.get(cv2.CAP_PROP_BUFFERSIZE) == 1


def test_webcam_native_resolution_not_set(monkeypatch):
    settings = UserSettings()  # camera_width/height default 0 = native
    _runtime, _summary, _detector, holder = _run_worker(monkeypatch, settings, frames=2)

    assert cv2.CAP_PROP_FRAME_WIDTH not in holder["capture"].sets
    assert cv2.CAP_PROP_FRAME_HEIGHT not in holder["capture"].sets
