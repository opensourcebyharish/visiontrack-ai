# VisionTrack AI — HTTP API

Base URL: `http://127.0.0.1:8000/api`

- All request/response bodies are JSON unless noted.
- Interactive OpenAPI documentation: `http://127.0.0.1:8000/docs`
  (ReDoc at `/redoc`, schema at `/openapi.json`).
- Errors use the shape `{"detail": "<message>"}`. Validation errors return `422`
  with FastAPI's structured detail list. Unhandled errors return a generic `500`
  message; details are logged server-side only.

Common status codes: `200` OK, `201` created, `400` bad request, `404` not found,
`409` conflict (device busy / no runtime / already processing), `413` payload too
large, `422` validation error, `500` internal error.

---

## System

### `GET /health`

Liveness and dependency check.

```json
{
  "status": "ok",
  "app": "VisionTrack AI",
  "version": "1.0.0",
  "database": "ok",
  "model_loaded": true,
  "uptime_s": 42.17
}
```

### `GET /system/info`

Runtime environment and resolved inference device.

```json
{
  "app": "VisionTrack AI",
  "version": "1.0.0",
  "python_version": "3.10.11",
  "platform": "Windows 10",
  "processor": "Intel64 Family 6 ...",
  "cpu_count": 10,
  "device": "cpu",
  "cuda_available": false,
  "cuda_device_name": null,
  "torch_version": "2.11.0+cpu",
  "opencv_version": "4.8.1",
  "ultralytics_version": "8.4.49",
  "default_model": "yolo11n.pt",
  "data_dir": "C:\\...\\data",
  "max_concurrent_jobs": 1,
  "active_sessions": 0,
  "details": { "loaded_models": ["yolo11n.pt"], "db_bytes": 40960 }
}
```

`cuda_available` is only ever `true` when a CUDA device is actually present.

### `GET /models`

Approved models and whether each weight file exists locally.

```json
[
  { "name": "yolo11n.pt", "path": "C:\\...\\models\\yolo11n.pt", "available": true, "is_default": true }
]
```

### `GET /models/classes?model=yolo11n.pt`

Class-id → name map. `model` must be on the approved list (else `400`); returns
`503` if the model cannot be loaded.

```json
{ "model": "yolo11n.pt", "classes": [ { "id": 0, "name": "person" } ] }
```

### `GET /cameras?probe=true`

Enumerate camera indices. `probe=false` is fast (does not open devices).

```json
[
  { "index": 0, "name": "Camera 0", "available": true, "width": 1280, "height": 720, "fps": 30.0, "backend": "DSHOW" }
]
```

---

## Sessions

A **session** represents one processing run: a live webcam capture or a video
analysis job.

Session statuses: `created`, `queued`, `running`, `completed`, `cancelled`,
`stopped`, `failed`.

`SessionResponse` fields:

| Field               | Type     | Notes                                              |
| ------------------- | -------- | -------------------------------------------------- |
| `id`                | string   | UUID                                               |
| `name`              | string   | Display name                                       |
| `source_type`       | string   | `webcam` or `video`                                |
| `status`            | string   | see list above                                     |
| `created_at`        | string   | ISO-8601 (UTC)                                     |
| `started_at`        | string?  |                                                    |
| `ended_at`          | string?  |                                                    |
| `error`             | string?  | Failure reason (safe message, no stack trace)      |
| `message`           | string?  | Informational message                              |
| `total_frames`      | int      | Known for videos; `0` for live until it advances   |
| `processed_frames`  | int      |                                                    |
| `unique_tracks`     | int      | Distinct tracked objects                           |
| `event_count`       | int      | Stored events                                      |
| `avg_fps`           | float?   | Live for running sessions, else final average      |
| `avg_inference_ms`  | float?   | Per-frame average                                  |
| `progress`          | float    | `0..1`                                             |
| `config`            | object   | Effective `UserSettings`                           |
| `source_meta`       | object   | Video metadata (width/height/fps/frame_count/…)    |
| `class_counts`      | object   | `{ "person": 4 }`                                  |
| `output_available`  | bool     | Annotated video ready                              |
| `stream_available`  | bool     | Live runtime active                                |
| `download_url`      | string?  | `/api/videos/{id}/download` when available         |
| `stream_url`        | string?  | `/api/stream/{id}` when available                  |

### `POST /sessions`

Start a session.

Webcam:

```json
{
  "source_type": "webcam",
  "name": "Front door",
  "camera_index": 0,
  "config": { "confidence": 0.35, "imgsz": 480, "tracking_enabled": true, "classes": [0] }
}
```

Video (re-queue an already uploaded video):

```json
{ "source_type": "video", "video_id": "<session-id>", "config": { "confidence": 0.3 } }
```

`config` is optional and merged over the current persisted settings. Returns
`201` with the `SessionResponse`. Returns `409` if the device is busy, `400` if
`video_id` is missing for a video session, `404` if the video is unknown.

### `GET /sessions?limit=50&offset=0&status=running&source_type=webcam`

Paginated session list: `{ "items": [...], "total": 12 }`.

### `GET /sessions/{id}`

Single `SessionResponse`, or `404`.

### `GET /sessions/{id}/live`

Live metrics for an active session (poll this for the dashboard). Returns `409`
if the session has no active runtime, `404` if unknown.

```json
{
  "status": "running",
  "fps": 3.4,
  "inference_ms": 285.1,
  "object_count": 5,
  "frame_index": 120,
  "processed_frames": 120,
  "total_frames": 0,
  "unique_tracks": 8,
  "event_count": 6,
  "class_counts": { "person": 4, "bus": 1 },
  "line_counts": {},
  "detections": [
    { "class_id": 0, "class_name": "person", "confidence": 0.91,
      "track_id": 3, "x1": 12.0, "y1": 40.0, "x2": 90.0, "y2": 210.0 }
  ],
  "error": null,
  "message": null
}
```

### `POST /sessions/{id}/stop`

Gracefully cancel a running/queued session. Returns the updated
`SessionResponse` (`stopped` for webcam, `cancelled` for video).

### `DELETE /sessions/{id}`

Delete a session, its events and any files inside the data directory. Returns
`409` if the session is currently busy. Response: `{ "deleted": true, "session_id": "..." }`.

---

## Video upload & processing

### `POST /videos/upload` (multipart/form-data)

| Form field         | Type   | Notes                                    |
| ------------------ | ------ | ---------------------------------------- |
| `file`             | file   | **required**; validated extension + size |
| `name`             | string | Optional display name                    |
| `confidence`       | float  | Optional override                        |
| `imgsz`            | int    | Optional override                        |
| `model`            | string | Optional override (approved only)        |
| `device`           | string | `auto` / `cpu` / `cuda`                   |
| `tracking_enabled` | bool   | Optional override                        |
| `frame_interval`   | int    | Optional override (process every Nth frame) |

Returns `201`:

```json
{
  "video_id": "bb8476448bbe47cda08a84b508cc123d",
  "session": { "...": "SessionResponse" },
  "filename": "street.mp4",
  "size_bytes": 89258,
  "metadata": { "width": 320, "height": 240, "fps": 8.0, "frame_count": 16, "duration_s": 2.0 }
}
```

Errors: `400` unsupported/empty/unreadable file, `413` too large, `422` invalid
configuration overrides.

### `GET /videos/{id}/status`

```json
{ "session": { "...": "SessionResponse" }, "progress": 0.62,
  "output_available": false, "download_url": null }
```

### `POST /videos/{id}/process`

Re-process an existing upload using the current settings. `409` if already
processing, `400` if the source file is gone.

### `GET /videos/{id}/download`

Download the annotated MP4 (`video/mp4`). `404` until processing completes; `403`
if the stored output somehow resolves outside the data directory.

---

## Streaming

### `GET /stream/{id}`

`multipart/x-mixed-replace` MJPEG stream of annotated frames. Suitable for an
`<img src="...">`. `404` unknown session, `409` if the session is not active.
The stream ends when the session stops.

### `GET /stream/{id}/frame`

Latest annotated frame as `image/jpeg` (snapshot). `404` if no frame yet.

---

## Events

Detection events are sampled rows persisted to SQLite.

`EventResponse`:

```json
{
  "id": 41,
  "session_id": "bb84...",
  "created_at": "2026-10-09T12:15:03.221000+00:00",
  "frame_index": 8,
  "video_time_s": 1.0,
  "class_id": 0,
  "class_name": "person",
  "confidence": 0.91,
  "track_id": 3,
  "x1": 12.0, "y1": 40.0, "x2": 90.0, "y2": 210.0,
  "source_type": "video",
  "event_type": "detection"
}
```

`event_type` is `detection` or `line_cross`.

### `GET /events`

Query parameters (all optional): `session_id`, `class_name`, `class_id`,
`min_confidence` (0–1), `start`, `end` (ISO-8601), `event_type`, `track_id`,
`limit` (1–1000, default 100), `offset`.

```json
{ "items": [ { "...": "EventResponse" } ], "total": 42, "limit": 100, "offset": 0 }
```

### `GET /events/classes`

`{ "classes": ["bus", "person"] }`

### `GET /events/export`

Same filters as `/events`; returns `text/csv` with a
`Content-Disposition: attachment` header.

CSV columns: `id, session_id, created_at, frame_index, video_time_s, class_id,
class_name, confidence, track_id, x1, y1, x2, y2, source_type, event_type`.

---

## Analytics

All analytics are computed from stored data; an empty database returns zeroes and
empty arrays (never an error).

### `GET /analytics/summary`

```json
{
  "total_sessions": 3,
  "total_events": 42,
  "total_detections": 42,
  "total_unique_tracks": 17,
  "total_processed_frames": 480,
  "total_video_seconds": 60.0,
  "unique_classes": 5,
  "avg_fps": 2.4,
  "avg_inference_ms": 305.0,
  "sessions_by_status": { "completed": 3 },
  "has_data": true
}
```

### `GET /analytics/classes?limit=25`

```json
[ { "class_id": 0, "class_name": "person", "event_count": 30,
    "unique_tracks": 12, "avg_confidence": 0.82 } ]
```

### `GET /analytics/timeseries?bucket=hour|day`

```json
[ { "bucket": "2026-10-09T12:00:00+00:00", "events": 15 } ]
```

### `GET /analytics/sessions?limit=20`

Per-session comparison rows (id, name, type, status, frames, tracks, events,
fps, inference).

### `GET /analytics/sessions/{id}/metrics?limit=500`

Per-frame performance samples: `frame_index`, `created_at`, `fps`,
`inference_ms`, `object_count`. `404` if the session is unknown.

---

## Settings

`UserSettings` (also the request body for `PUT /settings`): detection
(`confidence`, `iou`, `imgsz`, `model`, `classes`, `tracking_enabled`, `device`,
`tracker`), processing (`frame_interval`, `max_upload_mb`, `jpeg_quality`,
`stream_fps`, `default_camera_index`, `camera_width`, `camera_height`), event
logging (`event_logging_enabled`, `log_all_detections`, `event_sample_interval`,
`min_event_confidence`), line crossing (`line_crossing_enabled`,
`line_orientation`, `line_position`, `line_direction`) and
`data_retention_days`.

`imgsz` accepts `192, 256, 320, 416, 480, 640, 800, 960, 1280` (multiples of 32;
smaller is faster). `camera_width`/`camera_height` request a webcam capture
resolution (both must be set together, even, ≥ 64; `0` = native) and are applied
best-effort by the driver. `frame_interval` applies to both video and webcam
(the webcam still reads and drops skipped frames so it never analyses a backlog).

- `GET /settings` — current effective settings.
- `PUT /settings` — partial update; unknown fields or invalid values return `422`.
- `POST /settings/reset` — restore defaults.
- `POST /settings/cleanup` — apply retention, returning counts:

```json
{ "deleted_sessions": 2, "deleted_events": 130, "retention_days": 30,
  "database_size_bytes": 204800 }
```

---

## cURL examples

```powershell
# Live health
curl.exe http://127.0.0.1:8000/api/health

# Upload + process a video at 640px
curl.exe -X POST "http://127.0.0.1:8000/api/videos/upload" `
  -F "file=@C:\videos\street.mp4" -F "imgsz=640" -F "confidence=0.25"

# Poll progress
curl.exe "http://127.0.0.1:8000/api/videos/<id>/status"

# Filter events
curl.exe "http://127.0.0.1:8000/api/events?class_name=person&min_confidence=0.5"

# Export CSV
curl.exe "http://127.0.0.1:8000/api/events/export?session_id=<id>" -o events.csv

# Update a setting
curl.exe -X PUT "http://127.0.0.1:8000/api/settings" `
  -H "Content-Type: application/json" -d "{\"confidence\":0.4}"
```
