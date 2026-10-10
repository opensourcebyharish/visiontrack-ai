"""Inference device selection and reporting.

The application is explicit about the device it uses.  CUDA is only reported
when PyTorch can actually see a CUDA device.
"""

from __future__ import annotations

from typing import Any, Dict

import torch


def cuda_available() -> bool:
    try:
        return bool(torch.cuda.is_available())
    except Exception:  # pragma: no cover - defensive
        return False


def resolve_device(preference: str = "auto") -> str:
    """Resolve a user preference (``auto``/``cpu``/``cuda``) to a torch device.

    Falls back to CPU when CUDA was requested but is unavailable so the
    application never claims GPU work it cannot perform.
    """
    preference = (preference or "auto").lower()
    if preference == "cpu":
        return "cpu"
    if preference == "cuda":
        return "cuda:0" if cuda_available() else "cpu"
    return "cuda:0" if cuda_available() else "cpu"


def device_label(device: str) -> str:
    if device.startswith("cuda"):
        if cuda_available():
            try:
                return torch.cuda.get_device_name(0)
            except Exception:  # pragma: no cover
                return "CUDA device"
        return "CUDA (unavailable)"
    return "CPU"


def device_info() -> Dict[str, Any]:
    return {
        "cuda_available": cuda_available(),
        "cuda_device_name": (
            torch.cuda.get_device_name(0)
            if cuda_available()
            else None
        ),
        "torch_version": torch.__version__,
    }
