"""Detection parsing, bounding-box conversion and annotation tests."""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from app.core.annotations import draw_detections, draw_hud
from app.core.detector import Detection, Detector, filter_detections


class Arr(list):
    def tolist(self):
        return list(self)


def _fake_result():
    boxes = SimpleNamespace(
        cls=Arr([0, 2]),
        conf=Arr([0.9, 0.75]),
        xyxy=Arr([[10.4, 20.6, 100.2, 200.9], [5.0, 5.0, 50.0, 50.0]]),
        id=Arr([7, None]),
    )
    return SimpleNamespace(boxes=boxes, names={0: "person", 2: "car"})


def test_parse_detections_structure():
    detections = Detector._parse(_fake_result())
    assert len(detections) == 2
    first = detections[0]
    assert first.class_id == 0
    assert first.class_name == "person"
    assert first.confidence == 0.9
    assert first.track_id == 7
    assert first.bbox() == (10, 21, 100, 201)
    assert detections[1].track_id is None


def test_parse_handles_empty_boxes():
    result = SimpleNamespace(boxes=None, names={})
    assert Detector._parse(result) == []


def test_center_and_area():
    det = Detection(1, "car", 0.5, 0, 0, 10, 20)
    assert det.center == (5.0, 10.0)
    assert det.area == 200.0


def test_filter_detections_by_confidence_and_class():
    dets = [
        Detection(0, "person", 0.9, 0, 0, 10, 10),
        Detection(2, "car", 0.4, 0, 0, 10, 10),
        Detection(1, "bicycle", 0.8, 0, 0, 10, 10),
    ]
    assert len(filter_detections(dets, min_confidence=0.5)) == 2
    assert len(filter_detections(dets, classes=[0])) == 1
    assert len(filter_detections(dets, min_confidence=0.5, classes=[0, 1])) == 2


def test_draw_detections_preserves_dimensions():
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    dets = [Detection(0, "person", 0.88, 20, 30, 120, 200, track_id=3)]
    annotated = draw_detections(frame, dets)
    assert annotated.shape == (240, 320, 3)
    assert annotated.sum() > 0  # something was drawn


def test_draw_hud_and_line():
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    draw_hud(frame, 12.5, 3, 42.0)
    draw_detections(
        frame,
        [Detection(0, "person", 0.5, 10, 10, 50, 50)],
        line={"enabled": True, "orientation": "vertical", "position": 0.5},
    )
    assert frame.sum() > 0
