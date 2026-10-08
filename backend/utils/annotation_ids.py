"""Helpers for stable, project-level annotation shape IDs."""

from collections.abc import Iterable
import uuid
from typing import Any


def _normalize_shape_id(value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    normalized = str(value).strip()
    return normalized or None


def _new_shape_id(used_ids: set[str]) -> str:
    shape_id = str(uuid.uuid4())
    while shape_id in used_ids:
        shape_id = str(uuid.uuid4())
    return shape_id


def ensure_shape_ids(
    shapes: Any,
    reserved_ids: Iterable[str] | None = None,
) -> tuple[list[Any], int, int]:
    """Return shapes with unique string IDs.

    Existing non-empty IDs are preserved when they do not collide with the
    supplied or previously seen IDs. Missing and duplicate IDs receive a new
    UUID. The return values are ``(normalized_shapes, generated_count,
    duplicate_count)``.
    """
    if not isinstance(shapes, list):
        return [], 0, 0

    used_ids = {str(value).strip() for value in (reserved_ids or []) if str(value).strip()}
    normalized_shapes: list[Any] = []
    generated_count = 0
    duplicate_count = 0

    for shape in shapes:
        if not isinstance(shape, dict):
            normalized_shapes.append(shape)
            continue

        candidate = _normalize_shape_id(shape.get("id"))
        if candidate is None or candidate in used_ids:
            if candidate is not None and candidate in used_ids:
                duplicate_count += 1
            candidate = _new_shape_id(used_ids)
            generated_count += 1

        normalized_shape = dict(shape)
        normalized_shape["id"] = candidate
        normalized_shapes.append(normalized_shape)
        used_ids.add(candidate)

    return normalized_shapes, generated_count, duplicate_count
