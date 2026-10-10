"""Analytics computed from persisted events, metrics and sessions."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database.db import Database
from app.schemas.analytics import (
    AnalyticsSummary,
    ClassStatistic,
    MetricPoint,
    SessionComparison,
    TimeSeriesPoint,
)


class AnalyticsService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def summary(self) -> AnalyticsSummary:
        sessions = self.db.query_one(
            """
            SELECT
              COUNT(*) AS total_sessions,
              COALESCE(SUM(processed_frames), 0) AS total_frames,
              COALESCE(SUM(unique_tracks), 0) AS total_tracks,
              COALESCE(SUM(event_count), 0) AS total_events,
              AVG(avg_fps) AS avg_fps,
              AVG(avg_inference_ms) AS avg_inference_ms
            FROM sessions
            """
        ) or {}

        detection_events = self.db.query_one(
            "SELECT COUNT(*) AS c FROM events WHERE event_type = 'detection'"
        )
        unique_classes = self.db.query_one(
            "SELECT COUNT(DISTINCT class_name) AS c FROM events WHERE class_name IS NOT NULL"
        )
        duration = self.db.query_one(
            """
            SELECT COALESCE(SUM(
                CASE WHEN source_meta_json IS NOT NULL
                     AND json_valid(source_meta_json)
                     AND json_extract(source_meta_json, '$.duration_s') IS NOT NULL
                THEN json_extract(source_meta_json, '$.duration_s') ELSE 0 END), 0) AS d
            FROM sessions
            """
        )
        statuses = self.db.query(
            "SELECT status, COUNT(*) AS c FROM sessions GROUP BY status"
        )

        total_sessions = int(sessions.get("total_sessions") or 0)
        total_events = int(sessions.get("total_events") or 0)
        return AnalyticsSummary(
            total_sessions=total_sessions,
            total_events=total_events,
            total_detections=int(detection_events["c"]) if detection_events else 0,
            total_unique_tracks=int(sessions.get("total_tracks") or 0),
            total_processed_frames=int(sessions.get("total_frames") or 0),
            total_video_seconds=round(float(duration["d"] or 0.0), 2) if duration else 0.0,
            unique_classes=int(unique_classes["c"]) if unique_classes else 0,
            avg_fps=round(float(sessions["avg_fps"]), 2) if sessions.get("avg_fps") else None,
            avg_inference_ms=round(float(sessions["avg_inference_ms"]), 2)
            if sessions.get("avg_inference_ms")
            else None,
            sessions_by_status={row["status"]: int(row["c"]) for row in statuses},
            has_data=total_sessions > 0,
        )

    def class_statistics(self, limit: int = 25) -> List[ClassStatistic]:
        rows = self.db.query(
            """
            SELECT class_id,
                   class_name,
                   COUNT(*) AS event_count,
                   COUNT(DISTINCT track_id) AS unique_tracks,
                   AVG(confidence) AS avg_conf
            FROM events
            WHERE class_name IS NOT NULL AND event_type = 'detection'
            GROUP BY class_name, class_id
            ORDER BY event_count DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [
            ClassStatistic(
                class_id=row["class_id"],
                class_name=row["class_name"],
                event_count=int(row["event_count"]),
                unique_tracks=int(row["unique_tracks"] or 0),
                avg_confidence=round(float(row["avg_conf"]), 3) if row["avg_conf"] else None,
            )
            for row in rows
        ]

    def events_over_time(self, bucket: str = "hour", limit: int = 100) -> List[TimeSeriesPoint]:
        # SQLite strftime formats: hour -> %Y-%m-%dT%H:00, day -> %Y-%m-%d
        fmt = "%Y-%m-%dT%H:00" if bucket == "hour" else "%Y-%m-%d"
        rows = self.db.query(
            f"""
            SELECT strftime('{fmt}', created_at) AS bucket, COUNT(*) AS c
            FROM events
            WHERE event_type = 'detection'
            GROUP BY bucket
            ORDER BY bucket ASC
            LIMIT ?
            """,
            (limit,),
        )
        return [TimeSeriesPoint(bucket=row["bucket"], events=int(row["c"])) for row in rows if row["bucket"]]

    def session_comparison(self, limit: int = 20) -> List[SessionComparison]:
        rows = self.db.query(
            """
            SELECT id, name, source_type, status, created_at, processed_frames,
                   unique_tracks, event_count, avg_fps, avg_inference_ms
            FROM sessions
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [
            SessionComparison(
                session_id=row["id"],
                name=row["name"],
                source_type=row["source_type"],
                status=row["status"],
                created_at=row["created_at"],
                processed_frames=int(row["processed_frames"] or 0),
                unique_tracks=int(row["unique_tracks"] or 0),
                event_count=int(row["event_count"] or 0),
                avg_fps=round(float(row["avg_fps"]), 2) if row["avg_fps"] else None,
                avg_inference_ms=round(float(row["avg_inference_ms"]), 2)
                if row["avg_inference_ms"]
                else None,
            )
            for row in rows
        ]

    def session_metrics(self, session_id: str, limit: int = 500) -> List[MetricPoint]:
        rows = self.db.query(
            """
            SELECT frame_index, created_at, fps, inference_ms, object_count
            FROM metrics WHERE session_id = ? ORDER BY id ASC LIMIT ?
            """,
            (session_id, limit),
        )
        return [
            MetricPoint(
                frame_index=row["frame_index"],
                created_at=row["created_at"],
                fps=round(float(row["fps"]), 2) if row["fps"] is not None else None,
                inference_ms=round(float(row["inference_ms"]), 2)
                if row["inference_ms"] is not None
                else None,
                object_count=row["object_count"],
            )
            for row in rows
        ]

    def class_options(self) -> List[str]:
        return [
            row["class_name"]
            for row in self.db.query(
                "SELECT DISTINCT class_name FROM events WHERE class_name IS NOT NULL ORDER BY class_name"
            )
        ]

    # -- maintenance -------------------------------------------------------
    def cleanup(self, retention_days: int) -> Dict[str, int]:
        """Delete sessions older than ``retention_days`` (0 disables)."""
        if retention_days <= 0:
            return {"deleted_sessions": 0, "deleted_events": 0, "deleted_metrics": 0}
        from datetime import datetime, timedelta, timezone

        cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).replace(
            microsecond=0
        ).isoformat().replace("+00:00", "Z")
        old = self.db.query("SELECT id FROM sessions WHERE created_at < ?", (cutoff,))
        deleted_sessions = 0
        deleted_events = 0
        deleted_metrics = 0
        for row in old:
            ev = self.db.query_one(
                "SELECT COUNT(*) AS c FROM events WHERE session_id = ?", (row["id"],)
            )
            mt = self.db.query_one(
                "SELECT COUNT(*) AS c FROM metrics WHERE session_id = ?", (row["id"],)
            )
            deleted_events += int(ev["c"]) if ev else 0
            deleted_metrics += int(mt["c"]) if mt else 0
            self.db.execute("DELETE FROM events WHERE session_id = ?", (row["id"],))
            self.db.execute("DELETE FROM metrics WHERE session_id = ?", (row["id"],))
            self.db.execute("DELETE FROM sessions WHERE id = ?", (row["id"],))
            deleted_sessions += 1
        return {
            "deleted_sessions": deleted_sessions,
            "deleted_events": deleted_events,
            "deleted_metrics": deleted_metrics,
        }

    def database_size_bytes(self) -> int:
        try:
            return self.db.path.stat().st_size
        except OSError:
            return 0
