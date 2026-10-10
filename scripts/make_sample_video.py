"""Create a small, real sample video from a COCO-style image.

Used by the computer-vision tests so that YOLO produces genuine detections
without requiring a downloaded video or a webcam.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2


def make_sample_video(
    image_path: Path,
    output_path: Path,
    frames: int = 24,
    width: int = 320,
    height: int = 240,
    fps: int = 8,
) -> Path:
    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Could not read source image: {image_path}")

    # Letterbox to a wider canvas so we can pan horizontally.
    canvas_width = width + 80
    base = cv2.resize(image, (canvas_width, height))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        float(fps),
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError("Could not open the video writer (codec unavailable).")

    max_shift = max(0, canvas_width - width)
    try:
        for index in range(frames):
            shift = int(max_shift * (index / max(frames - 1, 1)))
            frame = base[:, shift : shift + width]
            if frame.shape[1] != width or frame.shape[0] != height:
                frame = cv2.resize(frame, (width, height))
            writer.write(frame)
    finally:
        writer.release()
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a sample video for tests.")
    parser.add_argument("image", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frames", type=int, default=24)
    args = parser.parse_args()
    path = make_sample_video(args.image, args.output, frames=args.frames)
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
