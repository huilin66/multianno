"""Small, dependency-free loader for the project-level ``.env`` file.

The desktop launcher starts the backend from ``backend/`` while Vite runs from
``frontend/``.  Loading the file here keeps both services able to share the
same local configuration without adding another runtime dependency.
"""

from __future__ import annotations

import os
import re
from pathlib import Path


_ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def project_root() -> Path:
    """Return the repository root for this backend installation."""

    return Path(__file__).resolve().parents[2]


def _parse_value(raw_value: str) -> str:
    value = raw_value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_project_env(env_path: str | Path | None = None) -> Path | None:
    """Load ``.env`` values without overriding explicitly-set environment vars.

    This intentionally supports the small, predictable subset needed by
    MultiAnno: blank lines, comments, optional ``export`` prefixes, and
    ``KEY=VALUE`` assignments.  Values are not interpolated, and secrets are
    never logged.
    """

    path = Path(env_path) if env_path is not None else project_root() / ".env"
    if not path.is_file():
        return None

    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return None

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not _ENV_KEY_PATTERN.fullmatch(key):
            continue
        if key not in os.environ:
            os.environ[key] = _parse_value(raw_value)

    return path
