"""Analytics tests, including the empty-database case."""

from __future__ import annotations

from app.database.db import Database, utc_now_iso
from app.schemas.settings_models import UserSettings
from app.services.analytics_service import AnalyticsService
from app.services.session_service import SessionService


def test_empty_database_is_graceful(tmp_path):
    db = Database(tmp_path / "empty.db")
    analytics = AnalyticsService(db)
    summary = analytics.summary()
    assert summary.has_data is False
    assert summary.total_sessions == 0
    assert summary.total_events == 0
    assert analytics.class_statistics() == []
    assert analytics.events_over_time() == []
    assert analytics.session_comparison() == []
    db.close()


def test_analytics_with_seeded_data(tmp_path):
    db = Database(tmp_path / "data.db")
    sessions = SessionService(db)
    row = sessions.create(
        name="s1", source_type="video", config=UserSettings(), total_frames=10
    )
    sessions.update(
        row["id"], status="completed", processed_frames=10, unique_tracks=2,
        event_count=3, avg_fps=8.0, avg_inference_ms=120.0,
    )

    now = utc_now_iso()
    db.executemany(
        """
        INSERT INTO events(session_id, created_at, frame_index, class_id, class_name,
                           confidence, track_id, source_type, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (row["id"], now, 0, 0, "person", 0.9, 1, "video", "detection"),
            (row["id"], now, 1, 0, "person", 0.8, 2, "video", "detection"),
            (row["id"], now, 2, 2, "car", 0.7, 3, "video", "detection"),
        ],
    )

    analytics = AnalyticsService(db)
    summary = analytics.summary()
    assert summary.has_data is True
    assert summary.total_sessions == 1
    assert summary.total_detections == 3
    assert summary.unique_classes == 2

    classes = analytics.class_statistics()
    assert classes[0].class_name == "person"
    assert classes[0].event_count == 2
    assert classes[0].unique_tracks == 2

    over_time = analytics.events_over_time(bucket="day")
    assert sum(point.events for point in over_time) == 3

    comparison = analytics.session_comparison()
    assert comparison[0].session_id == row["id"]
    db.close()


def test_cleanup_disabled_returns_zero(tmp_path):
    db = Database(tmp_path / "cleanup.db")
    analytics = AnalyticsService(db)
    assert analytics.cleanup(0)["deleted_sessions"] == 0
    db.close()
