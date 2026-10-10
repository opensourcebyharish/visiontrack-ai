"""VisionTrack AI FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.config import PROJECT_ROOT, get_settings
from app.container import build_container
from app.logging_config import configure_logging, get_logger

logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    container = build_container()
    app.state.container = container
    logger.info(
        "VisionTrack AI started | data_dir=%s | cuda=%s",
        container.settings.data_dir,
        _cuda(),
    )
    try:
        yield
    finally:
        logger.info("Shutting down VisionTrack AI")
        container.processing_manager.shutdown()
        container.db.close()


def _cuda() -> bool:
    from app.core.device import cuda_available

    return cuda_available()


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title="VisionTrack AI",
        version=settings.app_version,
        description="Real-time computer vision: detection, tracking, counting and analytics.",
        lifespan=lifespan,
    )

    # Restrict CORS to the configured local frontend origin(s).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):  # pragma: no cover
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. See server logs for details."},
        )

    # Serve the built frontend when available (single-server production mode).
    dist_dir = PROJECT_ROOT / "frontend" / "dist"
    if dist_dir.exists():
        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
    else:
        @app.get("/")
        def root() -> dict:
            return {
                "app": settings.app_name,
                "version": settings.app_version,
                "docs": "/docs",
                "api": "/api/health",
                "note": "Frontend dev server runs on http://localhost:5173",
            }

    return app


app = create_app()
