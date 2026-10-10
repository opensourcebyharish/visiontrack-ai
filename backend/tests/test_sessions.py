"""Session persistence and serialization tests."""

from __future__ import annotations

from app.database.db import Database
from app.schemas.settings_models import UserSettings
from app.services.session_service import SessionService, serialize_session


def test_session_crud(tmp_path):
    db = Database(tmp_path / "sessions.db")
    service = SessionService(db)

    created = service.create(name="Cam A", source_type="webcam", config=UserSettings())
    assert created["status"] == "created"

    fetched = service.get(created["id"])
    assert fetched["name"] == "Cam A"

    service.update(created["id"], status="running", processed_frames=5, total_frames=10)
    fetched = service.get(created["id"])
    assert fetched["status"] == "running"

    rows, total = service.list()
    assert total == 1
    assert rows[0]["id"] == created["id"]

    rows, total = service.list(status="completed")
    assert total == 0

    service.delete(created["id"])
    assert service.get(created["id"]) is None
    db.close()


def test_serialize_session_progress_and_urls(tmp_path):
    db = Database(tmp_path / "sessions2.db")
    service = SessionService(db)
    row = service.create(
        name="Video", source_type="video", config=UserSettings(), total_frames=100
    )
    service.update(
        row["id"], status="completed", processed_frames=50,
        output_path=str(tmp_path / "out.mp4"), unique_tracks=4,
        class_counts_json={"person": 4},
    )
    row = service.get(row["id"])
    response = serialize_session(row)
    assert response.progress == 0.5
    assert response.output_available is True
    assert response.download_url == f"/api/videos/{row['id']}/download"
    assert response.class_counts == {"person": 4}
    assert response.stream_available is False
    db.close()
