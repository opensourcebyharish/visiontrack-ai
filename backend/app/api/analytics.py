"""Analytics endpoints derived from stored data only."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_container
from app.container import AppContainer
from app.schemas.analytics import (
    AnalyticsSummary,
    ClassStatistic,
    MetricPoint,
    SessionComparison,
    TimeSeriesPoint,
)

router = APIRouter(tags=["analytics"])


@router.get("/analytics/summary", response_model=AnalyticsSummary)
def summary(container: AppContainer = Depends(get_container)) -> AnalyticsSummary:
    return container.analytics_service.summary()


@router.get("/analytics/classes", response_model=List[ClassStatistic])
def classes(
    limit: int = Query(25, ge=1, le=200),
    container: AppContainer = Depends(get_container),
) -> List[ClassStatistic]:
    return container.analytics_service.class_statistics(limit=limit)


@router.get("/analytics/timeseries", response_model=List[TimeSeriesPoint])
def timeseries(
    bucket: str = Query("hour", pattern="^(hour|day)$"),
    container: AppContainer = Depends(get_container),
) -> List[TimeSeriesPoint]:
    return container.analytics_service.events_over_time(bucket=bucket)


@router.get("/analytics/sessions", response_model=List[SessionComparison])
def sessions(
    limit: int = Query(20, ge=1, le=200),
    container: AppContainer = Depends(get_container),
) -> List[SessionComparison]:
    return container.analytics_service.session_comparison(limit=limit)


@router.get("/analytics/sessions/{session_id}/metrics", response_model=List[MetricPoint])
def session_metrics(
    session_id: str,
    limit: int = Query(500, ge=1, le=5000),
    container: AppContainer = Depends(get_container),
) -> List[MetricPoint]:
    if not container.session_service.get(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    return container.analytics_service.session_metrics(session_id, limit=limit)
