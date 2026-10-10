"""API package."""

from fastapi import APIRouter

from app.api import (
    analytics,
    cameras,
    events,
    health,
    models,
    sessions,
    settings,
    stream,
    videos,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(models.router)
api_router.include_router(cameras.router)
api_router.include_router(sessions.router)
api_router.include_router(videos.router)
api_router.include_router(events.router)
api_router.include_router(analytics.router)
api_router.include_router(settings.router)
api_router.include_router(stream.router)

__all__ = ["api_router"]
