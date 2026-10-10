"""Safe filesystem helpers.

All user-provided files stay inside the configured data directory; server-side
filenames are generated and path traversal is rejected.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional


def is_within(base: Path, target: Path) -> bool:
    try:
        base = base.resolve()
        target = target.resolve()
        return base == target or base in target.parents
    except OSError:
        return False


def generate_stored_name(extension: str) -> str:
    ext = extension.lower().lstrip(".")
    return f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex


def resolve_within(base: Path, candidate: str) -> Optional[Path]:
    """Resolve ``candidate`` against ``base`` and reject escapes."""
    path = (base / candidate).resolve()
    return path if is_within(base, path) else None


def safe_delete(path: Optional[str | Path]) -> bool:
    if not path:
        return False
    try:
        target = Path(path)
        if target.is_file():
            target.unlink()
            return True
    except OSError:
        return False
    return False
