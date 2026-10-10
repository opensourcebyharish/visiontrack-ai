"""Object counting helpers: unique tracked IDs and virtual line crossing."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from app.core.detector import Detection


class UniqueCounter:
    """Counts unique tracked objects, optionally split by class.

    Falls back to counting a detection once when no track ID is available
    (tracking disabled) so the metric is never silently zero.
    """

    def __init__(self) -> None:
        self._by_class: Dict[str, set] = {}
        self._fallback: Dict[str, set] = {}
        self._synthetic = 0

    def update(self, detections: Sequence[Detection]) -> None:
        for det in detections:
            key = det.class_name
            self._by_class.setdefault(key, set())
            if det.track_id is not None:
                self._by_class[key].add(det.track_id)
            else:
                # Use the bbox as a coarse identity when tracking is off.
                signature = (det.class_id,) + det.bbox()
                self._by_class[key].add(("bbox", signature))

    @property
    def total(self) -> int:
        return sum(len(ids) for ids in self._by_class.values())

    def per_class(self) -> Dict[str, int]:
        return {name: len(ids) for name, ids in self._by_class.items() if ids}


@dataclass
class LineCrossing:
    track_id: Optional[int]
    class_id: int
    class_name: str
    confidence: float
    direction: str  # "positive" | "negative"


class LineCounter:
    """Counts tracked objects crossing a virtual line.

    ``position`` is normalized in ``[0, 1]``.  A crossing is registered only
    when the object's estimated center moves across the line between two
    consecutive observations.  Each track is counted at most once per direction
    unless ``allow_repeat`` is set.
    """

    def __init__(
        self,
        orientation: str = "vertical",
        position: float = 0.5,
        direction: str = "both",
        allow_repeat: bool = False,
    ) -> None:
        self.orientation = orientation
        self.position = position
        self.direction = direction
        self.allow_repeat = allow_repeat
        self._previous: Dict[int, float] = {}
        self._counted: set = set()
        self.crossings: List[LineCrossing] = []
        self._counts_by_class: Dict[str, int] = {}

    def _coordinate(self, det: Detection, width: int, height: int) -> float:
        cx, cy = det.center
        return cx / max(width, 1) if self.orientation == "vertical" else cy / max(height, 1)

    def update(
        self, detections: Sequence[Detection], width: int, height: int
    ) -> List[LineCrossing]:
        new_crossings: List[LineCrossing] = []
        for det in detections:
            if det.track_id is None:
                continue
            coord = self._coordinate(det, width, height)
            prev = self._previous.get(det.track_id)
            self._previous[det.track_id] = coord
            if prev is None:
                continue

            crossed_positive = prev < self.position <= coord
            crossed_negative = prev > self.position >= coord
            crossing_direction = None
            if crossed_positive:
                crossing_direction = "positive"
            elif crossed_negative:
                crossing_direction = "negative"

            if crossing_direction is None:
                continue
            if self.direction != "both" and crossing_direction != self.direction:
                continue

            dedup_key = det.track_id
            if not self.allow_repeat and dedup_key in self._counted:
                continue
            self._counted.add(dedup_key)

            crossing = LineCrossing(
                track_id=det.track_id,
                class_id=det.class_id,
                class_name=det.class_name,
                confidence=det.confidence,
                direction=crossing_direction,
            )
            self.crossings.append(crossing)
            new_crossings.append(crossing)
            self._counts_by_class[det.class_name] = (
                self._counts_by_class.get(det.class_name, 0) + 1
            )
        return new_crossings

    @property
    def total(self) -> int:
        return len(self.crossings)

    def per_class(self) -> Dict[str, int]:
        return dict(self._counts_by_class)

    def reset(self) -> None:
        self._previous.clear()
        self._counted.clear()
        self.crossings.clear()
        self._counts_by_class.clear()


def class_distribution(detections: Sequence[Detection]) -> Dict[str, int]:
    """Count current-frame detections by class name."""
    counts: Dict[str, int] = {}
    for det in detections:
        counts[det.class_name] = counts.get(det.class_name, 0) + 1
    return counts
