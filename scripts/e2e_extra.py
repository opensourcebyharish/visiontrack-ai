"""Extended live-server verification for VisionTrack AI.

Run this *after* ``e2e_smoke.py`` (or after any session) so that it exercises a
second tracking session in the same server process — the case that used to
crash — in addition to error handling, cancellation and analytics.

Requires the backend to be running on ``http://127.0.0.1:8000``:

    backend\.venv\Scripts\python.exe scripts\e2e_extra.py

Covered:
- 404 / 400 / 422 error paths for unknown sessions, bad uploads and bad settings
- live metrics (fps, latency, detections with track IDs) during a running job
- graceful cancellation and partial-progress persistence
- events and track IDs persisted to SQLite and filterable
- analytics returned from stored data (JSON)
- runtime released after a session ends (``/live`` returns 409)
- session deletion and history
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from make_sample_video import make_sample_video  # noqa: E402

BASE = os.environ.get("VISIONTRACK_BASE_URL", "http://127.0.0.1:8000")
IMG = ROOT / "backend" / "tests" / "assets" / "bus.jpg"
client = httpx.Client(base_url=BASE, timeout=120.0)
failures = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"[{'PASS' if condition else 'FAIL'}] {label}{(' -- ' + detail) if detail else ''}")
    if not condition:
        failures.append(label)


def main() -> None:
    # --- error handling -----------------------------------------------------
    check("unknown session -> 404", client.get("/api/sessions/does-not-exist").status_code == 404)
    check(
        "unknown session live -> 404",
        client.get("/api/sessions/does-not-exist/live").status_code == 404,
    )
    check(
        "unsupported upload -> 400",
        client.post(
            "/api/videos/upload", files={"file": ("evil.txt", b"not a video", "text/plain")}
        ).status_code
        == 400,
    )
    check(
        "invalid settings -> 422",
        client.put("/api/settings", json={"confidence": 2.0}).status_code == 422,
    )
    check(
        "unapproved model -> 400",
        client.get("/api/models/classes", params={"model": "not-approved.pt"}).status_code == 400,
    )

    # --- long video: live metrics + cancellation ----------------------------
    long_path = ROOT / "data" / "long-sample.mp4"
    make_sample_video(IMG, long_path, frames=240, width=320, height=240, fps=10)
    with open(long_path, "rb") as handle:
        response = client.post(
            "/api/videos/upload",
            files={"file": ("long-sample.mp4", handle, "video/mp4")},
            data={"imgsz": "320", "confidence": "0.2", "frame_interval": "1"},
        )
    check("long upload accepted", response.status_code == 201, str(response.status_code))
    video_id = response.json()["video_id"]

    saw_running = saw_detections = saw_fps = False
    live: dict = {}
    deadline = time.time() + 30
    while time.time() < deadline:
        probe = client.get(f"/api/sessions/{video_id}/live")
        if probe.status_code == 200:
            live = probe.json()
            saw_running = saw_running or live["status"] in ("running", "queued")
            saw_detections = saw_detections or bool(live.get("detections"))
            saw_fps = saw_fps or (live.get("fps") is not None and live.get("inference_ms") is not None)
            if saw_detections and saw_fps:
                break
        time.sleep(0.4)
    check("live reports running", saw_running, f"status={live.get('status')}")
    check("live reports fps+latency", saw_fps, f"fps={live.get('fps')} ms={live.get('inference_ms')}")
    check(
        "live reports detections w/ track ids",
        saw_detections
        and any(d.get("track_id") is not None for d in live.get("detections", [])),
        f"n={len(live.get('detections', []))}",
    )

    check("stop accepted", client.post(f"/api/sessions/{video_id}/stop").status_code == 200)
    final: dict = {}
    for _ in range(60):
        final = client.get(f"/api/sessions/{video_id}").json()
        if final["status"] in ("cancelled", "stopped", "completed", "failed"):
            break
        time.sleep(0.5)
    check("cancellation honoured", final["status"] in ("cancelled", "stopped"), f"status={final['status']}")
    check("partial frames processed", final["processed_frames"] > 0, f"{final['processed_frames']} frames")
    check(
        "live after stop -> 409 (runtime released)",
        client.get(f"/api/sessions/{video_id}/live").status_code == 409,
    )

    # --- tracking ids + counting from persisted events ----------------------
    events = client.get("/api/events", params={"session_id": video_id, "limit": 1000}).json()
    check("events persisted", events["total"] > 0, f"{events['total']} rows")
    track_ids = {e["track_id"] for e in events["items"] if e["track_id"] is not None}
    check("track ids persisted", len(track_ids) > 0, f"{len(track_ids)} distinct tracks")
    if track_ids:
        tid = next(iter(track_ids))
        filtered = client.get("/api/events", params={"track_id": tid}).json()
        check("filter by track_id", all(e["track_id"] == tid for e in filtered["items"]))

    # --- session history + analytics from stored data -----------------------
    listing = client.get("/api/sessions", params={"limit": 100}).json()
    check("session history lists sessions", listing["total"] >= 1, f"{listing['total']} sessions")

    summary = client.get("/api/analytics/summary").json()
    check(
        "analytics summary has data",
        summary["has_data"] and summary["total_detections"] > 0,
        f"{summary['total_detections']} detections, {summary['total_sessions']} sessions",
    )
    check("analytics classes non-empty", len(client.get("/api/analytics/classes").json()) > 0)
    check(
        "analytics timeseries (JSON)",
        len(client.get("/api/analytics/timeseries", params={"bucket": "hour"}).json()) > 0,
    )
    check("analytics session comparison (JSON)", len(client.get("/api/analytics/sessions").json()) > 0)

    # --- cleanup ------------------------------------------------------------
    deleted = client.delete(f"/api/sessions/{video_id}")
    check("delete session", deleted.status_code == 200 and deleted.json().get("deleted") is True)
    check("deleted session gone", client.get(f"/api/sessions/{video_id}").status_code == 404)

    long_path.unlink(missing_ok=True)
    client.close()

    print()
    if failures:
        print(f"{len(failures)} FAILURES: {failures}")
        raise SystemExit(1)
    print("All extra verification checks passed.")


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    os._exit(0)
