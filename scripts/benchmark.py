"""Measure real CPU/GPU inference latency for VisionTrack AI.

Usage (from the project root, using the backend virtual environment):

    backend\\.venv\\Scripts\\python.exe scripts\\benchmark.py
    backend\\.venv\\Scripts\\python.exe scripts\\benchmark.py --image backend\\tests\\assets\\bus.jpg --runs 8

The script loads the same ``Detector`` the application uses, so the numbers
reflect the real pipeline (Ultralytics YOLO + the process-wide inference lock).
It exits with ``os._exit`` because the Ultralytics/Torch runtime can keep
non-daemon threads alive after inference.
"""

from __future__ import annotations

import argparse
import os
import statistics
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import cv2  # noqa: E402

from app.core.detector import Detector, ModelRegistry  # noqa: E402
from app.core.device import resolve_device  # noqa: E402
from app.schemas.settings_models import UserSettings  # noqa: E402


def benchmark(image_path: Path, model: str, device: str, sizes: list[int], runs: int) -> None:
    frame = cv2.imread(str(image_path))
    if frame is None:
        print(f"ERROR: could not read image {image_path}")
        os._exit(1)

    registry = ModelRegistry(PROJECT_ROOT / "models")
    detector = Detector(registry)

    print(f"Image      : {image_path.name} ({frame.shape[1]}x{frame.shape[0]})")
    print(f"Model      : {model}")
    print(f"Device     : {resolve_device(device)}")
    print(f"Runs/size  : {runs}")
    print("-" * 72)

    for size in sizes:
        settings = UserSettings(model=model, device=device, imgsz=size, confidence=0.25)
        # Warm-up (first call includes model load + CUDA/OpenMP init).
        warm = time.perf_counter()
        detections, infer_ms, _ = detector.run(frame, settings, tracking=False)
        warm_ms = (time.perf_counter() - warm) * 1000.0

        samples = []
        for _ in range(runs):
            _dets, ms, _names = detector.run(frame, settings, tracking=False)
            samples.append(ms)

        # Tracking pass (ByteTrack) for one frame to show tracking overhead.
        _dets, track_ms, _ = detector.run(frame, settings, tracking=True)

        print(
            f"imgsz={size:<5} detections={len(detections):<3} "
            f"avg={statistics.mean(samples):7.1f} ms  "
            f"median={statistics.median(samples):7.1f} ms  "
            f"min={min(samples):7.1f} ms  "
            f"fps={1000.0 / statistics.mean(samples):5.1f}  "
            f"track={track_ms:7.1f} ms  (warmup={warm_ms:.0f} ms)"
        )

    print("-" * 72)
    print("Warm-up includes one-time model loading; steady-state is avg/median.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark YOLO inference latency.")
    parser.add_argument(
        "--image",
        type=Path,
        default=BACKEND_DIR / "tests" / "assets" / "bus.jpg",
    )
    parser.add_argument("--model", default="yolo11n.pt")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--imgsz", default="320,480,640", help="comma-separated sizes")
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()

    sizes = [int(value) for value in args.imgsz.split(",") if value.strip()]
    benchmark(args.image, args.model, args.device, sizes, args.runs)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
