"""Object counting and line-crossing tests."""

from __future__ import annotations

from app.core.counting import LineCounter, UniqueCounter, class_distribution
from app.core.detector import Detection


def _det(track_id, class_id=0, name="person", cx=50):
    return Detection(class_id, name, 0.9, cx - 10, 10, cx + 10, 50, track_id=track_id)


def test_unique_counter_tracks_ids():
    counter = UniqueCounter()
    counter.update([_det(1), _det(2)])
    counter.update([_det(1), _det(3)])
    assert counter.total == 3
    assert counter.per_class() == {"person": 3}


def test_unique_counter_without_ids_uses_bbox():
    counter = UniqueCounter()
    counter.update([_det(None, cx=50)])
    counter.update([_det(None, cx=50)])  # same bbox -> same object
    counter.update([_det(None, cx=90)])  # new position -> new object
    assert counter.total == 2


def test_line_crossing_vertical_positive():
    counter = LineCounter(orientation="vertical", position=0.5, direction="both")
    width, height = 100, 100
    counter.update([_det(1, cx=10)], width, height)  # left of line
    crossings = counter.update([_det(1, cx=90)], width, height)  # crossed to right
    assert len(crossings) == 1
    assert crossings[0].direction == "positive"
    assert counter.total == 1
    # Re-crossing the same track must not double count.
    counter.update([_det(1, cx=10)], width, height)
    crossings = counter.update([_det(1, cx=90)], width, height)
    assert crossings == []
    assert counter.total == 1


def test_line_crossing_direction_filter():
    counter = LineCounter(orientation="vertical", position=0.5, direction="positive")
    width, height = 100, 100
    counter.update([_det(1, cx=90)], width, height)
    crossings = counter.update([_det(1, cx=10)], width, height)  # negative, filtered out
    assert crossings == []


def test_line_crossing_horizontal():
    counter = LineCounter(orientation="horizontal", position=0.5)
    width, height = 100, 100
    counter.update([_det(1, cx=50)], width, height)  # cy=30 above
    det = Detection(0, "person", 0.9, 40, 80, 60, 100, track_id=1)
    crossings = counter.update([det], width, height)  # now below
    assert len(crossings) == 1


def test_class_distribution():
    dets = [_det(1, 0, "person"), _det(2, 0, "person"), _det(3, 2, "car")]
    assert class_distribution(dets) == {"person": 2, "car": 1}
