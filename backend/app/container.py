"""Application service container (composition root).

Builds and wires all long-lived services exactly once per process.  Tests can
build an isolated container against a temporary database.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.config import Settings, get_settings
from app.core.detector import Detector, ModelRegistry
from app.database.db import Database, get_database
from app.services.analytics_service import AnalyticsService
from app.services.camera_manager import CameraManager
from app.services.event_service import EventService
from app.services.session_service import SessionService
from app.services.settings_service import SettingsService
from app.workers.processing_manager import ProcessingManager


@dataclass
class AppContainer:
    settings: Settings
    db: Database
    model_registry: ModelRegistry
    detector: Detector
    settings_service: SettingsService
    event_service: EventService
    session_service: SessionService
    analytics_service: AnalyticsService
    processing_manager: ProcessingManager
    camera_manager: CameraManager
    started_at: float


def build_container(
    settings: Optional[Settings] = None,
    db_path: Optional[Path | str] = None,
) -> AppContainer:
    settings = settings or get_settings()
    settings.ensure_directories()

    db = get_database(db_path or settings.database_path)
    model_registry = ModelRegistry(settings.models_dir)
    detector = Detector(model_registry)
    settings_service = SettingsService(db)
    event_service = EventService(db)
    session_service = SessionService(db)
    analytics_service = AnalyticsService(db)
    processing_manager = ProcessingManager(
        session_service=session_service,
        event_service=event_service,
        detector=detector,
        model_registry=model_registry,
        db=db,
        max_workers=settings.max_concurrent_jobs,
    )
    camera_manager = CameraManager()

    return AppContainer(
        settings=settings,
        db=db,
        model_registry=model_registry,
        detector=detector,
        settings_service=settings_service,
        event_service=event_service,
        session_service=session_service,
        analytics_service=analytics_service,
        processing_manager=processing_manager,
        camera_manager=camera_manager,
        started_at=time.time(),
    )
