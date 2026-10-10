"""Live annotated frame streaming (MJPEG + single-frame snapshot)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse

from app.api.deps import get_container
from app.container import AppContainer

router = APIRouter(tags=["stream"])

_BOUNDARY = "frame"


def _mjpeg_generator(container: AppContainer, session_id: str):
    boundary = f"--{_BOUNDARY}\r\n".encode()
    last_version = -1
    idle_ticks = 0
    while True:
        runtime = container.processing_manager.get_runtime(session_id)
        if runtime is None:
            break
        frame, last_version = container.processing_manager.get_frame(session_id, last_version)
        if frame is None:
            idle_ticks += 1
            if runtime.metrics.status not in ("running", "queued") or idle_ticks > 60:
                break
            continue
        idle_ticks = 0
        yield (
            boundary
            + b"Content-Type: image/jpeg\r\n"
            + f"Content-Length: {len(frame)}\r\n\r\n".encode()
            + frame
            + b"\r\n"
        )
        if runtime.metrics.status not in ("running", "queued"):
            # Emit the final frame, then finish the stream.
            break


@router.get("/stream/{session_id}")
def stream_frames(session_id: str, container: AppContainer = Depends(get_container)):
    row = container.session_service.get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    if container.processing_manager.get_runtime(session_id) is None:
        raise HTTPException(status_code=409, detail="Session is not active; no live stream available.")
    return StreamingResponse(
        _mjpeg_generator(container, session_id),
        media_type=f"multipart/x-mixed-replace; boundary={_BOUNDARY}",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.get("/stream/{session_id}/frame")
def latest_frame(session_id: str, container: AppContainer = Depends(get_container)):
    row = container.session_service.get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    frame = container.processing_manager.latest_frame(session_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="No frame available yet.")
    return Response(content=frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
