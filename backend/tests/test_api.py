"""API integration tests (no real model or camera required)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.api


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["app"] == "VisionTrack AI"


def test_system_info(client):
    response = client.get("/api/system/info")
    assert response.status_code == 200
    body = response.json()
    assert body["app"] == "VisionTrack AI"
    assert "torch_version" in body
    assert body["cuda_available"] in (True, False)
    # CUDA must not be claimed when absent.
    if not body["cuda_available"]:
        assert body["device"] == "cpu"
    assert "db_bytes" in body["details"]


def test_models_listing(client):
    response = client.get("/api/models")
    assert response.status_code == 200
    models = response.json()
    names = {m["name"] for m in models}
    assert "yolo11n.pt" in names
    assert any(m["is_default"] for m in models)


def test_settings_get_update_reset(client):
    initial = client.get("/api/settings").json()
    assert initial["model"] == "yolo11n.pt"

    updated = client.put(
        "/api/settings",
        json={"confidence": 0.55, "tracking_enabled": False, "imgsz": 480},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["confidence"] == 0.55
    assert body["tracking_enabled"] is False
    assert body["imgsz"] == 480

    assert client.get("/api/settings").json()["confidence"] == 0.55

    reset = client.post("/api/settings/reset")
    assert reset.status_code == 200
    assert reset.json()["confidence"] == 0.25


def test_settings_small_imgsz_and_capture_resolution(client):
    response = client.put(
        "/api/settings",
        json={"imgsz": 192, "camera_width": 640, "camera_height": 480},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["imgsz"] == 192
    assert body["camera_width"] == 640
    assert body["camera_height"] == 480
    # Persisted.
    persisted = client.get("/api/settings").json()
    assert persisted["imgsz"] == 192
    assert persisted["camera_width"] == 640
    client.post("/api/settings/reset")


@pytest.mark.parametrize(
    "payload",
    [
        {"confidence": 5},
        {"imgsz": 7},
        {"model": "evil.pt"},
        {"tracker": "evil.yaml"},
        {"device": "tpu"},
        {"camera_width": 640},
        {"camera_width": 640, "camera_height": 481},
        {"unknown_field": 1},
    ],
)
def test_invalid_settings_rejected(client, payload):
    response = client.put("/api/settings", json=payload)
    assert response.status_code == 422


def test_cameras_without_probe(client):
    response = client.get("/api/cameras", params={"probe": "false"})
    assert response.status_code == 200
    cameras = response.json()
    assert len(cameras) >= 1
    assert all(c["available"] is False for c in cameras)


def test_events_empty(client):
    response = client.get("/api/events")
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_analytics_empty(client):
    summary = client.get("/api/analytics/summary")
    assert summary.status_code == 200
    assert summary.json()["has_data"] is False
    assert client.get("/api/analytics/classes").json() == []
    assert client.get("/api/analytics/timeseries").json() == []


def test_csv_export_empty(client):
    response = client.get("/api/events/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "class_name" in response.text.splitlines()[0]


def test_unknown_session_404(client):
    assert client.get("/api/sessions/does-not-exist").status_code == 404
    assert client.get("/api/sessions/does-not-exist/live").status_code == 404
    assert client.post("/api/sessions/does-not-exist/stop").status_code == 404
    assert client.get("/api/videos/does-not-exist/status").status_code == 404
    assert client.get("/api/videos/does-not-exist/download").status_code == 404
    assert client.get("/api/stream/does-not-exist").status_code == 404


def test_invalid_upload_extension(client):
    response = client.post(
        "/api/videos/upload",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 400
    assert "Unsupported" in response.json()["detail"]


def test_upload_unreadable_video(client):
    response = client.post(
        "/api/videos/upload",
        files={"file": ("broken.mp4", b"this is not a video", "video/mp4")},
    )
    assert response.status_code == 400


def test_upload_empty_file(client):
    response = client.post(
        "/api/videos/upload",
        files={"file": ("empty.mp4", b"", "video/mp4")},
    )
    assert response.status_code == 400


def test_session_create_video_without_id(client):
    response = client.post("/api/sessions", json={"source_type": "video"})
    assert response.status_code == 400


def test_live_metrics_without_runtime_returns_409(client, container):
    row = container.session_service.create(
        name="idle", source_type="video", config=container.settings_service.get()
    )
    response = client.get(f"/api/sessions/{row['id']}/live")
    assert response.status_code == 409


def test_delete_missing_session_404(client):
    assert client.delete("/api/sessions/nope").status_code == 404
