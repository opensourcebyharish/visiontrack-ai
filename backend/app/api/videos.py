"""Video upload, status, download and reprocessing endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_container
from app.api.sessions import _serialize
from app.container import AppContainer
from app.core.storage import generate_stored_name, safe_delete
from app.core.video import probe_video
from app.schemas.settings_models import UserSettingsUpdate
from app.schemas.videos import UploadResponse, VideoStatusResponse

router = APIRouter(tags=["videos"])

_CHUNK = 1024 * 1024  # 1 MiB


@router.post("/videos/upload", response_model=UploadResponse, status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    confidence: Optional[float] = Form(None),
    imgsz: Optional[int] = Form(None),
    model: Optional[str] = Form(None),
    device: Optional[str] = Form(None),
    tracking_enabled: Optional[bool] = Form(None),
    frame_interval: Optional[int] = Form(None),
    container: AppContainer = Depends(get_container),
) -> UploadResponse:
    settings = container.settings

    filename = file.filename or "upload"
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension not in settings.allowed_video_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format '.{extension}'. Allowed: {', '.join(settings.allowed_video_extensions)}.",
        )

    base = container.settings_service.get()
    patch = UserSettingsUpdate(
        confidence=confidence,
        imgsz=imgsz,
        model=model,
        device=device,
        tracking_enabled=tracking_enabled,
        frame_interval=frame_interval,
    )
    try:
        config = patch.merged_into(base)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid configuration: {exc}") from exc

    max_bytes = min(config.max_upload_mb, settings.max_upload_mb) * 1024 * 1024
    stored_name = generate_stored_name(extension)
    stored_path = settings.uploads_dir / stored_name

    size = 0
    try:
        with open(stored_path, "wb") as handle:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    handle.close()
                    safe_delete(stored_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the maximum upload size of {min(config.max_upload_mb, settings.max_upload_mb)} MB.",
                    )
                handle.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        safe_delete(stored_path)
        raise HTTPException(status_code=500, detail="Failed to store the uploaded file.") from exc
    finally:
        await file.close()

    if size == 0:
        safe_delete(stored_path)
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    metadata = probe_video(stored_path)
    if not metadata:
        safe_delete(stored_path)
        raise HTTPException(
            status_code=400,
            detail="The file could not be read as a video (it may be corrupt or use an unsupported codec).",
        )

    session_name = name or Path(filename).stem or "Uploaded video"
    session = container.session_service.create(
        name=session_name[:120],
        source_type="video",
        config=config,
        input_path=str(stored_path),
        source_meta={"original_filename": filename, **metadata},
        status="created",
        total_frames=int(metadata.get("frame_count") or 0),
    )

    output_path = str(settings.outputs_dir / f"{session['id']}.mp4")
    container.processing_manager.queue_video(session["id"], str(stored_path), output_path, config)

    row = container.session_service.get(session["id"])
    return UploadResponse(
        video_id=session["id"],
        session=_serialize(container, row),
        filename=filename,
        size_bytes=size,
        metadata=metadata,
    )


@router.get("/videos/{video_id}/status", response_model=VideoStatusResponse)
def video_status(video_id: str, container: AppContainer = Depends(get_container)) -> VideoStatusResponse:
    row = container.session_service.get(video_id)
    if not row or row["source_type"] != "video":
        raise HTTPException(status_code=404, detail="Video not found.")
    session = _serialize(container, row)
    return VideoStatusResponse(
        session=session,
        progress=session.progress,
        output_available=session.output_available,
        download_url=session.download_url,
    )


@router.post("/videos/{video_id}/process", response_model=VideoStatusResponse)
def reprocess_video(
    video_id: str, container: AppContainer = Depends(get_container)
) -> VideoStatusResponse:
    row = container.session_service.get(video_id)
    if not row or row["source_type"] != "video":
        raise HTTPException(status_code=404, detail="Video not found.")
    if row["status"] in ("running", "queued"):
        raise HTTPException(status_code=409, detail="Video is already being processed.")
    input_path = row.get("input_path")
    if not input_path or not Path(input_path).exists():
        raise HTTPException(status_code=400, detail="Source video file is missing.")

    config = container.settings_service.get()
    output_path = str(container.settings.outputs_dir / f"{row['id']}.mp4")
    container.session_service.update(video_id, status="created", error=None, message=None)
    container.processing_manager.queue_video(video_id, input_path, output_path, config)
    row = container.session_service.get(video_id)
    session = _serialize(container, row)
    return VideoStatusResponse(
        session=session,
        progress=session.progress,
        output_available=session.output_available,
        download_url=session.download_url,
    )


@router.get("/videos/{video_id}/download")
def download_video(video_id: str, container: AppContainer = Depends(get_container)) -> FileResponse:
    row = container.session_service.get(video_id)
    if not row or row["source_type"] != "video":
        raise HTTPException(status_code=404, detail="Video not found.")
    output_path = row.get("output_path")
    if not output_path or not Path(output_path).exists():
        raise HTTPException(status_code=404, detail="Annotated video is not available yet.")

    settings = container.settings
    if not Path(output_path).resolve().is_relative_to(settings.data_dir.resolve()):
        raise HTTPException(status_code=403, detail="Refusing to serve file outside the data directory.")

    safe_name = "".join(c for c in row["name"] if c.isalnum() or c in " -_").strip() or "visiontrack"
    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=f"{safe_name}-annotated.mp4",
    )
