"""Detection event query and export endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.api.deps import get_container
from app.container import AppContainer
from app.schemas.events import EventFilter, EventListResponse, EventResponse

router = APIRouter(tags=["events"])


def _build_filter(
    session_id: Optional[str],
    class_name: Optional[str],
    class_id: Optional[int],
    min_confidence: Optional[float],
    start: Optional[str],
    end: Optional[str],
    event_type: Optional[str],
    track_id: Optional[int],
) -> EventFilter:
    return EventFilter(
        session_id=session_id,
        class_name=class_name,
        class_id=class_id,
        min_confidence=min_confidence,
        start=start,
        end=end,
        event_type=event_type,
        track_id=track_id,
    )


@router.get("/events", response_model=EventListResponse)
def list_events(
    session_id: Optional[str] = Query(None),
    class_name: Optional[str] = Query(None),
    class_id: Optional[int] = Query(None),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0),
    start: Optional[str] = Query(None, description="ISO-8601 lower bound"),
    end: Optional[str] = Query(None, description="ISO-8601 upper bound"),
    event_type: Optional[str] = Query(None),
    track_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    container: AppContainer = Depends(get_container),
) -> EventListResponse:
    filters = _build_filter(
        session_id, class_name, class_id, min_confidence, start, end, event_type, track_id
    )
    rows, total = container.event_service.query(filters, limit=limit, offset=offset)
    return EventListResponse(
        items=[EventResponse(**row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/events/classes")
def event_classes(container: AppContainer = Depends(get_container)) -> dict:
    return {"classes": container.event_service.distinct_classes()}


@router.get("/events/export")
def export_events(
    session_id: Optional[str] = Query(None),
    class_name: Optional[str] = Query(None),
    class_id: Optional[int] = Query(None),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    track_id: Optional[int] = Query(None),
    container: AppContainer = Depends(get_container),
) -> Response:
    filters = _build_filter(
        session_id, class_name, class_id, min_confidence, start, end, event_type, track_id
    )
    content = container.event_service.export_csv(filters)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="visiontrack-events.csv"'},
    )
