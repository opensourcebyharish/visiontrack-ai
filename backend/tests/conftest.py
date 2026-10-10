"""Shared pytest fixtures.

The data directory is redirected to a temporary location *before* the
application modules are imported, so tests never touch the real database.
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
for path in (str(BACKEND_DIR), str(SCRIPTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

_SESSION_DATA = Path(tempfile.mkdtemp(prefix="visiontrack-test-"))
os.environ["VISIONTRACK_DATA_DIR"] = str(_SESSION_DATA)
os.environ["VISIONTRACK_MODELS_DIR"] = str(PROJECT_ROOT / "models")

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
SAMPLE_IMAGE = ASSETS_DIR / "bus.jpg"
MODEL_PATH = PROJECT_ROOT / "models" / "yolo11n.pt"


@pytest.fixture(scope="session")
def sample_image() -> Path:
    if not SAMPLE_IMAGE.exists():
        pytest.skip("Sample image bus.jpg is not available.")
    return SAMPLE_IMAGE


@pytest.fixture(scope="session")
def model_available() -> bool:
    return MODEL_PATH.exists()


@pytest.fixture()
def client(tmp_path):
    """A TestClient backed by a fresh, isolated database."""
    from fastapi.testclient import TestClient

    from app.database import db as db_module

    db_module.reset_database_for_tests(tmp_path / "visiontrack-test.db")

    from app.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def container(client):
    return client.app.state.container


class StubRegistry:
    """Model registry stand-in that never loads torch."""

    def __init__(self) -> None:
        self.reset_calls = []

    def reset_tracker(self, model_name: str, device: str = "auto", tracker=None) -> None:
        self.reset_calls.append((model_name, device, tracker))

    def any_loaded(self) -> bool:
        return False

    def loaded(self):
        return []


class FakeDetector:
    """Deterministic detector used to test plumbing without the real model."""

    def __init__(self) -> None:
        self.calls = 0

    def run(self, frame, settings, tracking):
        from app.core.detector import Detection

        self.calls += 1
        detections = [
            Detection(
                class_id=0,
                class_name="person",
                confidence=0.91,
                x1=10,
                y1=10,
                x2=100,
                y2=180,
                track_id=(self.calls % 3) + 1,
            )
        ]
        return detections, 7.5, {0: "person"}


@pytest.fixture()
def stub_registry() -> StubRegistry:
    return StubRegistry()


@pytest.fixture()
def fake_detector() -> FakeDetector:
    return FakeDetector()


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory) -> Path:
    from make_sample_video import make_sample_video

    if not SAMPLE_IMAGE.exists():
        pytest.skip("Sample image bus.jpg is not available.")
    out_dir = tmp_path_factory.mktemp("sample-video")
    path = out_dir / "sample.mp4"
    make_sample_video(SAMPLE_IMAGE, path, frames=20, width=320, height=240, fps=8)
    return path


def wait_for_status(client, session_id: str, statuses, timeout: float = 180.0):
    """Poll a session until it reaches one of ``statuses`` or times out."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        response = client.get(f"/api/sessions/{session_id}")
        last = response.json()
        if last["status"] in statuses:
            return last
        time.sleep(0.25)
    return last
