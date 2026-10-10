"""Session endpoints: create (webcam/video), list, inspect, stop, delete."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_container
from app.container import AppContainer
from app.core.storage import safe_delete
from app.schemas.sessions import SessionCreate, SessionListResponse, SessionResponse
from app.services.session_service import serialize_session
from app.workers.processing_manager import DeviceBusyError, SessionNotFoundError

router = APIRouter(tags=["sessions"])


def _serialize(container: AppContainer, row: dict) -> SessionResponse:
    runtime = container.processing_manager.get_runtime(row["id"])
    return serialize_session(row, runtime)


@router.post("/sessions", response_model=SessionResponse, status_code=201)
def create_session(
    payload: SessionCreate, container: AppContainer = Depends(get_container)
) -> SessionResponse:
    base = container.settings_service.get()
    config = payload.config or base

    if payload.source_type == "webcam":
        name = payload.name or f"Webcam {payload.camera_index}"
        session = container.session_service.create(
            name=name, source_type="webcam", config=config, status="created"
        )
        try:
            container.processing_manager.start_webcam(session["id"], payload.camera_index, config)
        except DeviceBusyError as exc:
            container.session_service.update(
                session["id"], status="failed", error=str(exc), message=str(exc)
            )
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        row = container.session_service.get(session["id"])
        return _serialize(container, row)

    # source_type == "video": (re)process an existing upload
    if not payload.video_id:
        raise HTTPException(status_code=400, detail="video_id is required for video sessions.")
    row = container.session_service.get(payload.video_id)
    if not row or row["source_type"] != "video":
        raise HTTPException(status_code=404, detail="Uploaded video not found.")
    if row["status"] in ("running", "queued"):
        raise HTTPException(status_code=409, detail="Video is already being processed.")
    input_path = row.get("input_path")
    if not input_path or not Path(input_path).exists():
        raise HTTPException(status_code=400, detail="Source video file is missing.")

    output_path = str(container.settings.outputs_dir / f"{row['id']}.mp4")
    container.session_service.update(row["id"], status="created", error=None, message=None)
    container.processing_manager.queue_video(row["id"], input_path, output_path, config)
    row = container.session_service.get(row["id"])
    return _serialize(container, row)


@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    container: AppContainer = Depends(get_container),
) -> SessionListResponse:
    rows, total = container.session_service.list(
        limit=limit, offset=offset, status=status, source_type=source_type
    )
    return SessionListResponse(
        items=[_serialize(container, row) for row in rows], total=total
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(session_id: str, container: AppContainer = Depends(get_container)) -> SessionResponse:
    row = container.session_service.get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    return _serialize(container, row)


@router.get("/sessions/{session_id}/live")
def live_metrics(session_id: str, container: AppContainer = Depends(get_container)) -> dict:
    if not container.session_service.get(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    runtime = container.processing_manager.get_runtime(session_id)
    if runtime is None:
        raise HTTPException(status_code=409, detail="Session has no active runtime.")
    return runtime.metrics.as_dict()


@router.post("/sessions/{session_id}/stop", response_model=SessionResponse)
def stop_session(session_id: str, container: AppContainer = Depends(get_container)) -> SessionResponse:
    row = container.session_service.get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    try:
        container.processing_manager.stop(session_id)
    except SessionNotFoundError:
        # Already finished — report the current state.
        if row["status"] in ("running", "queued"):
            container.session_service.update(
                session_id, status="cancelled", message="Stopped"
            )
    row = container.session_service.get(session_id)
    return _serialize(container, row)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, container: AppContainer = Depends(get_container)) -> dict:
    row = container.session_service.get(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    try:
        container.processing_manager.delete(session_id)
    except DeviceBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # Remove associated files (only if they live inside the data directory).
    for key in ("input_path", "output_path"):
        path = row.get(key)
        if path and Path(path).resolve().is_relative_to(container.settings.data_dir.resolve()):
            safe_delete(path)
    container.session_service.delete(session_id)
    return {"deleted": True, "session_id": session_id}
