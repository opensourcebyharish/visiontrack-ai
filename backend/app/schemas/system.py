"""System / health schemas."""

from __future__ import annotations

from typing import Any, List

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    database: str
    model_loaded: bool
    uptime_s: float


class ModelInfo(BaseModel):
    name: str
    path: str
    available: bool
    is_default: bool


class CameraInfo(BaseModel):
    index: int
    name: str
    available: bool
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    backend: str | None = None


class SystemInfo(BaseModel):
    app: str
    version: str
    python_version: str
    platform: str
    processor: str
    cpu_count: int | None
    device: str
    cuda_available: bool
    cuda_device_name: str | None = None
    torch_version: str
    opencv_version: str
    ultralytics_version: str
    default_model: str
    data_dir: str
    max_concurrent_jobs: int
    active_sessions: int
    details: dict[str, Any] = {}
