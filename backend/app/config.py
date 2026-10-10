"""Application bootstrap configuration.

Bootstrap (non user-editable) settings are read from environment variables
(prefixed ``VISIONTRACK_``) and/or a ``.env`` file.  User-editable runtime
settings live in :mod:`app.schemas.settings_models` and are persisted in SQLite
by :mod:`app.services.settings_service`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/app/config.py -> app -> backend -> project root
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Bootstrap settings owned by the deployment environment."""

    model_config = SettingsConfigDict(
        env_prefix="VISIONTRACK_",
        env_file=str(PROJECT_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VisionTrack AI"
    app_version: str = "1.0.0"
    environment: str = "development"

    host: str = "127.0.0.1"
    port: int = 8000

    # Filesystem (never exposed directly through the API).
    data_dir: Path = Field(default=PROJECT_ROOT / "data")
    models_dir: Path = Field(default=PROJECT_ROOT / "models")

    # Limits / security.
    max_upload_mb: int = 500
    allowed_video_extensions: Annotated[List[str], NoDecode] = ["mp4", "avi", "mov", "mkv", "webm"]
    cors_origins: Annotated[List[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Model defaults.
    default_model: str = "yolo11n.pt"
    approved_models: Annotated[List[str], NoDecode] = [
        "yolo11n.pt",
        "yolo11s.pt",
        "yolov8n.pt",
        "yolov8s.pt",
    ]

    # Processing.
    max_concurrent_jobs: int = 1
    stream_fps: int = 20

    @field_validator("allowed_video_extensions", "cors_origins", "approved_models", mode="before")
    @classmethod
    def _split_csv(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def outputs_dir(self) -> Path:
        return self.data_dir / "outputs"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "visiontrack.db"

    def ensure_directories(self) -> None:
        for path in (self.data_dir, self.uploads_dir, self.outputs_dir, self.models_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
