# VisionTrack AI — Architecture

This document explains how the system is put together, why it is built this way,
and where the important boundaries are.

## 1. High-level shape

```
┌──────────────────────────────┐        REST + MJPEG        ┌──────────────────────────────────────┐
│  React 18 + TypeScript (SPA) │  ◀───────────────────────▶ │  FastAPI application (Python 3.10)    │
│  Vite · Tailwind · Recharts  │                            │  Uvicorn · Pydantic v2                 │
└──────────────────────────────┘                            │                                        │
                                                            │  ┌────────────────────────────────┐   │
   Webcam ─┐                                                │  │ ProcessingManager               │   │
   Video  ─┼──▶ capture / chunked upload ─────────────────▶ │  │  ThreadPoolExecutor(max_workers=1)│  │
           │                                                │  │  per-session Runtime (in-memory) │  │
           │                                                │  └──────────────┬─────────────────┘   │
           │                                                │                 ▼                      │
           │                                                │  Detector (Ultralytics YOLO)          │
           │                                                │    · ByteTrack / BoT-SORT             │
           │                                                │    · UniqueCounter / LineCounter      │
           │                                                │    · OpenCV annotation                │
           │                                                │                 │                      │
           │                                                │        ┌────────┴─────────┐            │
           │                                                │        ▼                  ▼            │
           │                                                │  SQLite (WAL)      JPEG frame buffer    │
           │                                                │  sessions/events    (latest frame)      │
           │                                                └──────────────────────────────────────┘
```

Single process, single FastAPI app. There is no message broker, no Celery, no
external service. Background work runs on an in-process thread pool.

## 2. Backend layers

```
backend/app/
├── main.py                 # create_app(), lifespan, static file mount, error handler
├── config.py               # bootstrap Settings (env/.env) + PROJECT_ROOT
├── container.py            # composition root: builds and wires all singletons
├── logging_config.py       # one logging configuration
├── api/                    # thin HTTP layer (routers)
├── schemas/                # Pydantic request/response models (the public contract)
├── core/                   # pure domain logic (no FastAPI imports)
├── services/               # application services + in-memory runtime state
├── database/               # sqlite3 schema + repository
└── workers/                # background job orchestration
```

Dependencies point **inward**: `api → services → core/database`. `core` knows
nothing about HTTP. This keeps the detection, counting and video logic unit
testable without a server.

### Composition root (`container.py`)

`build_container()` constructs one `AppContainer` at startup and stores it on
`app.state.container`. Every endpoint receives it through the `get_container`
dependency. The container owns:

- `settings` — frozen bootstrap settings from the environment.
- `db` — the SQLite repository (WAL mode).
- `model_registry` / `detector` — YOLO weights loaded once per `(model, device)`.
- `session_service`, `event_service`, `analytics_service`, `settings_service`.
- `camera_manager` — camera probing.
- `processing_manager` — the worker orchestration (thread pool + runtimes).

### API layer (`api/`)

| Router        | Responsibility                                            |
| ------------- | --------------------------------------------------------- |
| `health.py`   | `/health`, `/system/info`                                 |
| `models.py`   | `/models`, `/models/classes`                              |
| `cameras.py`  | `/cameras`                                                |
| `videos.py`   | upload, status, reprocess, download                       |
| `sessions.py` | create/list/get/live/stop/delete                          |
| `stream.py`   | MJPEG stream + snapshot frame                             |
| `events.py`   | event query + CSV export                                  |
| `analytics.py`| summary, classes, timeseries, session comparison, metrics |
| `settings.py` | get/put/reset/cleanup                                     |

Routers do validation and shape the response; all real work is delegated.

## 3. Core domain (`core/`)

| Module          | Responsibility                                                            |
| --------------- | ------------------------------------------------------------------------- |
| `device.py`     | `resolve_device()` / `cuda_available()` — real CUDA probe via torch        |
| `detector.py`   | `Detection` dataclass, `ModelRegistry`, `Detector.run()`                   |
| `counting.py`   | `UniqueCounter` and `LineCounter` (virtual-line crossing)                  |
| `annotations.py`| OpenCV drawing of boxes/labels/line onto a frame                           |
| `video.py`      | `probe_video()` metadata, frame iteration                                 |
| `storage.py`    | safe filenames, path containment, safe delete                             |
| `metrics.py`    | rolling FPS / latency meters                                               |

### Inference

`ModelRegistry` lazily loads a weight file once per `(model_name, device)` and
caches the Ultralytics model object. `Detector.run(frame, settings, tracking)`
runs prediction, converts boxes into `Detection` objects, and optionally enables
the configured tracker. A module-level `INFERENCE_LOCK` serialises inference so
overlapping jobs cannot oversubscribe the CPU.

### Counting

- `UniqueCounter` assigns stable track IDs and counts distinct objects seen.
- `LineCounter` counts track IDs that cross a virtual line, with an optional
  direction filter. Each track is counted at most once per line (dedup by
  `track_id`) to avoid recounting the same object.

## 4. Runtime state and workers

Persistent state lives in SQLite. Volatile per-session state lives in an
in-memory `LiveMetrics` / `Runtime` object:

- latest annotated JPEG (for MJPEG/napshot),
- live counters (object count, class counts, line counts, unique tracks),
- a cancellation flag checked by the processing loop,
- current status, FPS and inference-latency samples.

`ProcessingManager`:

- owns a `ThreadPoolExecutor(max_workers=settings.max_concurrent_jobs)`
  (default **1**),
- rejects a new job with `DeviceBusyError` (HTTP 409) when the pool is saturated
  or the camera is in use,
- runs `process_video` / `process_webcam` loops that read frames, call the
  detector, annotate, update runtime metrics, sample events to SQLite, and write
  the output video,
- supports `stop()` (cooperative cancellation) and `shutdown()` (on app
  lifespan teardown, closes workers and the DB),
- resets the YOLO tracker before each session so track IDs do not leak between
  sessions, and rebuilds it if the configured tracker type changed,
- releases the per-session `RuntimeState` in a `finally` block when a job ends
  (completed, cancelled or failed), so memory is reclaimed and `/live` correctly
  reports that no runtime is active afterwards.

Because jobs run off the request thread, HTTP handlers return immediately (201
for a new session, 200 for status) and the client polls status or watches the
MJPEG stream.

### Tracker lifecycle (important Ultralytics detail)

Ultralytics caches one predictor — and therefore one tracker — per loaded model.
`Model.track` registers its tracker callbacks **only** when the `trackers`
attribute is absent, and `on_predict_start` early-returns when `persist=True`
and the attribute exists. The reset therefore calls `reset()` on the *existing*
tracker instances: emptying `predictor.trackers` would leave the next session
with no tracker and crash with `IndexError` on its first frame. When the user
switches the tracker setting, the old instances are dropped and the tracker
callbacks de-duplicated so the next `model.track` rebuilds a fresh tracker of the
requested type. This is covered by regression tests.

## 5. Persistence (SQLite)

`db.py` creates the schema on startup and uses `sqlite3` in **WAL** mode so
concurrent reads (analytics while a job writes) do not block. Tables:

- `sessions` — one row per processing run (status, frames, tracks, config JSON,
  source metadata).
- `events` — sampled detection and line-crossing events (class, confidence,
  bbox, track_id, frame_index, video_time).
- `metrics` — per-frame performance samples (fps, inference_ms, object_count).
- `user_settings` — the persisted `UserSettings` singleton.

Event rows are **sampled** (`event_sample_interval`, default every 30 frames) to
bound database growth; `log_all_detections` disables sampling.

Analytics are always computed from stored rows, so an empty database returns
zeroes rather than an error.

## 6. Streaming

`GET /stream/{id}` returns `multipart/x-mixed-replace` MJPEG built from the
runtime's latest JPEG. `GET /stream/{id}/frame` returns the latest frame as a
single `image/jpeg`. The stream emits the final frame then closes when the
session stops. This decouples the browser from inference cadence: the producer
writes to a single-slot buffer and the consumer reads whatever is current.

### Webcam capture tuning

The webcam loop (`CameraWorker`) reads at the camera's native rate but only runs
inference every `frame_interval`-th frame; skipped frames are still read and
dropped so the loop always analyses a fresh frame rather than a stale backlog
(the last annotated frame stays in the buffer, so the view never freezes). The
requested capture size (`camera_width`/`camera_height`, `0` = native) is applied
with `CAP_PROP_FRAME_WIDTH/HEIGHT` best-effort — some drivers ignore it. Smaller
input sizes (`imgsz` down to 192) and capture resolution, plus disabling
tracking, are the main CPU speed levers.

## 7. Frontend

```
frontend/src/
├── App.tsx            # HashRouter shell: Sidebar + Header + <Routes> + ErrorBoundary
├── main.tsx           # React root
├── services/api.ts    # typed fetch client (single source of API truth)
├── hooks/useApi.ts    # useAsync / usePolling data hooks
├── types/index.ts     # shared types mirroring the Pydantic schemas
├── components/        # Card, MetricCard, tables, charts, sliders, overlay, ConfirmDialog...
└── pages/             # Overview, LiveDetection, VideoAnalysis, Analytics, History, Settings
```

- **Routing** uses `HashRouter` so the production build works when served as a
  static bundle from the backend with no server-side route rewriting.
- **Data** always flows through `services/api.ts`; there is no mock data in the
  production path. `usePolling` refreshes sessions/analytics/metrics on an
  interval; `useAsync` covers one-shot reads.
- **API base** resolution: `VITE_API_BASE_URL` when set (non-empty); otherwise
  `http://127.0.0.1:8000` in dev and same-origin (`""`) in the production build.
- **Live view** uses the MJPEG url directly in an `<img>` and polls
  `/sessions/{id}/live` for metrics and current detections.

### Design system and accessibility

The UI is a token-driven "command center" theme: palette, surfaces, borders and
glows live in `tailwind.config.js` plus CSS variables in `src/index.css`, so every
page consumes the same cyan/violet/amber language (green = FPS, amber = inference,
cyan = events, violet = tracks). Charts keep readable axes, legends and tooltips.

The redesign is presentational — `services/api.ts`, `types/index.ts`, routing and
polling cadence are unchanged. Accessibility is built into the shell and shared
components:

- a **skip link** (`App.tsx`) focuses `#main-content`; because the app uses
  `HashRouter`, the handler calls `preventDefault()` so the route fragment is not
  clobbered;
- the off-canvas sidebar is `invisible` (and out of the tab order) when closed on
  small screens, and closes on **Escape**;
- destructive actions use the reusable **`ConfirmDialog`** (`role="alertdialog"`,
  `aria-modal`, focus trap, Escape-to-cancel, focus restored to the trigger)
  instead of `window.confirm`;
- status/success/error use `role="status"` / `role="alert"` live regions, while
  high-frequency telemetry (FPS, latency) is intentionally *not* announced;
- `prefers-reduced-motion` collapses decorative animation, with visible
  `:focus-visible` rings and accessible names for icon-only controls.

## 8. Security boundaries

- Upload validation: extension allow-list + `VISIONTRACK_MAX_UPLOAD_MB` size cap;
  server-generated random filenames (client filename never touches disk paths).
- Path containment: all reads/deletes resolve under `data/`; escapes are rejected
  (`safe_delete`, storage helpers).
- No arbitrary loading: only approved model names and a fixed tracker set.
  There is no endpoint that fetches a URL, model or file from the network.
- CORS is restricted to configured local origins.
- No stack traces to clients: a global exception handler logs server-side and
  returns a generic 500.

## 9. Lifecycle

1. **Startup** (`lifespan`): configure logging, build the container, log the
   resolved device (`cuda=True/False`).
2. **Serving**: requests are handled by routers; jobs run on the executor.
3. **Shutdown**: `processing_manager.shutdown()` cancels/joins workers and
   `db.close()` flushes/closes SQLite.

Resource cleanup is also exercised in tests (worker cancellation, camera
unavailable, busy guard).
