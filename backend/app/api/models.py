"""Model listing and class metadata endpoints."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_container
from app.container import AppContainer
from app.schemas.system import ModelInfo
from app.services.settings_service import SettingsService

router = APIRouter(tags=["models"])


@router.get("/models", response_model=List[ModelInfo])
def list_models(container: AppContainer = Depends(get_container)) -> List[ModelInfo]:
    settings = container.settings
    default_model = container.settings_service.get().model
    models: List[ModelInfo] = []
    for name in settings.approved_models:
        path = settings.models_dir / name
        models.append(
            ModelInfo(
                name=name,
                path=str(path),
                available=path.exists(),
                is_default=(name == default_model),
            )
        )
    return models


@router.get("/models/classes")
def model_classes(
    model: str | None = Query(default=None),
    container: AppContainer = Depends(get_container),
):
    """Return the class-id → name map for an approved model."""
    settings = container.settings
    target = model or container.settings_service.get().model
    if target not in settings.approved_models:
        raise HTTPException(status_code=400, detail="Model is not in the approved list.")
    try:
        _model, names, _device = container.model_registry.get(target, "cpu")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Model could not be loaded: {exc}") from exc
    return {"model": target, "classes": [{"id": cid, "name": name} for cid, name in sorted(names.items())]}
