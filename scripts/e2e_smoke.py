"""End-to-end smoke test against a *running* VisionTrack AI server.

Requires the backend to be running, e.g.:

    cd backend
    .venv\\Scripts\\Activate.ps1
    uvicorn app.main:app --host 127.0.0.1 --port 8000

Then:

    backend\\.venv\\Scripts\\python.exe scripts\\e2e_smoke.py

It exercises health/system/models/settings, uploads a generated video built
from a real image, waits for processing, downloads the annotated MP4 and
confirms the frontend is served.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from make_sample_video import make_sample_video  # noqa: E402

BASE = os.environ.get("VISIONTRACK_BASE_URL", "http://127.0.0.1:8000")
SAMPLE_IMAGE = PROJECT_ROOT / "backend" / "tests" / "assets" / "bus.jpg"


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"[{mark}] {label}{(' — ' + detail) if detail else ''}")
    if not condition:
        raise SystemExit(1)


def main() -> None:
    client = httpx.Client(base_url=BASE, timeout=120.0)

    health = client.get("/api/health").json()
    check("health", health["status"] == "ok", f"db={health['database']}")

    info = client.get("/api/system/info").json()
    check("system/info", info["app"] == "VisionTrack AI", f"device={info['device']} cuda={info['cuda_available']}")

    models = client.get("/api/models").json()
    check("models listing", any(m["name"] == "yolo11n.pt" for m in models), f"{len(models)} model(s)")

    settings = client.get("/api/settings").json()
    check("settings", settings["model"] == "yolo11n.pt")

    # Frontend served from frontend/dist when built.
    index = client.get("/")
    check(
        "frontend served",
        index.status_code == 200 and "<div id=\"root\">" in index.text,
        f"status={index.status_code}",
    )

    # Generate a small real video and upload it.
    video_path = PROJECT_ROOT / "data" / "e2e-sample.mp4"
    make_sample_video(SAMPLE_IMAGE, video_path, frames=16, width=320, height=240, fps=8)
    print(f"       sample video: {video_path.stat().st_size} bytes")

    with open(video_path, "rb") as handle:
        response = client.post(
            "/api/videos/upload",
            files={"file": ("e2e-sample.mp4", handle, "video/mp4")},
            data={"imgsz": "320", "confidence": "0.2"},
        )
    check("upload accepted", response.status_code == 201, f"status={response.status_code}")
    upload = response.json()
    video_id = upload["video_id"]
    print(f"       video_id={video_id} frames={upload['metadata']['frame_count']}")

    deadline = time.time() + 300
    final = None
    while time.time() < deadline:
        final = client.get(f"/api/videos/{video_id}/status").json()["session"]
        if final["status"] in ("completed", "failed", "cancelled"):
            break
        time.sleep(0.5)
    check("processing completed", final is not None and final["status"] == "completed", f"status={final['status'] if final else '?'}")
    check("frames processed", final["processed_frames"] > 0, f"{final['processed_frames']} frames")
    check("objects tracked", final["unique_tracks"] >= 1, f"{final['unique_tracks']} unique")
    check("events stored", final["event_count"] > 0, f"{final['event_count']} events")

    events = client.get("/api/events", params={"session_id": video_id}).json()
    check("events query", events["total"] > 0, f"{events['total']} rows")
    check("event fields", events["items"][0]["class_name"] is not None)

    download = client.get(f"/api/videos/{video_id}/download")
    check(
        "annotated download",
        download.status_code == 200 and len(download.content) > 1000,
        f"{len(download.content)} bytes",
    )
    out_path = PROJECT_ROOT / "data" / "e2e-output.mp4"
    out_path.write_bytes(download.content)

    import cv2

    capture = cv2.VideoCapture(str(out_path))
    ok, frame = capture.read()
    capture.release()
    check("output readable", ok and frame is not None, f"{frame.shape if frame is not None else 'no frame'}")

    summary = client.get("/api/analytics/summary").json()
    check("analytics", summary["has_data"] and summary["total_detections"] > 0, f"{summary['total_detections']} detections")

    csv = client.get("/api/events/export", params={"session_id": video_id})
    check("csv export", csv.status_code == 200 and "class_name" in csv.text.splitlines()[0])

    client.close()
    print("\nAll end-to-end checks passed.")


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    os._exit(0)
