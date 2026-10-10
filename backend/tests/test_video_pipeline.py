"""End-to-end computer-vision tests with the real YOLO model.

Marked ``slow`` because they load torch weights and run CPU inference.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from conftest import wait_for_status

pytestmark = pytest.mark.slow


def _upload(client, video_path: Path, **form):
    with open(video_path, "rb") as handle:
        files = {"file": (video_path.name, handle, "video/mp4")}
        data = {key: str(value) for key, value in form.items()}
        return client.post("/api/videos/upload", files=files, data=data)


def test_full_video_pipeline(client, sample_video, model_available):
    if not model_available:
        pytest.skip("YOLO weights are not available.")

    response = _upload(client, sample_video, imgsz=320, confidence=0.2)
    assert response.status_code == 201, response.text
    video_id = response.json()["video_id"]
    assert response.json()["metadata"]["frame_count"] > 0

    final = wait_for_status(client, video_id, {"completed", "cancelled", "failed"}, timeout=300)
    assert final["status"] == "completed", final
    assert final["processed_frames"] > 0
    assert final["unique_tracks"] >= 1
    assert final["output_available"] is True

    # Events persisted in SQLite.
    events = client.get("/api/events", params={"session_id": video_id}).json()
    assert events["total"] > 0
    assert all(e["event_type"] in ("detection", "line_cross") for e in events["items"])
    assert events["items"][0]["class_name"]

    # Download the annotated output.
    download = client.get(f"/api/videos/{video_id}/download")
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("video/mp4")
    assert len(download.content) > 0

    # The annotated video must be reopenable with valid dimensions.
    container = client.app.state.container
    output_path = container.settings.outputs_dir / f"{video_id}.mp4"
    assert output_path.exists()
    capture = cv2.VideoCapture(str(output_path))
    try:
        assert capture.isOpened()
        ok, frame = capture.read()
        assert ok and frame is not None
        assert frame.shape[0] > 0 and frame.shape[1] > 0
    finally:
        capture.release()

    # Analytics derived from the stored data.
    summary = client.get("/api/analytics/summary").json()
    assert summary["has_data"] is True
    assert summary["total_detections"] > 0
    assert len(client.get("/api/analytics/classes").json()) >= 1


def test_blank_video_yields_no_objects(client, tmp_path, model_available):
    if not model_available:
        pytest.skip("YOLO weights are not available.")

    blank_path = tmp_path / "blank.mp4"
    writer = cv2.VideoWriter(
        str(blank_path), cv2.VideoWriter_fourcc(*"mp4v"), 8.0, (320, 240)
    )
    assert writer.isOpened()
    for _ in range(6):
        writer.write(np.full((240, 320, 3), 127, dtype=np.uint8))
    writer.release()

    response = _upload(client, blank_path, imgsz=320, confidence=0.25)
    assert response.status_code == 201, response.text
    video_id = response.json()["video_id"]
    final = wait_for_status(client, video_id, {"completed", "failed"}, timeout=300)
    assert final["status"] == "completed"
    assert final["processed_frames"] > 0
    events = client.get("/api/events", params={"session_id": video_id}).json()
    assert events["total"] == 0


def test_consecutive_tracking_sessions_reset_track_ids(sample_image, model_available):
    """Regression: two tracking sessions in one process must not crash.

    Ultralytics reuses a single predictor (and tracker) per model across
    ``model.track`` calls. Emptying ``predictor.trackers`` between sessions used
    to make the *second* session raise ``IndexError: list index out of range``
    on its first frame. Resetting must also restart the track-ID counter.
    """
    if not model_available:
        pytest.skip("YOLO weights are not available.")

    from app.core.detector import Detector, ModelRegistry
    from app.schemas.settings_models import UserSettings

    project_root = Path(__file__).resolve().parents[2]
    image = cv2.imread(str(sample_image))
    assert image is not None

    registry = ModelRegistry(project_root / "models")
    detector = Detector(registry)
    settings = UserSettings(
        model="yolo11n.pt",
        device="cpu",
        imgsz=320,
        confidence=0.2,
        tracking_enabled=True,
    )

    def run_session(frames: int = 3):
        registry.reset_tracker(settings.model, settings.device, settings.tracker)
        first_ids = None
        total = 0
        for _ in range(frames):
            detections, _ms, _names = detector.run(image, settings, tracking=True)
            ids = [det.track_id for det in detections]
            assert ids, "expected at least one tracked object"
            assert all(track_id is not None for track_id in ids), ids
            if first_ids is None:
                first_ids = ids
            total += len(detections)
        return first_ids, total

    first_a, total_a = run_session()
    # Second session in the same process — this is what used to raise IndexError.
    first_b, total_b = run_session()

    assert total_a > 0 and total_b > 0
    # Reset restarts the ID counter, so each session begins at track ID 1.
    assert min(first_a) == 1
    assert min(first_b) == 1


def test_tracker_type_change_is_rebuilt(sample_image, model_available):
    """Changing the tracker setting must apply on the next session."""
    if not model_available:
        pytest.skip("YOLO weights are not available.")

    from app.core.detector import Detector, ModelRegistry
    from app.schemas.settings_models import UserSettings

    project_root = Path(__file__).resolve().parents[2]
    image = cv2.imread(str(sample_image))
    assert image is not None

    registry = ModelRegistry(project_root / "models")
    detector = Detector(registry)

    bytetrack = UserSettings(
        model="yolo11n.pt", device="cpu", imgsz=320, confidence=0.2, tracker="bytetrack.yaml"
    )
    botsort = UserSettings(
        model="yolo11n.pt", device="cpu", imgsz=320, confidence=0.2, tracker="botsort.yaml"
    )

    registry.reset_tracker(bytetrack.model, bytetrack.device, bytetrack.tracker)
    detections, _ms, _names = detector.run(image, bytetrack, tracking=True)
    assert detections
    model, _names, _device = registry.get(bytetrack.model, bytetrack.device)
    assert "byte" in type(model.predictor.trackers[0]).__name__.lower()

    registry.reset_tracker(botsort.model, botsort.device, botsort.tracker)
    detections, _ms, _names = detector.run(image, botsort, tracking=True)
    assert detections
    assert "bot" in type(model.predictor.trackers[0]).__name__.lower()

