"""Session persistence and serialization."""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from app.database.db import Database, utc_now_iso
from app.schemas.sessions import SessionResponse
from app.schemas.settings_models import UserSettings


def _loads(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


class SessionService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def create(
        self,
        *,
        name: str,
        source_type: str,
        config: UserSettings,
        input_path: Optional[str] = None,
        source_meta: Optional[Dict[str, Any]] = None,
        status: str = "created",
        total_frames: int = 0,
    ) -> Dict[str, Any]:
        session_id = uuid.uuid4().hex
        self.db.execute(
            """
            INSERT INTO sessions
            (id, name, source_type, status, created_at, input_path, config_json,
             source_meta_json, total_frames)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                name,
                source_type,
                status,
                utc_now_iso(),
                input_path,
                config.model_dump_json(),
                json.dumps(source_meta or {}),
                total_frames,
            ),
        )
        return self.get(session_id)

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.db.query_one("SELECT * FROM sessions WHERE id = ?", (session_id,))

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        source_type: Optional[str] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        clauses: List[str] = []
        params: List[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if source_type:
            clauses.append("source_type = ?")
            params.append(source_type)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        total = self.db.query_one(f"SELECT COUNT(*) AS c FROM sessions{where}", params)
        rows = self.db.query(
            f"SELECT * FROM sessions{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        return rows, int(total["c"]) if total else 0

    def update(self, session_id: str, **fields: Any) -> None:
        if not fields:
            return
        for json_field in ("config_json", "source_meta_json", "class_counts_json"):
            if json_field in fields and not isinstance(fields[json_field], str):
                fields[json_field] = json.dumps(fields[json_field])
        columns = ", ".join(f"{key} = ?" for key in fields)
        params = list(fields.values()) + [session_id]
        self.db.execute(f"UPDATE sessions SET {columns} WHERE id = ?", params)

    def delete(self, session_id: str) -> None:
        self.db.execute("DELETE FROM metrics WHERE session_id = ?", (session_id,))
        self.db.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
        self.db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    def active_count(self) -> int:
        row = self.db.query_one(
            "SELECT COUNT(*) AS c FROM sessions WHERE status IN ('running','queued')"
        )
        return int(row["c"]) if row else 0


def serialize_session(
    row: Dict[str, Any], runtime=None, live: Optional[Dict[str, Any]] = None
) -> SessionResponse:
    """Convert a database row (+ optional runtime) into an API response."""
    total = row.get("total_frames") or 0
    processed = row.get("processed_frames") or 0
    progress = round(processed / total, 4) if total else 0.0

    config = _loads(row.get("config_json"), {})
    source_meta = _loads(row.get("source_meta_json"), {})
    class_counts = _loads(row.get("class_counts_json"), {})

    status = row.get("status", "created")
    metrics = {}
    unique_tracks = row.get("unique_tracks") or 0
    event_count = row.get("event_count") or 0
    fps = row.get("avg_fps")
    inference_ms = row.get("avg_inference_ms")

    if runtime is not None:
        metrics = runtime.metrics.as_dict()
        unique_tracks = metrics.get("unique_tracks", unique_tracks)
        event_count = metrics.get("event_count", event_count)
        fps = metrics.get("fps", fps)
        inference_ms = metrics.get("inference_ms", inference_ms)

    stream_available = status == "running" and runtime is not None
    output_available = bool(row.get("output_path"))
    download_url = f"/api/videos/{row['id']}/download" if output_available else None

    response = SessionResponse(
        id=row["id"],
        name=row["name"],
        source_type=row["source_type"],
        status=status,
        created_at=row["created_at"],
        started_at=row.get("started_at"),
        ended_at=row.get("ended_at"),
        error=row.get("error"),
        message=row.get("message"),
        total_frames=total,
        processed_frames=processed,
        unique_tracks=unique_tracks,
        event_count=event_count,
        avg_fps=fps,
        avg_inference_ms=inference_ms,
        progress=progress,
        config=config,
        source_meta=source_meta,
        class_counts=class_counts if class_counts else (metrics.get("class_counts", {}) if metrics else {}),
        output_available=output_available,
        stream_available=stream_available,
        download_url=download_url,
        stream_url=f"/api/stream/{row['id']}" if stream_available else None,
    )
    return response
