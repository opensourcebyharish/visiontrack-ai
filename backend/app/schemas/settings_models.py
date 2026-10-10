"""User-editable runtime settings (persisted in SQLite)."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

APPROVED_MODELS: List[str] = ["yolo11n.pt", "yolo11s.pt", "yolov8n.pt", "yolov8s.pt"]
# Multiples of 32 (the YOLO stride). Smaller sizes trade accuracy for speed.
IMG_SIZES: List[int] = [192, 256, 320, 416, 480, 640, 800, 960, 1280]
DEVICE_CHOICES: List[str] = ["auto", "cpu", "cuda"]
APPROVED_TRACKERS: List[str] = ["bytetrack.yaml", "botsort.yaml"]


class UserSettings(BaseModel):
    """Effective, validated runtime configuration."""

    model_config = ConfigDict(extra="forbid")

    confidence: float = Field(0.25, ge=0.0, le=1.0)
    iou: float = Field(0.5, ge=0.0, le=1.0)
    imgsz: int = 640
    model: str = "yolo11n.pt"
    classes: Optional[List[int]] = None
    tracking_enabled: bool = True
    device: Literal["auto", "cpu", "cuda"] = "auto"
    tracker: str = "bytetrack.yaml"

    frame_interval: int = Field(1, ge=1, le=30)
    max_upload_mb: int = Field(500, ge=1, le=4096)

    event_logging_enabled: bool = True
    log_all_detections: bool = False
    event_sample_interval: int = Field(30, ge=1, le=600)
    min_event_confidence: float = Field(0.0, ge=0.0, le=1.0)

    jpeg_quality: int = Field(80, ge=20, le=100)
    stream_fps: int = Field(20, ge=1, le=60)

    default_camera_index: int = Field(0, ge=0, le=16)
    # 0 means "leave the camera at its native resolution".
    camera_width: int = Field(0, ge=0, le=3840)
    camera_height: int = Field(0, ge=0, le=2160)
    data_retention_days: int = Field(0, ge=0, le=3650)

    line_crossing_enabled: bool = False
    line_orientation: Literal["horizontal", "vertical"] = "vertical"
    line_position: float = Field(0.5, ge=0.0, le=1.0)
    line_direction: Literal["both", "positive", "negative"] = "both"

    @field_validator("imgsz")
    @classmethod
    def _valid_imgsz(cls, value: int) -> int:
        if value not in IMG_SIZES:
            raise ValueError(f"imgsz must be one of {IMG_SIZES}")
        return value

    @field_validator("model")
    @classmethod
    def _valid_model(cls, value: str) -> str:
        if value not in APPROVED_MODELS:
            raise ValueError(f"model must be one of {APPROVED_MODELS}")
        return value

    @field_validator("tracker")
    @classmethod
    def _valid_tracker(cls, value: str) -> str:
        if value not in APPROVED_TRACKERS:
            raise ValueError(f"tracker must be one of {APPROVED_TRACKERS}")
        return value

    @field_validator("classes")
    @classmethod
    def _valid_classes(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        if value is None:
            return None
        if not value:
            return None
        for item in value:
            if item < 0 or item > 999:
                raise ValueError("class ids must be between 0 and 999")
        return sorted(set(value))

    @model_validator(mode="after")
    def _valid_capture_resolution(self) -> "UserSettings":
        """Camera capture overrides must be a sane, even width *and* height pair."""
        width, height = self.camera_width, self.camera_height
        if (width == 0) != (height == 0):
            raise ValueError(
                "camera_width and camera_height must both be set, or both 0 for native"
            )
        if width == 0:
            return self
        if width < 64 or height < 64:
            raise ValueError("camera capture resolution must be at least 64x64")
        if width % 2 or height % 2:
            raise ValueError("camera capture resolution must use even numbers")
        return self


class UserSettingsUpdate(BaseModel):
    """Partial update payload for PUT /api/settings."""

    model_config = ConfigDict(extra="forbid")

    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    iou: Optional[float] = Field(None, ge=0.0, le=1.0)
    imgsz: Optional[int] = None
    model: Optional[str] = None
    classes: Optional[List[int]] = None
    tracking_enabled: Optional[bool] = None
    device: Optional[Literal["auto", "cpu", "cuda"]] = None
    tracker: Optional[str] = None

    frame_interval: Optional[int] = Field(None, ge=1, le=30)
    max_upload_mb: Optional[int] = Field(None, ge=1, le=4096)

    event_logging_enabled: Optional[bool] = None
    log_all_detections: Optional[bool] = None
    event_sample_interval: Optional[int] = Field(None, ge=1, le=600)
    min_event_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

    jpeg_quality: Optional[int] = Field(None, ge=20, le=100)
    stream_fps: Optional[int] = Field(None, ge=1, le=60)

    default_camera_index: Optional[int] = Field(None, ge=0, le=16)
    camera_width: Optional[int] = Field(None, ge=0, le=3840)
    camera_height: Optional[int] = Field(None, ge=0, le=2160)
    data_retention_days: Optional[int] = Field(None, ge=0, le=3650)

    line_crossing_enabled: Optional[bool] = None
    line_orientation: Optional[Literal["horizontal", "vertical"]] = None
    line_position: Optional[float] = Field(None, ge=0.0, le=1.0)
    line_direction: Optional[Literal["both", "positive", "negative"]] = None

    def merged_into(self, base: UserSettings) -> UserSettings:
        """Validate the merged result by constructing a fresh UserSettings."""
        data = base.model_dump()
        for key, value in self.model_dump(exclude_unset=True, exclude_none=True).items():
            data[key] = value
        return UserSettings(**data)
