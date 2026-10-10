"""Settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_container
from app.container import AppContainer
from app.schemas.settings_models import UserSettings, UserSettingsUpdate

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=UserSettings)
def get_settings_endpoint(container: AppContainer = Depends(get_container)) -> UserSettings:
    return container.settings_service.get()


@router.put("/settings", response_model=UserSettings)
def update_settings_endpoint(
    payload: UserSettingsUpdate, container: AppContainer = Depends(get_container)
) -> UserSettings:
    try:
        return container.settings_service.update(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid settings: {exc}") from exc


@router.post("/settings/reset", response_model=UserSettings)
def reset_settings_endpoint(container: AppContainer = Depends(get_container)) -> UserSettings:
    return container.settings_service.replace(UserSettings())


@router.post("/settings/cleanup")
def cleanup(container: AppContainer = Depends(get_container)) -> dict:
    settings = container.settings_service.get()
    result = container.analytics_service.cleanup(settings.data_retention_days)
    result["retention_days"] = settings.data_retention_days
    result["database_size_bytes"] = container.analytics_service.database_size_bytes()
    return result
