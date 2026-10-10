# VisionTrack AI — Testing

Everything here was executed on the development machine described below. The
numbers are real outputs, not projections. Re-run the commands to reproduce.

- **OS:** Windows 11 (reported by Python as `Windows 10`)
- **CPU:** Intel64 Family 6 Model 154 (10 threads), **no NVIDIA GPU**
- **Python:** 3.10.11 in `backend/.venv`
- **Node:** 24 (npm 11)
- **PyTorch:** 2.11.0+cpu · **OpenCV:** 4.8.1 · **Ultralytics:** 8.4.49

## 1. Backend test suite

Run from the `backend/` directory:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1      # optional
.\.venv\Scripts\python.exe -m pytest
```

Fast subset (skips tests that load the real model / decode video):

```powershell
.\.venv\Scripts\python.exe -m pytest -m "not slow"
```

### Actual result

```
$ .\.venv\Scripts\python.exe -m pytest
..................................................................       [100%]
66 passed in 64.40s
```

A line such as `[mov,mp4,...] moov atom not found` may appear on stderr during
the run: that is ffmpeg printing as it deliberately rejects a corrupt video in
the "invalid upload" path. It is not a failure.

### Test inventory (66 tests)

| File                    | Tests | Covers                                                       |
| ----------------------- | ----: | ------------------------------------------------------------ |
| `test_analytics.py`     |     3 | summaries, class stats, timeseries, session comparison, empty DB |
| `test_api.py`           |    24 | full HTTP surface: health, system, models, cameras, sessions, settings (incl. small `imgsz` + camera capture resolution), events, analytics, live metrics, 404/409/422 paths |
| `test_camera_worker.py` |     4 | webcam loop without a device: `frame_interval` skips inference while still draining frames; capture resolution requested from the driver (`0` = native) |
| `test_config.py`        |     7 | bootstrap settings, env CSV parsing, validation (small input sizes + camera resolution) |
| `test_counting.py`      |     6 | `UniqueCounter`, `LineCounter`, direction + per-track dedup    |
| `test_detection.py`     |     6 | `Detection` geometry/serialisation, box conversion, model registry |
| `test_events.py`        |     5 | event sampling, persistence, filtering, CSV export             |
| `test_sessions.py`      |     2 | session create/get/update and serialisation                    |
| `test_video_pipeline.py`|     4 | **slow** real video: upload → YOLO inference → annotated output → reopen; blank video yields 0 objects; consecutive tracking sessions reset IDs; tracker-type change rebuilds the tracker |
| `test_worker_errors.py` |     5 | fake detector lifecycle, busy guard (409), cancellation, webcam-unavailable, runtime released after the job |

The four `test_video_pipeline.py` tests are marked `slow` and use the real
`yolo11n.pt` model and a real generated MP4 — no mocks in the CV path.

### Regression coverage added

- `test_consecutive_tracking_sessions_reset_track_ids` — a second tracking
  session in the same process used to crash with `IndexError: list index out of
  range` because the per-session reset emptied `predictor.trackers`. It now
  asserts two consecutive sessions both track and that IDs restart at 1.
- `test_tracker_type_change_is_rebuilt` — switching the `tracker` setting from
  ByteTrack to BoT-SORT must actually change the instantiated tracker.
- `test_worker_errors.py` asserts `manager.get_runtime(id) is None` after a job
  ends, so completed/cancelled sessions release their in-memory runtime.
- `test_camera_worker.py` drives the webcam loop with a fake `cv2.VideoCapture`
  (no device, no torch) to pin two behaviours: `frame_interval=N` runs inference
  on only every Nth frame while still reading the others, and `camera_width` /
  `camera_height` are pushed to the driver with `CAP_PROP_FRAME_WIDTH/HEIGHT`
  (left native when `0`).

## 2. Frontend checks

From `frontend/`:

```powershell
npm run typecheck   # tsc --noEmit  (TypeScript strict)
npm run lint        # eslint
npm run build       # production bundle
```

### Actual result

```
$ npm run typecheck     -> exit 0
$ npm run lint          -> exit 0 (no warnings)
$ npm run build         -> exit 0
   dist/index.html                0.51 kB
   dist/assets/index-*.css       18.34 kB │ gzip:  4.22 kB
   dist/assets/index-*.js       649.74 kB │ gzip: 183.57 kB
   built in ~11s
```

Vite prints a "chunks larger than 500 kB" advisory. It is a bundling hint
(largely Recharts), not an error.

## 3. End-to-end smoke test

Start the backend, then run the smoke script against the live server:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# in another terminal:
backend\.venv\Scripts\python.exe scripts\e2e_smoke.py
```

### Actual result (against the running server)

```
[PASS] health — db=ok
[PASS] system/info — device=cpu cuda=False
[PASS] models listing — 4 model(s)
[PASS] settings
[PASS] frontend served — status=200
       sample video: 89258 bytes
[PASS] upload accepted — status=201
       video_id=... frames=16
[PASS] processing completed — status=completed
[PASS] frames processed — 16 frames
[PASS] objects tracked — 8 unique
[PASS] events stored — 6 events
[PASS] events query — 6 rows
[PASS] event fields
[PASS] annotated download — 306009 bytes
[PASS] output readable — (240, 320, 3)
[PASS] analytics — 6 detections
[PASS] csv export

All end-to-end checks passed.
```

This validates: real upload, real YOLO inference, tracking, event persistence,
analytics from stored data, CSV export, annotated-video generation, and
reopening the produced MP4 with OpenCV.

### Extended live checks

`scripts/e2e_extra.py` runs a **second** tracking session in the same server
process (the scenario that used to crash) plus error paths and cancellation:

```powershell
# backend must be running; run the smoke test first, then:
backend\.venv\Scripts\python.exe scripts\e2e_extra.py
```

Actual result:

```
[PASS] unknown session -> 404 -- 404
[PASS] unknown session live -> 404 -- 404
[PASS] unsupported upload -> 400 -- 400
[PASS] invalid settings -> 422 -- 422
[PASS] unapproved model -> 400 -- 400
[PASS] long upload accepted -- 201
[PASS] live reports running -- status=running
[PASS] live reports fps+latency -- fps=8.27 ms=111.06
[PASS] live reports detections w/ track ids -- n=4
[PASS] stop accepted -- 200
[PASS] cancellation honoured -- status=cancelled
[PASS] partial frames processed -- 4 frames
[PASS] live after stop -> 409 (runtime released)
[PASS] events persisted -- 4 rows
[PASS] track ids persisted -- 4 distinct tracks
[PASS] filter by track_id
[PASS] session history lists sessions -- 2 sessions
[PASS] analytics summary has data -- 10 detections, 2 sessions
[PASS] analytics classes non-empty -- 2 classes
[PASS] analytics timeseries (JSON) -- 1 buckets
[PASS] analytics session comparison (JSON) -- 2 rows
[PASS] delete session -- 200
[PASS] deleted session gone

All extra verification checks passed.
```

This confirms live FPS/latency/detections, real track IDs, graceful
cancellation with partial progress, SQLite persistence, filterable events,
JSON analytics from stored data, that a finished session releases its runtime
(`/live` returns 409), and correct session deletion.

## 4. Performance benchmark

`scripts/benchmark.py` drives the **same `Detector`** the app uses, on a real
810×1080 image (`backend/tests/assets/bus.jpg`) containing 5 visible objects,
with the app's single-inference-at-a-time behaviour.

```powershell
backend\.venv\Scripts\python.exe scripts\benchmark.py --runs 5 --imgsz 320,480,640
```

### Actual result (CPU only)

| imgsz | detections | avg latency | median | min | throughput | tracking pass | warm-up (first call) |
| ----: | ---------: | ----------: | -----: | --: | ---------: | ------------: | --------------------: |
| 320   | 5          | 181 ms      | 188 ms | 156 ms | 5.5 FPS | 1014 ms | ~11.9 s (model load) |
| 480   | 4          | 358 ms      | 332 ms | 323 ms | 2.8 FPS | 329 ms  | ~0.45 s |
| 640   | 5          | 509 ms      | 481 ms | 437 ms | 2.0 FPS | 465 ms  | ~0.84 s |

Notes for honesty:

- The large first-call warm-up is one-time model/framework loading. Steady-state
  is the avg/median columns.
- The `tracking pass` column is a single frame with ByteTrack enabled; the first
  tracking call is dominated by tracker warm-up (e.g. the 1014 ms at 320).
- Numbers vary run-to-run with machine load (an earlier run measured ~626 ms at
  `imgsz=640`). Do not treat a single run as a hard constant.
- **Inference latency ≠ total pipeline time.** A video job's total wall time also
  includes frame decoding, annotation drawing, JPEG encoding, event sampling and
  MP4 writing. At `imgsz=320` the e2e run processed a 16-frame clip in a few
  seconds end-to-end while per-frame inference was ~181 ms.

## 5. Live webcam

The webcam path is implemented (`POST /api/sessions` with `source_type=webcam`,
`GET /api/stream/{id}` MJPEG, snapshot endpoint) and its lifecycle/error
behaviour is covered by `test_worker_errors.py` (busy guard, cancellation,
camera unavailable). The development machine used for these results had **no
compatible `/dev` camera available to the agent**, so live-camera capture was not
exercised end-to-end here; it requires a physical camera reachable from the OS.

## 6. Re-running everything

```powershell
# backend
cd backend; .\.venv\Scripts\python.exe -m pytest

# frontend
cd ..\frontend; npm run typecheck; npm run lint; npm run build

# benchmark
cd ..; backend\.venv\Scripts\python.exe scripts\benchmark.py

# e2e (backend must be running)
backend\.venv\Scripts\python.exe scripts\e2e_smoke.py
backend\.venv\Scripts\python.exe scripts\e2e_extra.py
```
