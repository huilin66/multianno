"""Lightweight ONNX ReID encoder used by the Track ID workspace.

The model is deliberately loaded lazily.  Opening MultiAnno therefore does
not allocate model memory, and a missing optional ONNX Runtime installation
does not disable ordinary annotation workflows.
"""

from __future__ import annotations

import gc
import os
import threading
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

from utils.image_io import render_preview_rgb
from utils.logging_config import get_logger, shorten


logger = get_logger("reid")

_REID_DLL_HANDLES: list[Any] = []


def _configure_runtime_dll_path() -> None:
    """Make optional CUDA/cuDNN DLLs visible to this backend process only."""
    configured = os.getenv("REID_CUDA_DLL_PATH", "").strip()
    if not configured:
        return

    path_entries = os.environ.get("PATH", "").split(os.pathsep)
    for raw_path in configured.split(os.pathsep):
        path_text = raw_path.strip().strip('"')
        if not path_text:
            continue

        dll_path = Path(path_text).expanduser()
        if not dll_path.is_dir():
            logger.warning("REID_CUDA_DLL_PATH_MISSING path=%s", shorten(str(dll_path), 1000))
            continue

        normalized = str(dll_path)
        if normalized not in path_entries:
            path_entries.insert(0, normalized)

        add_dll_directory = getattr(os, "add_dll_directory", None)
        if add_dll_directory is not None and os.name == "nt":
            try:
                _REID_DLL_HANDLES.append(add_dll_directory(normalized))
            except OSError as exc:
                logger.warning(
                    "REID_CUDA_DLL_REGISTER_FAILED path=%s error=%s",
                    shorten(normalized, 1000),
                    shorten(str(exc), 1000),
                )

        logger.info("REID_CUDA_DLL_PATH_ADDED path=%s", shorten(normalized, 1000))

    os.environ["PATH"] = os.pathsep.join(path_entries)


_configure_runtime_dll_path()

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
        self._condition = threading.Condition(threading.RLock())
        self._active_inferences = 0
        self.session: Any = None
        self.model_path_override = ""
        self.model_path = ""
        self.model_mtime_ns: int | None = None
        self.input_name = ""
        self.input_shape: list[Any] = []
        self.input_batch_size: int | None = None
        self.input_layout = "nchw"
        self.input_height = 256
        self.input_width = 128
        self.input_dtype = np.float32
        self.providers: list[str] = []

    @property
    def is_loaded(self) -> bool:
        with self._condition:
            return self.session is not None

    def configured_path(self) -> str:
        return self.model_path_override or configured_model_path()

    def configure_model_path(self, model_path: str) -> dict[str, Any]:
        """Set a process-local model path override used by the Track ID UI."""
        normalized = str(model_path or "").strip()
        if normalized:
            path = Path(normalized).expanduser()
            if not path.is_file():
                raise ValueError(f"ReID model file was not found: {normalized}")
            normalized = str(path)

        previous_path = self.configured_path()
        self.model_path_override = normalized
        if previous_path != self.configured_path():
            self.unload()
        return self.status()

    def status(self) -> dict[str, Any]:
        with self._condition:
            configured_path = self.configured_path()
            path = Path(configured_path) if configured_path else None
            loaded = self.session is not None
            providers = list(self.providers)
        return {
            "runtime_available": ort is not None,
            "configured": bool(configured_path),
            "model_exists": bool(path and path.is_file()),
            "loaded": loaded,
            "model_path": configured_path,
            "model_name": path.name if path else "",
            "providers": providers,
            "detail": self._status_detail(configured_path, path),
        }

    def _reset_session_state(self) -> None:
        """Clear all state derived from the currently loaded ONNX session."""
        self.session = None
        self.model_path = ""
        self.model_mtime_ns = None
        self.input_name = ""
        self.input_shape = []
        self.input_batch_size = None
        self.input_layout = "nchw"
        self.input_height = 256
        self.input_width = 128
        self.input_dtype = np.float32
        self.providers = []

    def unload(self) -> None:
        """Release the ONNX session and allow CUDA memory to be reclaimed.

        Releasing waits for an in-flight inference to finish.  This prevents a
        manual release or window-close cleanup from invalidating the session
        while the worker thread is still inside ``session.run``.
        """
        with self._condition:
            while self._active_inferences > 0:
                self._condition.wait()
            session = self.session
            self._reset_session_state()

        if session is not None:
            del session
            gc.collect()
            logger.info("REID_MODEL_UNLOAD_END")

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
        self.input_batch_size = None
        if len(shape) != 4:
            self.input_layout = "nchw"
            self.input_height = 256
            self.input_width = 128
            return

        parsed_batch_size = _shape_dimension(shape[0], 0)
        self.input_batch_size = parsed_batch_size or None
        channel_first = shape[1] in (1, 3) or str(shape[1]) in {"1", "3"}
        channel_last = shape[-1] in (1, 3) or str(shape[-1]) in {"1", "3"}
        self.input_layout = "nhwc" if channel_last and not channel_first else "nchw"
        if self.input_layout == "nhwc":
            self.input_height = _shape_dimension(shape[1], 256)
            self.input_width = _shape_dimension(shape[2], 128)
        else:
            self.input_height = _shape_dimension(shape[2], 256)
            self.input_width = _shape_dimension(shape[3], 128)

    def effective_batch_size(self, requested: int) -> int:
        """Return a batch size supported by the loaded model input."""
        requested_size = max(1, int(requested))
        # A fixed ONNX batch dimension takes precedence. Dynamic models use
        # the user-selected value from the Track ID settings.
        return self.input_batch_size or requested_size

    def load(self) -> None:
        with self._condition:
            self._load_unlocked()

    def _load_unlocked(self) -> None:
        configured_path = self.configured_path()
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
        return self._crop_from_image(image, bbox, image_path)

    def _crop_from_image(self, image: np.ndarray, bbox: list[float], image_path: str = "") -> np.ndarray:
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
            detail = f": {image_path}" if image_path else ""
            raise ReIDUnavailableError(f"The ReID crop is outside the image{detail}")
        return image[top:bottom, left:right, :3]

    def embed_batch(self, items: list[tuple[str, list[Any]]]) -> list[Optional[np.ndarray]]:
        """Embed several image crops with one ONNX call when supported."""
        if not items:
            return []

        results: list[Optional[np.ndarray]] = [None] * len(items)
        tensors: list[np.ndarray] = []
        valid_indices: list[int] = []
        image_cache: dict[str, np.ndarray] = {}

        for index, (image_path, points) in enumerate(items):
            bbox = _bbox_from_points(points)
            if bbox is None:
                continue
            try:
                if image_path not in image_cache:
                    image = render_preview_rgb(image_path)
                    if image is None or image.size == 0:
                        raise ReIDUnavailableError(f"Unable to read image: {image_path}")
                    image_cache[image_path] = image
                crop = self._crop_from_image(image_cache[image_path], bbox, image_path)
                tensors.append(self._preprocess(crop)[0])
                valid_indices.append(index)
            except (OSError, ValueError, ReIDUnavailableError):
                continue

        if not tensors:
            return results

        actual_count = len(tensors)
        model_input = np.stack(tensors, axis=0)
        if self.input_batch_size and actual_count < self.input_batch_size:
            padding_shape = (self.input_batch_size - actual_count, *model_input.shape[1:])
            padding = np.zeros(padding_shape, dtype=model_input.dtype)
            model_input = np.concatenate([model_input, padding], axis=0)

        with self._condition:
            session = self.session
            input_name = self.input_name
            if session is None:
                raise ReIDUnavailableError("The ReID model is not loaded.")
            self._active_inferences += 1
        try:
            outputs = session.run(None, {input_name: model_input})
        finally:
            with self._condition:
                self._active_inferences -= 1
                if self._active_inferences <= 0:
                    self._active_inferences = 0
                    self._condition.notify_all()
        numeric_outputs = [np.asarray(output) for output in outputs if np.asarray(output).size]
        if not numeric_outputs:
            raise ReIDUnavailableError("The ReID model returned no embedding.")
        embedding_output = max(numeric_outputs, key=lambda output: output.size)

        if actual_count == 1 and embedding_output.ndim == 1:
            vectors = [embedding_output]
        elif embedding_output.ndim >= 1 and embedding_output.shape[0] >= actual_count:
            vectors = [embedding_output[index] for index in range(actual_count)]
        else:
            raise ReIDUnavailableError(
                f"The ReID model returned an incompatible batch output shape: {embedding_output.shape}"
            )

        for original_index, vector in zip(valid_indices, vectors):
            results[original_index] = _normalise_embedding(vector)
        return results

    def embed(self, image_path: str, points: list[Any]) -> np.ndarray:
        embedding = self.embed_batch([(image_path, points)])[0]
        if embedding is None:
            raise ReIDUnavailableError("Unable to create a ReID embedding for the candidate.")
        return embedding


encoder = ReIDEncoder()


def candidate_bbox(candidate: dict[str, Any]) -> Optional[list[float]]:
    return _bbox_from_points(candidate.get("points") or [])


def candidate_center(candidate: dict[str, Any]) -> Optional[tuple[float, float]]:
    return _bbox_center(candidate_bbox(candidate))


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.dot(left, right))
