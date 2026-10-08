"""Lightweight ONNX ReID encoder used by the Track ID workspace.

The model is deliberately loaded lazily.  Opening MultiAnno therefore does
not allocate model memory, and a missing optional ONNX Runtime installation
does not disable ordinary annotation workflows.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

from utils.image_io import render_preview_rgb
from utils.logging_config import get_logger, shorten


logger = get_logger("reid")

try:
    import onnxruntime as ort
except (ImportError, OSError) as exc:  # pragma: no cover - environment dependent
    ort = None
    ONNXRUNTIME_IMPORT_ERROR = exc
else:
    ONNXRUNTIME_IMPORT_ERROR = None


class ReIDUnavailableError(RuntimeError):
    """Raised when the configured ReID runtime/model cannot be used."""


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return default


def configured_model_path() -> str:
    return _env_first("REID_MODEL_PATH")


def _shape_dimension(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _normalise_embedding(embedding: np.ndarray) -> np.ndarray:
    vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(vector))
    if norm <= 1e-8:
        raise ReIDUnavailableError("The ReID model returned an empty embedding.")
    return vector / norm


def _bbox_from_points(points: list[Any]) -> Optional[list[float]]:
    values: list[tuple[float, float]] = []
    for point in points or []:
        try:
            if isinstance(point, dict):
                values.append((float(point["x"]), float(point["y"])))
            elif isinstance(point, (list, tuple)) and len(point) >= 2:
                values.append((float(point[0]), float(point[1])))
        except (KeyError, TypeError, ValueError):
            continue
    if not values:
        return None
    xs = [point[0] for point in values]
    ys = [point[1] for point in values]
    return [min(xs), min(ys), max(xs), max(ys)]


def _bbox_center(bbox: Optional[list[float]]) -> Optional[tuple[float, float]]:
    if not bbox:
        return None
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


class ReIDEncoder:
    """Generic embedding adapter for common NCHW/NHWC ONNX ReID models."""

    def __init__(self) -> None:
        self.session: Any = None
        self.model_path = ""
        self.model_mtime_ns: int | None = None
        self.input_name = ""
        self.input_shape: list[Any] = []
        self.input_layout = "nchw"
        self.input_height = 256
        self.input_width = 128
        self.input_dtype = np.float32
        self.providers: list[str] = []

    @property
    def is_loaded(self) -> bool:
        return self.session is not None

    def status(self) -> dict[str, Any]:
        configured_path = configured_model_path()
        path = Path(configured_path) if configured_path else None
        return {
            "runtime_available": ort is not None,
            "configured": bool(configured_path),
            "model_exists": bool(path and path.is_file()),
            "loaded": self.is_loaded,
            "model_name": path.name if path else "",
            "providers": list(self.providers),
            "detail": self._status_detail(configured_path, path),
        }

    def _status_detail(self, configured_path: str, path: Optional[Path]) -> Optional[str]:
        if ort is None:
            return f"onnxruntime is unavailable: {ONNXRUNTIME_IMPORT_ERROR}"
        if not configured_path:
            return "REID_MODEL_PATH is not configured."
        if path is None or not path.is_file():
            return f"ReID model file was not found: {configured_path}"
        return None

    def _resolve_input_layout(self, shape: list[Any]) -> None:
        self.input_shape = list(shape or [])
        if len(shape) != 4:
            self.input_layout = "nchw"
            self.input_height = 256
            self.input_width = 128
            return

        channel_first = shape[1] in (1, 3) or str(shape[1]) in {"1", "3"}
        channel_last = shape[-1] in (1, 3) or str(shape[-1]) in {"1", "3"}
        self.input_layout = "nhwc" if channel_last and not channel_first else "nchw"
        if self.input_layout == "nhwc":
            self.input_height = _shape_dimension(shape[1], 256)
            self.input_width = _shape_dimension(shape[2], 128)
        else:
            self.input_height = _shape_dimension(shape[2], 256)
            self.input_width = _shape_dimension(shape[3], 128)

    def load(self) -> None:
        configured_path = configured_model_path()
        if not configured_path:
            raise ReIDUnavailableError("Set REID_MODEL_PATH in .env before using ReID.")
        if ort is None:
            raise ReIDUnavailableError(
                "onnxruntime is not installed. Install the backend ReID dependency first."
            )

        path = Path(configured_path)
        if not path.is_file():
            raise ReIDUnavailableError(f"ReID model file was not found: {configured_path}")
        model_mtime_ns = path.stat().st_mtime_ns
        if self.session is not None and self.model_path == str(path) and self.model_mtime_ns == model_mtime_ns:
            return

        available_providers = list(ort.get_available_providers())
        preferred_provider = _env_first("REID_EXECUTION_PROVIDER")
        if not preferred_provider and _env_first("MULTIANNO_AI_DEVICE").lower().startswith(("cuda", "gpu")):
            preferred_provider = "CUDAExecutionProvider"
        provider_order = []
        if preferred_provider and preferred_provider in available_providers:
            provider_order.append(preferred_provider)
        if not preferred_provider and "CPUExecutionProvider" in available_providers:
            provider_order.append("CPUExecutionProvider")
        if preferred_provider and "CPUExecutionProvider" in available_providers:
            provider_order.append("CPUExecutionProvider")
        if not provider_order:
            provider_order = available_providers

        logger.info(
            "REID_MODEL_LOAD_START path=%s providers=%s",
            shorten(str(path), 1500),
            provider_order,
        )
        try:
            session = ort.InferenceSession(str(path), providers=provider_order or None)
        except Exception as exc:
            logger.exception("REID_MODEL_LOAD_ERROR path=%s error=%s", shorten(str(path), 1500), exc)
            raise ReIDUnavailableError(f"Failed to load the ReID ONNX model: {exc}") from exc

        inputs = session.get_inputs()
        if not inputs:
            raise ReIDUnavailableError("The ReID ONNX model has no input tensor.")
        model_input = inputs[0]
        self.session = session
        self.model_path = str(path)
        self.model_mtime_ns = model_mtime_ns
        self.input_name = model_input.name
        self._resolve_input_layout(list(model_input.shape))
        self.input_dtype = np.float16 if "float16" in str(model_input.type).lower() else np.float32
        self.providers = list(session.get_providers())
        logger.info(
            "REID_MODEL_LOAD_END name=%s shape=%s layout=%s dtype=%s providers=%s",
            path.name,
            self.input_shape,
            self.input_layout,
            self.input_dtype,
            self.providers,
        )

    def _preprocess(self, crop: np.ndarray) -> np.ndarray:
        resized = cv2.resize(crop, (self.input_width, self.input_height), interpolation=cv2.INTER_LINEAR)
        image = resized.astype(np.float32) / 255.0
        normalisation = _env_first("REID_NORMALIZATION", default="imagenet").lower()
        if normalisation == "imagenet":
            image = (image - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array(
                [0.229, 0.224, 0.225], dtype=np.float32
            )
        elif normalisation in {"minus_one_one", "-1_1"}:
            image = image * 2.0 - 1.0

        if self.input_layout == "nchw":
            image = np.transpose(image, (2, 0, 1))
        return image[None, ...].astype(self.input_dtype, copy=False)

    def _read_crop(self, image_path: str, bbox: list[float]) -> np.ndarray:
        image = render_preview_rgb(image_path)
        if image is None or image.size == 0:
            raise ReIDUnavailableError(f"Unable to read image: {image_path}")
        height, width = image.shape[:2]
        left, top, right, bottom = bbox
        object_width = max(1.0, right - left)
        object_height = max(1.0, bottom - top)
        margin_x = object_width * 0.05
        margin_y = object_height * 0.05
        left = max(0, int(np.floor(left - margin_x)))
        top = max(0, int(np.floor(top - margin_y)))
        right = min(width, int(np.ceil(right + margin_x)))
        bottom = min(height, int(np.ceil(bottom + margin_y)))
        if right <= left or bottom <= top:
            raise ReIDUnavailableError(f"The ReID crop is outside the image: {image_path}")
        return image[top:bottom, left:right, :3]

    def embed(self, image_path: str, points: list[Any]) -> np.ndarray:
        bbox = _bbox_from_points(points)
        if bbox is None:
            raise ReIDUnavailableError("A candidate object has no valid geometry.")
        crop = self._read_crop(image_path, bbox)
        outputs = self.session.run(None, {self.input_name: self._preprocess(crop)})
        numeric_outputs = [np.asarray(output) for output in outputs if np.asarray(output).size]
        if not numeric_outputs:
            raise ReIDUnavailableError("The ReID model returned no embedding.")
        embedding = max(numeric_outputs, key=lambda output: output.size)
        return _normalise_embedding(embedding)


encoder = ReIDEncoder()


def candidate_bbox(candidate: dict[str, Any]) -> Optional[list[float]]:
    return _bbox_from_points(candidate.get("points") or [])


def candidate_center(candidate: dict[str, Any]) -> Optional[tuple[float, float]]:
    return _bbox_center(candidate_bbox(candidate))


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.dot(left, right))
