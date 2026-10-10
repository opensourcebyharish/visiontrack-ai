"""Camera enumeration endpoint."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_container
from app.container import AppContainer
from app.schemas.system import CameraInfo

router = APIRouter(tags=["cameras"])


@router.get("/cameras", response_model=List[CameraInfo])
def list_cameras(
    probe: bool = Query(True, description="Open each device to verify availability"),
    container: AppContainer = Depends(get_container),
) -> List[CameraInfo]:
    return container.camera_manager.list_cameras(probe=probe)
