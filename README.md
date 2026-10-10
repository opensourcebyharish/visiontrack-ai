# VisionTrack AI

A local-first real-time computer vision system that performs **object detection**,
**multi-object tracking**, **counting** and **analytics** on a webcam feed or an
uploaded video. Everything runs on your machine — no cloud calls, no mock
detections. Frames are processed by a real YOLO model through a FastAPI backend,
streamed to a polished React dashboard, and every detection event is persisted to
SQLite and exportable as CSV.

```
┌────────────────────────┐      MJPEG / REST       ┌───────────────────────────┐
│  React + TypeScript UI │ ◀─────────────────────▶ │  FastAPI (Python 3.10)     │
│  Vite · Tailwind       │                         │  Uvicorn                   │
│  Recharts · Lucide     │                         │                            │
└────────────────────────┘                         │  ┌──────────────────────┐  │
                                                    │  │ ThreadPoolExecutor   │  │
   Webcam ──┐                                       │  │ (bounded, max_workers=1)│
   Video  ──┼──▶ upload / capture ─────────────────▶│  └─────────┬────────────┘  │
            │                                       │            ▼               │
            │                                       │  Ultralytics YOLO (CPU/GPU)│
            │                                       │  ByteTrack / BoT-SORT      │
            │                                       │  Counting · Line crossing  │
            │                                       │  Annotation (OpenCV)       │
            │                                       │            │               │
            │                                       │            ▼               │
            │                                       │  SQLite (WAL) · JPEG frame │
            │                                       │  buffer · CSV export       │
            │                                       └───────────────────────────┘
```

## Features

- **Real YOLO inference** — Ultralytics YOLO11/YOLOv8 (`yolo11n.pt` by default),
  CPU or CUDA, with a process-wide inference lock so a machine is never
  oversubscribed.
- **Object tracking** — ByteTrack (default) or BoT-SORT, with persistent track IDs
  and per-track de-duplication for counting.
- **Live webcam streaming** — annotated frames over MJPEG plus a snapshot endpoint,
  live FPS / latency / object-count metrics.
- **Video analysis** — chunked upload with extension/size validation, background
  processing at a configurable frame interval, annotated MP4 output that is
  downloadable.
- **Counting & line crossing** — unique-object counting and an optional virtual
  line with direction filtering.
- **Event logging & analytics** — detection events sampled to SQLite, class
  distribution, events-over-time, per-session performance and comparison charts.
- **Export** — CSV and JSON-friendly schemas; annotated video download.
- **Polished dark dashboard** — a token-driven "command center" theme
  (deep-space glass panels, cyan/violet accents) across Overview, Live Detection,
  Video Analysis, Analytics, History and Settings, with responsive tables, a
  keyboard skip link, themed confirmation dialogs and reduced-motion support.
- **Robust lifecycle** — background workers, graceful cancellation, resource
  cleanup on shutdown, bounded concurrency, no stack traces leaked to clients.

## Tech stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Detection  | Ultralytics YOLO, PyTorch, OpenCV, NumPy, `lap`                   |
| Backend    | Python 3.10, FastAPI, Uvicorn, Pydantic v2, `sqlite3`             |
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide        |
| Storage    | SQLite (WAL mode)                                                 |
| Testing    | pytest, httpx, FastAPI TestClient                                 |

## Project structure

```
OBJECT TRACKING SYSTEM/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (health, models, cameras, sessions,
│   │   │                   #   videos, events, analytics, settings, stream)
│   │   ├── core/           # detector, counting, annotations, video, storage, device
│   │   ├── database/       # sqlite schema + repository
│   │   ├── schemas/        # Pydantic request/response models
│   │   ├── services/       # runtime state, settings, events, analytics, processors
│   │   ├── workers/        # processing manager (background jobs)
│   │   ├── config.py       # bootstrap settings
│   │   ├── container.py    # composition root
│   │   └── main.py         # app entry point
│   ├── tests/              # pytest suite (+ tests/assets/bus.jpg)
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/     # cards, tables, charts, sliders, overlays
│   │   ├── pages/          # Overview, LiveDetection, VideoAnalysis, Analytics,
│   │   │                   #   History, Settings
│   │   ├── hooks/          # data-fetching / polling hooks
│   │   ├── services/       # typed API client
│   │   └── types/          # shared TypeScript types
│   ├── package.json
│   └── .env.example
├── models/                 # YOLO weights (downloaded, not committed)
├── data/
│   ├── uploads/            # uploaded source videos
│   └── outputs/            # annotated result videos + SQLite database
├── scripts/                # benchmark, sample-video generator, e2e smoke test
├── docs/
│   ├── API.md              # full HTTP API reference
│   ├── architecture.md     # design, data flow, concurrency, security
│   └── testing.md          # how to test + actual results & benchmark
├── docker-compose.yml
└── README.md
```

## Prerequisites

- **Windows 11** (macOS/Linux also work; the PowerShell paths below are Windows).
- **Python 3.10** (3.10.11 tested). Python 3.12+ may not have wheels for all pins.
- **Node.js 18+** and npm (Node 24 / npm 11 tested).
- No GPU required. CUDA is used automatically when available.

> **Important:** `numpy` must stay on the 1.x line (`1.26.2`) because
> `opencv-python` 4.8.x is built against the NumPy 1.x ABI. `requirements.txt`
> pins this for you.

## Setup (PowerShell)

Run all commands from the project root:

```powershell
cd "C:\Users\hp\Downloads\OBJECT TRACKING SYSTEM"
```

### 1. Backend virtual environment + dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

If PowerShell blocks activation, run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

For an **NVIDIA GPU** build of PyTorch instead of the CPU wheel:

```powershell
pip install torch==2.11.0 torchvision==0.26.0 --index-url https://download.pytorch.org/whl/cu121
```

### 2. Download the YOLO weights

The app refuses to load arbitrary models; only files listed by
`VISIONTRACK_APPROVED_MODELS` are accepted. Place the default weight in `models/`:

```powershell
cd ..
python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"
Move-Item -Force yolo11n.pt models\yolo11n.pt
```

(Any approved name — `yolo11n.pt`, `yolo11s.pt`, `yolov8n.pt`, `yolov8s.pt` — can
be placed in `models/`. Missing weights simply show as *not downloaded* in the UI.)

### 3. Frontend dependencies

```powershell
cd frontend
npm install
```

## Running

### Development (two terminals)

Terminal 1 — backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies API calls to
`http://127.0.0.1:8000` (configurable via `frontend/.env`, see `.env.example`).

### Production (single server)

Build the frontend; the backend then serves it from `frontend/dist`:

```powershell
cd frontend
npm run build
cd ..\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. Interactive API docs are at `/docs`.

## Using the dashboard

1. **Live Detection** — pick a camera, tune confidence / model / device / input
   size / capture resolution / classes, then *Start capture*. The annotated MJPEG
   stream, live metrics and current detections appear immediately. *Stop* ends the
   session.
2. **Video Analysis** — drag & drop a video, choose confidence / frame interval /
   tracking, then *Upload & process*. A progress bar tracks the background job;
   when it completes you can **download the annotated MP4** and inspect
   per-session performance and detections.
3. **Analytics** — class distribution, events over time (hour/day) and session
   comparison, all computed from stored data.
4. **History** — browse every session and detection event, filter by session /
   class / min confidence, and **export CSV**.
5. **Settings** — detection thresholds, model, tracker, input size (down to 192),
   camera capture resolution, frame interval, event sampling, line crossing and
   data retention / cleanup. Settings apply to new sessions.

## Accessibility & responsive design

The dashboard is usable with a keyboard and on small screens — the redesign is
presentational only and does not change any API call or poll cadence:

- **Skip link** — the first Tab stop moves focus to the main content region
  (implemented safely for `HashRouter`, without altering the route).
- **Keyboard & screen readers** — visible focus rings, labelled icon-only
  buttons, `role="status"` / `role="alert"` regions for save/error and backend
  state; high-frequency telemetry (FPS, latency) is deliberately not announced.
- **Confirmation dialogs** — destructive actions (delete session, reset settings,
  run cleanup) use a themed, accessible dialog with focus trapping,
  Escape-to-cancel and focus restored to the triggering control.
- **Reduced motion** — decorative animation (scanline sweep, status pulses)
  collapses under `prefers-reduced-motion`.
- **Responsive** — metric grids, page headers, filters, forms and charts reflow;
  wide tables scroll horizontally rather than hiding data or row actions.
- **Live video** — the annotated MJPEG view keeps its aspect ratio and the
  detection list scrolls, so both resize cleanly on narrow screens.

## API reference

Base URL: `http://127.0.0.1:8000/api`. Full details, schemas and examples are in
[`docs/API.md`](docs/API.md) and the OpenAPI UI at `/docs`. Design notes live in
[`docs/architecture.md`](docs/architecture.md); test/benchmark evidence in
[`docs/testing.md`](docs/testing.md).

| Method | Path                             | Purpose                                   |
| ------ | -------------------------------- | ----------------------------------------- |
| GET    | `/health`                        | Liveness + database + model status        |
| GET    | `/system/info`                   | Runtime, device and library versions      |
| GET    | `/models`                        | Approved models and availability          |
| GET    | `/models/classes`                | Class-id → name map for a model           |
| GET    | `/cameras`                       | Enumerate cameras (`?probe=true/false`)   |
| POST   | `/sessions`                      | Start a webcam or re-queue a video        |
| GET    | `/sessions`                      | List sessions (filter by status/type)     |
| GET    | `/sessions/{id}`                 | Session detail + progress                 |
| GET    | `/sessions/{id}/live`            | Live metrics + current detections         |
| POST   | `/sessions/{id}/stop`            | Gracefully stop a session                 |
| DELETE | `/sessions/{id}`                 | Delete session, events and files          |
| POST   | `/videos/upload`                 | Upload + queue a video (form overrides)   |
| GET    | `/videos/{id}/status`            | Processing progress                       |
| POST   | `/videos/{id}/process`           | Re-process an uploaded video              |
| GET    | `/videos/{id}/download`          | Download the annotated MP4                |
| GET    | `/stream/{id}`                   | Live annotated MJPEG stream               |
| GET    | `/stream/{id}/frame`             | Latest annotated JPEG frame               |
| GET    | `/events`                        | Query detection events (filters, paging)  |
| GET    | `/events/classes`                | Distinct class names seen                 |
| GET    | `/events/export`                 | Export events as CSV                      |
| GET    | `/analytics/summary`             | Aggregate totals                          |
| GET    | `/analytics/classes`             | Per-class statistics                      |
| GET    | `/analytics/timeseries`          | Events over time (`hour`/`day`)           |
| GET    | `/analytics/sessions`            | Session comparison                        |
| GET    | `/analytics/sessions/{id}/metrics` | Per-frame FPS/latency samples           |
| GET    | `/settings`                      | Current user settings                     |
| PUT    | `/settings`                      | Update settings (partial)                 |
| POST   | `/settings/reset`                | Reset to defaults                         |
| POST   | `/settings/cleanup`              | Apply data retention                      |

Example:

```powershell
# Upload and process a video
curl.exe -X POST "http://127.0.0.1:8000/api/videos/upload" `
  -F "file=@C:\videos\street.mp4" -F "imgsz=640" -F "confidence=0.25"

# Query events as CSV
curl.exe "http://127.0.0.1:8000/api/events/export?class_name=person" -o events.csv
```

## Testing

The backend test suite runs without a GPU or webcam. Computer-vision tests load
the real model and are marked `slow`.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1

# Fast tests (no model load)
pytest -m "not slow" -q

# Full suite (includes real YOLO inference + a generated video)
pytest -q
```

**Actual results on this machine (Windows 11, Python 3.10.11, CPU-only):**

```
$ pytest -q
.........................................................                [100%]

57 passed
```

- 53 fast tests: config/validation, detection parsing, bounding-box conversion,
  annotations, counting, line crossing, event sampling/persistence/export, session
  CRUD, analytics (incl. empty database), the full HTTP API, worker lifecycle,
  cancellation, busy-guard, runtime release, and graceful webcam-unavailable
  handling.
- 4 slow tests: full upload → inference → annotated-output pipeline on a real
  generated video; a blank-video "no objects detected" case; two consecutive
  tracking sessions resetting track IDs (regression for a real Ultralytics
  tracker-lifecycle crash); and a tracker-type change rebuilding the tracker.

Full test/benchmark evidence is in [`docs/testing.md`](docs/testing.md).

Frontend checks:

```powershell
cd frontend
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production bundle
```

All three pass (TypeScript strict mode, ESLint clean, Vite build succeeds).

End-to-end smoke test against a running server:

```powershell
# with the backend running on 127.0.0.1:8000
backend\.venv\Scripts\python.exe scripts\e2e_smoke.py
```

## Measured performance

Measured with `scripts/benchmark.py` on a real 1080×810 image with 5 visible
objects, **CPU only** (Intel Core i7-12xxx class, 10 threads), YOLO11n, one
inference at a time (the app's enforced concurrency):

| Input size | Detections | Avg latency | Median | Throughput | Warm-up (first call) |
| ---------- | ---------- | ----------- | ------ | ---------- | -------------------- |
| 320×320    | 5          | 181 ms      | 188 ms | ~5.5 FPS   | ~11.9 s (model load) |
| 480×480    | 4          | 358 ms      | 332 ms | ~2.8 FPS   | ~0.45 s              |
| 640×640    | 5          | 509 ms      | 481 ms | ~2.0 FPS   | ~0.84 s              |

The **192×192 and 256×256 sizes were added** precisely for CPU live use.
Measured on the same machine (later run, same harness):

| 192×192 | 4 | 28 ms  | 30 ms | ~35 FPS |
| 256×256 | 4 | 47 ms  | 45 ms | ~21 FPS |

Reproduce with:

```powershell
backend\.venv\Scripts\python.exe scripts\benchmark.py --runs 5 --imgsz 192,256,320,480,640
```

These are honest CPU numbers and vary with machine load (an earlier run measured
~626 ms at `imgsz=640`). **Inference latency is not the same as total pipeline
time** — a video job also decodes, annotates, JPEG-encodes and writes frames. For
real-time (≥ 15 FPS) use a CUDA GPU, a smaller `imgsz`, and/or a larger
`frame_interval`. On CPU, the fastest live settings are `imgsz=192/256` with
tracking off; a smaller **camera capture resolution** also cuts per-frame cost.
`frame_interval` now applies to the **webcam loop too** (inference runs every Nth
frame while the camera keeps draining), and the capture resolution is requested
from the driver (`camera_width`/`camera_height`, `0` = native). The webcam view
stays responsive at low FPS because annotation and streaming are decoupled from
the inference loop via a bounded frame buffer. Full measurements are in
[`docs/testing.md`](docs/testing.md).

## Security

- **Uploads** are validated by extension (`mp4/avi/mov/mkv/webm`) and size
  (`VISIONTRACK_MAX_UPLOAD_MB`, default 500 MB), written with a server-generated
  random filename — client names are never used on disk.
- **No path traversal**: downloads and deletions are confined to the data
  directory; any path outside it is rejected.
- **No arbitrary loading**: only model names on the approved list, and only a
  fixed set of trackers, are accepted. There is no URL/file/model fetch endpoint.
- **CORS** is restricted to the configured local frontend origins.
- **No stack traces** reach clients: unhandled exceptions return a generic 500
  message and are logged server-side.
- **Secrets and artefacts** (weights, videos, database, `.venv`, `node_modules`)
  are git-ignored.

## Configuration

Copy `backend/.env.example` to `backend/.env` to override defaults. Key settings:

| Variable                                | Default                              |
| --------------------------------------- | ------------------------------------ |
| `VISIONTRACK_DATA_DIR`                  | `data`                               |
| `VISIONTRACK_MODELS_DIR`                | `models`                             |
| `VISIONTRACK_DEFAULT_MODEL`             | `yolo11n.pt`                         |
| `VISIONTRACK_MAX_UPLOAD_MB`             | `500`                                |
| `VISIONTRACK_ALLOWED_VIDEO_EXTENSIONS`  | `mp4,avi,mov,mkv,webm`               |
| `VISIONTRACK_CORS_ORIGINS`              | `http://localhost:5173,http://127.0.0.1:5173` |
| `VISIONTRACK_MAX_CONCURRENT_JOBS`       | `1`                                  |

Most detection and event settings are also editable at runtime from the Settings
page and persist in the database.

## Docker (optional)

A CPU-oriented compose file is provided for the backend + built frontend:

```powershell
docker compose up --build
# open http://localhost:8000
```

> Webcam capture is not available inside the container; use video upload there.

## Limitations

- CPU inference is the default on machines without an NVIDIA GPU, so throughput is
  a few FPS at `imgsz=640` (see the table above). Use a GPU for real-time video.
- Only one inference runs at a time (`max_concurrent_jobs=1`) to keep CPU
  latency predictable; a second session is rejected with HTTP 409 while one is busy.
- Event rows are **sampled** (`event_sample_interval`, default every 30 frames)
  to keep the database small; enable *log all detections* if you need every frame.
- Camera enumeration opens each device briefly, which can be slow on some drivers.
- ByteTrack IDs reset per session; track IDs are not stable across sessions.
- Annotated output is written as MP4 (`mp4v`); unusual codecs may be unsupported.

## Troubleshooting

| Symptom                                             | Fix                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `numpy.core.multiarray failed to import`            | NumPy drifted to 2.x. Run `pip install numpy==1.26.2`.                                        |
| `ImportError: No module named app`                  | Run `uvicorn` from the `backend/` directory (or add it to `PYTHONPATH`).                      |
| Frontend shows "Backend offline"                    | Ensure the backend is running on `127.0.0.1:8000`; check the CORS origin list.               |
| Camera list is empty                                | Allow camera access for the terminal/Python in Windows Privacy settings; use `?probe=true`.  |
| Model shows "(not downloaded)"                      | Place the `.pt` file in `models/` (see setup step 2).                                         |
| First inference is slow                             | The first call loads the model/framework; subsequent frames use steady-state latency.        |
| `Activate.ps1` cannot be loaded                     | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.                                       |

## Data & privacy

All processing is local. Uploaded videos, annotated outputs and the SQLite
database live under `data/` and are never uploaded anywhere. Delete a session from
the UI (or use *Run cleanup* in Settings) to remove its files and events.

## License

Provided as-is for educational and internal use. Third-party components
(Ultralytics YOLO, PyTorch, OpenCV, React) retain their own licenses — review them
before commercial use.
