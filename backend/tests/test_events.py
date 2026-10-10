"""Detection-event sampling, persistence and export tests."""

from __future__ import annotations

from app.core.counting import LineCrossing
from app.core.detector import Detection
from app.database.db import Database
from app.schemas.events import EventFilter
from app.schemas.settings_models import UserSettings
from app.services.event_service import EventSampler, EventService
from app.services.session_service import SessionService


def _det(track_id=1, class_id=0, name="person", conf=0.9):
    return Detection(class_id, name, conf, 10, 10, 60, 60, track_id=track_id)


def test_event_sampler_new_track_then_interval():
    sampler = EventSampler(UserSettings(event_sample_interval=30))
    assert sampler.should_log(_det(), 0) is True
    assert sampler.should_log(_det(), 5) is False
    assert sampler.should_log(_det(), 30) is True


def test_event_sampler_confidence_floor():
    sampler = EventSampler(UserSettings(min_event_confidence=0.5))
    assert sampler.should_log(_det(conf=0.2), 0) is False
    assert sampler.should_log(_det(conf=0.8), 0) is True


def test_event_sampler_log_all():
    sampler = EventSampler(UserSettings(log_all_detections=True))
    assert sampler.should_log(_det(), 0) is True
    assert sampler.should_log(_det(), 1) is True


def test_event_sampler_disabled():
    sampler = EventSampler(UserSettings(event_logging_enabled=False))
    assert sampler.should_log(_det(), 0) is False


def _record(db, session_id, sampler):
    service = EventService(db)
    return service


def test_event_record_query_and_export(tmp_path):
    db = Database(tmp_path / "events.db")
    sessions = SessionService(db)
    row = sessions.create(name="t", source_type="video", config=UserSettings())
    service = EventService(db)
    sampler = EventSampler(UserSettings())

    inserted = service.record(
        row["id"], "video", 0, 0.0, [_det(1), _det(2, 2, "car")], sampler
    )
    assert inserted == 2

    # Line-crossing event stored with a distinct event_type.
    service.record(
        row["id"], "video", 1, 0.1, [], sampler,
        [LineCrossing(1, 0, "person", 0.9, "positive")],
    )

    rows, total = service.query(EventFilter(session_id=row["id"]))
    assert total == 3
    assert {r["class_name"] for r in rows} == {"person", "car"}

    person_rows, person_total = service.query(EventFilter(class_name="person"))
    assert person_total == 2

    high_conf, _ = service.query(EventFilter(min_confidence=0.95))
    assert high_conf == []

    line_rows, line_total = service.query(EventFilter(event_type="line_cross"))
    assert line_total == 1

    csv_text = service.export_csv(EventFilter(session_id=row["id"]))
    assert "class_name" in csv_text.splitlines()[0]
    assert "person" in csv_text
    db.close()
