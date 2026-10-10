"""Health and system information endpoints."""

from __future__ import annotations

import platform
import time
from typing import Optional

import cv2
import torch
from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.config import Settings
from app.container import AppContainer
from app.core.device import cuda_available, resolve_device
from app.schemas.system import HealthResponse, SystemInfo

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(container: AppContainer = Depends(get_container)) -> HealthResponse:
    try:
        container.db.query_one("SELECT 1 AS ok")
        database = "ok"
    except Exception:  # pragma: no cover - defensive
        database = "error"
    return HealthResponse(
        status="ok" if database == "ok" else "degraded",
        app=container.settings.app_name,
        version=container.settings.app_version,
        database=database,
        model_loaded=container.model_registry.any_loaded(),
        uptime_s=round(time.time() - container.started_at, 2),
    )


@router.get("/system/info", response_model=SystemInfo)
def system_info(container: AppContainer = Depends(get_container)) -> SystemInfo:
    settings: Settings = container.settings
    device = resolve_device("auto")
    try:
        import ultralytics

        ultralytics_version = ultralytics.__version__
    except Exception:  # pragma: no cover
        ultralytics_version = "unknown"

    return SystemInfo(
        app=settings.app_name,
        version=settings.app_version,
        python_version=platform.python_version(),
        platform=f"{platform.system()} {platform.release()}",
        processor=platform.processor() or platform.machine(),
        cpu_count=torch.get_num_threads() if hasattr(torch, "get_num_threads") else None,
        device=device,
        cuda_available=cuda_available(),
        cuda_device_name=(
            torch.cuda.get_device_name(0) if cuda_available() else None
        ),
        torch_version=torch.__version__,
        opencv_version=cv2.__version__,
        ultralytics_version=ultralytics_version,
        default_model=settings.default_model,
        data_dir=str(settings.data_dir),
        max_concurrent_jobs=settings.max_concurrent_jobs,
        active_sessions=container.processing_manager.active_session_ids().__len__(),
        details={
            "inference_note": "CUDA is used only when a CUDA device is available.",
            "loaded_models": container.model_registry.loaded(),
            "db_bytes": container.analytics_service.database_size_bytes(),
        },
    )
