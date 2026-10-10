"""Pydantic schemas for VisionTrack AI."""

from app.schemas.settings_models import (
    APPROVED_MODELS,
    DEVICE_CHOICES,
    IMG_SIZES,
    UserSettings,
    UserSettingsUpdate,
)
from app.schemas.system import (
    CameraInfo,
    HealthResponse,
    ModelInfo,
    SystemInfo,
)
from app.schemas.sessions import SessionCreate, SessionResponse
from app.schemas.events import EventFilter, EventResponse
from app.schemas.analytics import (
    AnalyticsSummary,
    ClassStatistic,
    SessionComparison,
    TimeSeriesPoint,
)
from app.schemas.videos import UploadResponse, VideoStatusResponse

__all__ = [
    "APPROVED_MODELS",
    "DEVICE_CHOICES",
    "IMG_SIZES",
    "UserSettings",
    "UserSettingsUpdate",
    "CameraInfo",
    "HealthResponse",
    "ModelInfo",
    "SystemInfo",
    "SessionCreate",
    "SessionResponse",
    "EventFilter",
    "EventResponse",
    "AnalyticsSummary",
    "ClassStatistic",
    "SessionComparison",
    "TimeSeriesPoint",
    "UploadResponse",
    "VideoStatusResponse",
]
