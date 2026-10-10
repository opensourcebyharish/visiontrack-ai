"""Lightweight performance meters."""

from __future__ import annotations

import time
from collections import deque
from typing import Deque, Optional


class FpsMeter:
    """Rolling-window FPS estimator based on wall-clock frame timing."""

    def __init__(self, window: int = 30) -> None:
        self._times: Deque[float] = deque(maxlen=window)
        self._last: Optional[float] = None

    def tick(self) -> Optional[float]:
        now = time.perf_counter()
        if self._last is not None:
            self._times.append(now - self._last)
        self._last = now
        return self.value

    @property
    def value(self) -> Optional[float]:
        if not self._times:
            return None
        avg = sum(self._times) / len(self._times)
        return round(1.0 / avg, 2) if avg > 0 else None


class AverageMeter:
    """Simple running average."""

    def __init__(self) -> None:
        self.total = 0.0
        self.count = 0

    def update(self, value: float) -> None:
        self.total += float(value)
        self.count += 1

    @property
    def value(self) -> Optional[float]:
        return round(self.total / self.count, 3) if self.count else None
