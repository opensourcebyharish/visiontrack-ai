"""Configuration and validation tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas.settings_models import IMG_SIZES, UserSettings, UserSettingsUpdate


def test_settings_defaults_and_directories(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", models_dir=tmp_path / "models")
    assert settings.app_name == "VisionTrack AI"
    assert "mp4" in settings.allowed_video_extensions
    assert settings.max_upload_mb > 0
    settings.ensure_directories()
    assert settings.uploads_dir.exists()
    assert settings.outputs_dir.exists()


def test_env_csv_parsing(monkeypatch, tmp_path):
    monkeypatch.setenv("VISIONTRACK_ALLOWED_VIDEO_EXTENSIONS", "mp4, mov")
    settings = Settings(data_dir=tmp_path, models_dir=tmp_path)
    assert settings.allowed_video_extensions == ["mp4", "mov"]


def test_user_settings_validation():
    with pytest.raises(ValidationError):
        UserSettings(confidence=1.5)
    with pytest.raises(ValidationError):
        UserSettings(imgsz=123)
    with pytest.raises(ValidationError):
        UserSettings(model="not-a-real-model.pt")
    with pytest.raises(ValidationError):
        UserSettings(tracker="evil.yaml")


def test_user_settings_update_merge():
    base = UserSettings()
    merged = UserSettingsUpdate(confidence=0.6).merged_into(base)
    assert merged.confidence == 0.6
    assert merged.model == base.model

    with pytest.raises(ValidationError):
        UserSettingsUpdate(imgsz=999).merged_into(base)


def test_classes_normalized():
    settings = UserSettings(classes=[3, 1, 3, 2])
    assert settings.classes == [1, 2, 3]
    assert UserSettings(classes=[]).classes is None


def test_smaller_input_sizes_allowed():
    assert 192 in IMG_SIZES and 256 in IMG_SIZES
    assert UserSettings(imgsz=192).imgsz == 192
    assert UserSettings(imgsz=256).imgsz == 256
    with pytest.raises(ValidationError):
        UserSettings(imgsz=200)  # not a multiple of 32 / not in the allow-list


def test_camera_resolution_validation():
    assert UserSettings().camera_width == 0  # 0 = native
    assert UserSettings(camera_width=640, camera_height=480).camera_width == 640
    with pytest.raises(ValidationError):
        UserSettings(camera_width=640)  # height missing
    with pytest.raises(ValidationError):
        UserSettings(camera_height=480)  # width missing
    with pytest.raises(ValidationError):
        UserSettings(camera_width=640, camera_height=481)  # odd value
    with pytest.raises(ValidationError):
        UserSettings(camera_width=32, camera_height=32)  # too small
