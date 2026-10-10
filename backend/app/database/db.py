"""SQLite persistence layer.

A thin, thread-safe repository around the stdlib ``sqlite3`` module.  A single
connection guarded by a re-entrant lock keeps the implementation small and
predictable; all writes are short and never happen while a frame is being
processed.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence


def utc_now_iso() -> str:
    """Return an ISO-8601 UTC timestamp with a trailing ``Z``."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    source_type       TEXT NOT NULL,
    status            TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    started_at        TEXT,
    ended_at          TEXT,
    input_path        TEXT,
    output_path       TEXT,
    config_json       TEXT NOT NULL DEFAULT '{}',
    source_meta_json  TEXT NOT NULL DEFAULT '{}',
    class_counts_json TEXT NOT NULL DEFAULT '{}',
    error             TEXT,
    message           TEXT,
    total_frames      INTEGER NOT NULL DEFAULT 0,
    processed_frames  INTEGER NOT NULL DEFAULT 0,
    unique_tracks     INTEGER NOT NULL DEFAULT 0,
    event_count       INTEGER NOT NULL DEFAULT 0,
    avg_fps           REAL,
    avg_inference_ms  REAL
);

CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    frame_index  INTEGER,
    video_time_s REAL,
    class_id     INTEGER,
    class_name   TEXT,
    confidence   REAL,
    track_id     INTEGER,
    x1 REAL, y1 REAL, x2 REAL, y2 REAL,
    source_type  TEXT,
    event_type   TEXT NOT NULL DEFAULT 'detection',
    meta_json    TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metrics (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    frame_index   INTEGER,
    created_at    TEXT NOT NULL,
    fps           REAL,
    inference_ms  REAL,
    object_count  INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_class ON events(class_name);
CREATE INDEX IF NOT EXISTS idx_metrics_session ON metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
"""


class Database:
    """Thread-safe SQLite wrapper."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            str(self.path), check_same_thread=False, timeout=30.0
        )
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._conn.execute("PRAGMA synchronous=NORMAL;")
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    # -- low level helpers ------------------------------------------------
    def execute(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return cur

    def executemany(self, sql: str, seq: Iterable[Sequence[Any]]) -> None:
        with self._lock:
            self._conn.executemany(sql, seq)
            self._conn.commit()

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._conn.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]

    def query_one(self, sql: str, params: Sequence[Any] = ()) -> Optional[dict[str, Any]]:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # -- settings key/value ----------------------------------------------
    def get_setting(self, key: str) -> Optional[str]:
        row = self.query_one("SELECT value FROM app_settings WHERE key = ?", (key,))
        return row["value"] if row else None

    def set_setting(self, key: str, value: Any) -> None:
        payload = json.dumps(value)
        self.execute(
            """
            INSERT INTO app_settings(key, value, updated_at) VALUES(?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (key, payload, utc_now_iso()),
        )

    def all_settings(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for row in self.query("SELECT key, value FROM app_settings"):
            try:
                result[row["key"]] = json.loads(row["value"])
            except json.JSONDecodeError:
                continue
        return result


_db: Optional[Database] = None
_db_lock = threading.Lock()


def get_database(path: Optional[Path | str] = None) -> Database:
    """Return the process-wide database singleton."""
    global _db
    with _db_lock:
        if _db is None:
            if path is None:
                from app.config import get_settings

                path = get_settings().database_path
            _db = Database(path)
        return _db


def reset_database_for_tests(path: Path | str) -> Database:
    """Create a fresh database instance (used by the test-suite)."""
    global _db
    with _db_lock:
        if _db is not None:
            _db.close()
        _db = Database(path)
        return _db
