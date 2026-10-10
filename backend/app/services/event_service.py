"""Detection event persistence with sampling / de-duplication.

By default the service does **not** write a row for every detection in every
frame.  A new track is logged on first sight and then re-logged at most once
per ``event_sample_interval`` frames.  Detections without a track ID are
sampled on a frame cadence.  ``log_all_detections`` disables sampling.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from app.core.counting import LineCrossing
from app.core.detector import Detection
from app.database.db import Database, utc_now_iso
from app.schemas.events import EventFilter
from app.schemas.settings_models import UserSettings


class EventSampler:
    """Per-session sampling state (not persisted)."""

    def __init__(self, settings: UserSettings) -> None:
        self.settings = settings
        self.seen_tracks: set = set()
        self.last_logged: Dict[int, int] = {}
        self.seen_signatures: set = set()

    def should_log(self, detection: Detection, frame_index: int) -> bool:
        if not self.settings.event_logging_enabled:
            return False
        if detection.confidence < self.settings.min_event_confidence:
            return False
        if self.settings.log_all_detections:
            return True

        if detection.track_id is not None:
            if detection.track_id not in self.seen_tracks:
                self.seen_tracks.add(detection.track_id)
                self.last_logged[detection.track_id] = frame_index
                return True
            if frame_index - self.last_logged.get(detection.track_id, -10_000) >= self.settings.event_sample_interval:
                self.last_logged[detection.track_id] = frame_index
                return True
            return False

        signature = (detection.class_id,) + detection.bbox()
        if signature not in self.seen_signatures:
            self.seen_signatures.add(signature)
            return True
        return frame_index % self.settings.event_sample_interval == 0


class EventService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def record(
        self,
        session_id: str,
        source_type: str,
        frame_index: int,
        video_time_s: Optional[float],
        detections: Sequence[Detection],
        sampler: EventSampler,
        line_crossings: Optional[Sequence[LineCrossing]] = None,
    ) -> int:
        now = utc_now_iso()
        rows: List[Tuple] = []

        for det in detections:
            if not sampler.should_log(det, frame_index):
                continue
            rows.append(
                (
                    session_id, now, frame_index, video_time_s,
                    det.class_id, det.class_name, float(det.confidence), det.track_id,
                    float(det.x1), float(det.y1), float(det.x2), float(det.y2),
                    source_type, "detection", "{}",
                )
            )

        for crossing in line_crossings or []:
            rows.append(
                (
                    session_id, now, frame_index, video_time_s,
                    crossing.class_id, crossing.class_name, float(crossing.confidence),
                    crossing.track_id, None, None, None, None,
                    source_type, "line_cross", f'{{"direction": "{crossing.direction}"}}',
                )
            )

        if rows:
            self.db.executemany(
                """
                INSERT INTO events
                (session_id, created_at, frame_index, video_time_s, class_id, class_name,
                 confidence, track_id, x1, y1, x2, y2, source_type, event_type, meta_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
        return len(rows)

    # -- queries -----------------------------------------------------------
    @staticmethod
    def _build_where(filters: EventFilter) -> tuple[str, list]:
        clauses: List[str] = []
        params: List = []
        if filters.session_id:
            clauses.append("session_id = ?")
            params.append(filters.session_id)
        if filters.class_name:
            clauses.append("class_name = ?")
            params.append(filters.class_name)
        if filters.class_id is not None:
            clauses.append("class_id = ?")
            params.append(filters.class_id)
        if filters.min_confidence is not None:
            clauses.append("confidence >= ?")
            params.append(filters.min_confidence)
        if filters.start:
            clauses.append("created_at >= ?")
            params.append(filters.start)
        if filters.end:
            clauses.append("created_at <= ?")
            params.append(filters.end)
        if filters.event_type:
            clauses.append("event_type = ?")
            params.append(filters.event_type)
        if filters.track_id is not None:
            clauses.append("track_id = ?")
            params.append(filters.track_id)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        return where, params

    def query(
        self, filters: EventFilter, limit: int = 100, offset: int = 0
    ) -> tuple[List[dict], int]:
        where, params = self._build_where(filters)
        total_row = self.db.query_one(f"SELECT COUNT(*) AS c FROM events{where}", params)
        rows = self.db.query(
            f"SELECT * FROM events{where} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        return rows, int(total_row["c"]) if total_row else 0

    def export_csv(self, filters: EventFilter) -> str:
        where, params = self._build_where(filters)
        rows = self.db.query(
            f"SELECT * FROM events{where} ORDER BY id ASC", params
        )
        buffer = io.StringIO()
        fieldnames = [
            "id", "session_id", "created_at", "frame_index", "video_time_s",
            "class_id", "class_name", "confidence", "track_id",
            "x1", "y1", "x2", "y2", "source_type", "event_type",
        ]
        writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return buffer.getvalue()

    def distinct_classes(self) -> List[str]:
        return [r["class_name"] for r in self.db.query(
            "SELECT DISTINCT class_name FROM events WHERE class_name IS NOT NULL ORDER BY class_name"
        )]

    def delete_for_session(self, session_id: str) -> None:
        self.db.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
