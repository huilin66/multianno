import gc
import os
from typing import Any, Optional

import cv2
import numpy as np
import torch
import torch._dynamo
import torch.nn as nn

try:
    from ultralytics.models.sam.predict import SAM3Predictor, SAM3SemanticPredictor
except ImportError as exc:
    SAM3Predictor = None
    SAM3SemanticPredictor = None
    SAM3_IMPORT_ERROR = exc
else:
    SAM3_IMPORT_ERROR = None

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["TORCH_COMPILE_DISABLE"] = "1"
torch._dynamo.config.disable = True

_original_compile = torch.compile

YOLO_MODEL_TYPES = {
    "YOLOv8",
    "YOLOv9",
    "YOLOv10",
    "YOLO11",
    "YOLO12",
    "YOLO26",
}
SUPPORTED_MODEL_TYPES = [
    "SAM-3",
    "YOLOv8",
    "YOLOv9",
    "YOLOv10",
    "YOLO11",
    "YOLO12",
    "YOLO26",
    "LocateAnything",
]


def _safe_compile(model=None, **kwargs):
    if kwargs.get("mode") is False:
        kwargs["mode"] = "default"
    kwargs["disable"] = True
    return _original_compile(model, **kwargs)


torch.compile = _safe_compile


def _normalize_model_type(model_type: str) -> str:
    value = (model_type or "SAM-3").strip()
    lowered = value.lower().replace("_", "").replace("-", "")
    aliases = {
        "sam3": "SAM-3",
        "segmentanything3": "SAM-3",
        "locateanything": "LocateAnything",
        "nvidialocateanything": "LocateAnything",
    }
    if lowered in aliases:
        return aliases[lowered]

    yolo_aliases = {
        "yolov8": "YOLOv8",
        "yolo8": "YOLOv8",
        "yolov9": "YOLOv9",
        "yolo9": "YOLOv9",
        "yolov10": "YOLOv10",
        "yolo10": "YOLOv10",
        "yolo11": "YOLO11",
        "yolov11": "YOLO11",
        "yolo12": "YOLO12",
        "yolov12": "YOLO12",
        "yolo26": "YOLO26",
        "yolov26": "YOLO26",
    }
    if lowered in yolo_aliases:
        return yolo_aliases[lowered]
    return value


def _mask_to_bbox(mask_array: np.ndarray):
    coords = np.argwhere(mask_array > 0)
    if len(coords) == 0:
        return None
    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    return [float(x_min), float(y_min), float(x_max), float(y_max)]


def _mask_to_polygons(mask_array: np.ndarray, epsilon_factor: float = 0.002):
    contours, _ = cv2.findContours(
        mask_array.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    polygons = []
    for cnt in contours:
        if cv2.contourArea(cnt) < 50:
            continue
        epsilon = epsilon_factor * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        poly = [{"x": float(p[0][0]), "y": float(p[0][1])} for p in approx]
        if len(poly) >= 3:
            polygons.append(poly)
    return polygons


def _bbox_to_polygon(bbox: list[float]):
    x1, y1, x2, y2 = [float(v) for v in bbox]
    return [
        {"x": x1, "y": y1},
        {"x": x2, "y": y1},
        {"x": x2, "y": y2},
        {"x": x1, "y": y2},
    ]


def _name_from_result(names: Any, cls_id: int) -> str:
    if isinstance(names, dict):
        return str(names.get(cls_id, f"class_{cls_id}"))
    if isinstance(names, list) and 0 <= cls_id < len(names):
        return str(names[cls_id])
    return f"class_{cls_id}"


def _clean_text(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _match_prompt(class_name: str, prompts: list[str]) -> Optional[str]:
    if not prompts:
        return class_name
    normalized_name = _clean_text(class_name)
    for prompt in prompts:
        normalized_prompt = _clean_text(prompt)
        if normalized_prompt == normalized_name:
            return prompt
    for prompt in prompts:
        normalized_prompt = _clean_text(prompt)
        if normalized_prompt and (
            normalized_prompt in normalized_name or normalized_name in normalized_prompt
        ):
            return prompt
    return None


def _point_in_bbox(point: list[float], bbox: list[float]) -> bool:
    x, y = point
    x1, y1, x2, y2 = bbox
    return x1 <= x <= x2 and y1 <= y <= y2


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = area_a + area_b - inter
    return inter / denom if denom > 0 else 0.0


class InteractiveDecoderOnly(SAM3Predictor if SAM3Predictor is not None else object):
    """SAM3 interactive decoder that reuses semantic encoder features."""

    def __init__(self, overrides=None):
        if SAM3Predictor is None:
            raise RuntimeError(
                "SAM3 requires an Ultralytics build that exposes SAM3Predictor. "
                f"Import error: {SAM3_IMPORT_ERROR}"
            )
        old_cuda = os.environ.get("CUDA_VISIBLE_DEVICES")
        cpu_overrides = overrides.copy() if overrides else {}
        cpu_overrides["device"] = "cpu"
        super().__init__(overrides=cpu_overrides)

        if self.model is None:
            self.setup_model(None)

        if old_cuda is None:
            os.environ.pop("CUDA_VISIBLE_DEVICES", None)
        else:
            os.environ["CUDA_VISIBLE_DEVICES"] = old_cuda

        self.model.image_encoder = nn.Identity()
        gc.collect()

        self.target_device = torch.device(overrides.get("device", "cuda:0"))
        self.model.to(self.target_device)
        self.device = self.target_device
        if hasattr(self, "mean"):
            self.mean = self.mean.to(self.target_device)
        if hasattr(self, "std"):
            self.std = self.std.to(self.target_device)
        self.injected_features = None

    def get_im_features(self, im):
        if self.injected_features is None:
            raise ValueError("Interactive Predictor: features are not initialized.")
        return self.injected_features


class UnifiedSAM3Predcitor:
    """SAM3 semantic and interactive predictors behind one object."""

    def __init__(self, overrides):
        if SAM3SemanticPredictor is None:
            raise RuntimeError(
                "SAM3 requires an Ultralytics build that exposes SAM3SemanticPredictor. "
                f"Import error: {SAM3_IMPORT_ERROR}"
            )
        print("====== Loading Semantic Master Engine ======")
        self.semantic = SAM3SemanticPredictor(overrides=overrides)
        if self.semantic.model is None:
            self.semantic.setup_model(None)

        print("====== Loading Interactive Decoder (Shared VRAM) ======")
        self.interactive = InteractiveDecoderOnly(overrides=overrides)
        self.current_cv2_img = None

    def set_image(self, img_array):
        self.current_cv2_img = img_array
        self.semantic.set_image(img_array)

        semantic_feats = self.semantic.features
        sam2_feats = semantic_feats.get("sam2_backbone_out", semantic_feats)

        interactive_model = self.interactive.model
        if getattr(interactive_model, "use_high_res_features_in_sam", False):
            with torch.no_grad():
                fpn_feats = list(sam2_feats["backbone_fpn"])
                fpn_feats[0] = interactive_model.sam_mask_decoder.conv_s0(fpn_feats[0])
                fpn_feats[1] = interactive_model.sam_mask_decoder.conv_s1(fpn_feats[1])
                sam2_feats = {**sam2_feats, "backbone_fpn": fpn_feats}

        _, vision_feats, _, feat_sizes = interactive_model._prepare_backbone_features(
            sam2_feats
        )
        feats = [
            f.permute(1, 2, 0).view(1, -1, *fs)
            for f, fs in zip(vision_feats, feat_sizes)
        ]
        self.interactive.injected_features = {
            "image_embed": feats[-1],
            "high_res_feats": feats[:-1],
        }

    def __call__(self, **kwargs):
        kwargs["source"] = self.current_cv2_img
        kwargs["stream"] = False
        if kwargs.get("text"):
            return self.semantic(**kwargs)
        kwargs.pop("text", None)
        return self.interactive(**kwargs)


class SAM3Adapter:
    def __init__(self):
        self.predictor: UnifiedSAM3Predcitor | None = None

    @property
    def is_loaded(self):
        return self.predictor is not None

    def load(self, path: str, conf: float = 0.25):
        if SAM3Predictor is None or SAM3SemanticPredictor is None:
            raise RuntimeError(
                "SAM3 is not available in the installed Ultralytics package. "
                "Install the project's SAM3-compatible Ultralytics build or use a YOLO model. "
                f"Import error: {SAM3_IMPORT_ERROR}"
            )
        overrides = dict(
            conf=conf,
            task="segment",
            mode="predict",
            model=path,
            half=True,
            compile=False,
        )
        self.predictor = UnifiedSAM3Predcitor(overrides=overrides)

    def set_image(self, img_array: np.ndarray):
        if not self.predictor:
            raise RuntimeError("SAM3 model is not loaded.")
        self.predictor.set_image(img_array)

    def _reset_prompt_state(self):
        if not self.predictor:
            return
        for predictor in (
            self.predictor,
            self.predictor.semantic,
            self.predictor.interactive,
        ):
            if hasattr(predictor, "reset_prompts"):
                predictor.reset_prompts()
            if hasattr(predictor, "args"):
                predictor.args.text = None
                predictor.args.points = None
                predictor.args.labels = None
                predictor.args.bboxes = None

    def predict_interactive(
        self,
        points: Optional[list[list[float]]] = None,
        labels: Optional[list[int]] = None,
        box: Optional[list[float]] = None,
        conf: Optional[float] = 0.25,
    ) -> dict[str, list[Any]]:
        if not self.predictor:
            raise RuntimeError("SAM3 model is not loaded.")
        self._reset_prompt_state()
        sam_points = [points] if points else None
        sam_labels = [labels] if labels else None
        results = self.predictor(
            points=sam_points,
            labels=sam_labels,
            bboxes=box,
            conf=conf,
        )

        response_data: dict[str, list[Any]] = {"polygons": [], "bboxes": []}
        if not results:
            return response_data

        result = results[0]
        if result.masks is None or len(result.masks.data) == 0:
            return response_data

        best_mask_np = None
        img_h, img_w = result.orig_shape if hasattr(result, "orig_shape") else (644, 644)
        total_area = img_h * img_w

        for i in range(len(result.masks.data)):
            mask_np = result.masks.data[i].cpu().numpy()
            bbox = _mask_to_bbox(mask_np)
            if not bbox:
                continue
            area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            if area < total_area * 0.90:
                best_mask_np = mask_np
                break

        if best_mask_np is None:
            best_mask_np = result.masks.data[0].cpu().numpy()

        response_data["polygons"].extend(_mask_to_polygons(best_mask_np))
        bbox = _mask_to_bbox(best_mask_np)
        if bbox:
            response_data["bboxes"].append(bbox)
        return response_data

    def predict_auto(
        self, texts: Optional[list[str]] = None, conf: Optional[float] = 0.25
    ) -> dict[str, list[dict[str, Any]]]:
        if not self.predictor:
            raise RuntimeError("SAM3 model is not loaded.")
        self._reset_prompt_state()
        prompts = [text for text in (texts or []) if str(text).strip()]
        results = self.predictor(text=prompts, conf=conf)
        grouped: dict[str, dict[str, Any]] = {
            prompt: {"prompt": prompt, "polygons": [], "bboxes": []} for prompt in prompts
        }

        for result in results:
            if result.masks is None or result.boxes is None:
                continue
            for i in range(len(result.masks.data)):
                cls_id = int(result.boxes.cls[i].item())
                prompt_text = _name_from_result(result.names, cls_id)
                if prompt_text not in grouped:
                    grouped[prompt_text] = {
                        "prompt": prompt_text,
                        "polygons": [],
                        "bboxes": [],
                    }
                mask_np = result.masks.data[i].cpu().numpy()
                polys = _mask_to_polygons(mask_np)
                if polys:
                    grouped[prompt_text]["polygons"].extend(polys)
                bbox = _mask_to_bbox(mask_np)
                if bbox:
                    grouped[prompt_text]["bboxes"].append(bbox)

        return {
            "results": [
                group for group in grouped.values() if len(group["polygons"]) > 0
            ]
        }


class UltralyticsYOLOAdapter:
    def __init__(self, model_type: str):
        self.model_type = model_type
        self.model = None
        self.default_conf = 0.25
        self.current_cv2_img: np.ndarray | None = None

    @property
    def is_loaded(self):
        return self.model is not None

    def load(self, path: str, conf: float = 0.25):
        from ultralytics import YOLO

        self.model = YOLO(path)
        self.default_conf = conf

    def set_image(self, img_array: np.ndarray):
        self.current_cv2_img = img_array

    def _predict(self, conf: Optional[float]):
        if self.model is None:
            raise RuntimeError(f"{self.model_type} model is not loaded.")
        if self.current_cv2_img is None:
            raise RuntimeError("Image is not initialized for Vision AI.")
        return self.model.predict(
            source=self.current_cv2_img,
            conf=self.default_conf if conf is None else conf,
            verbose=False,
        )

    def _collect_detections(self, conf: Optional[float]) -> list[dict[str, Any]]:
        detections: list[dict[str, Any]] = []
        for result in self._predict(conf):
            if result.boxes is None or len(result.boxes) == 0:
                continue

            boxes = result.boxes.xyxy.cpu().numpy()
            class_ids = result.boxes.cls.cpu().numpy().astype(int)
            scores = result.boxes.conf.cpu().numpy() if result.boxes.conf is not None else []
            mask_polygons = []
            if result.masks is not None and getattr(result.masks, "xy", None) is not None:
                mask_polygons = result.masks.xy

            for i, bbox_np in enumerate(boxes):
                bbox = [float(v) for v in bbox_np.tolist()]
                cls_id = int(class_ids[i])
                class_name = _name_from_result(result.names, cls_id)
                polygon = None
                if i < len(mask_polygons):
                    mask_xy = np.asarray(mask_polygons[i])
                    if mask_xy.ndim == 2 and mask_xy.shape[0] >= 3:
                        polygon = [
                            {"x": float(x), "y": float(y)} for x, y in mask_xy[:, :2]
                        ]
                if polygon is None:
                    polygon = _bbox_to_polygon(bbox)
                detections.append(
                    {
                        "class_name": class_name,
                        "bbox": bbox,
                        "polygon": polygon,
                        "score": float(scores[i]) if i < len(scores) else None,
                    }
                )
        return detections

    def _filter_interactive(
        self,
        detections: list[dict[str, Any]],
        points: Optional[list[list[float]]],
        labels: Optional[list[int]],
        box: Optional[list[float]],
    ) -> list[dict[str, Any]]:
        positives = [
            point for point, label in zip(points or [], labels or []) if int(label) == 1
        ]
        negatives = [
            point for point, label in zip(points or [], labels or []) if int(label) == 0
        ]

        filtered = detections
        if box and len(box) >= 4:
            prompt_box = [float(v) for v in box[:4]]
            filtered = [
                det
                for det in filtered
                if _bbox_iou(det["bbox"], prompt_box) > 0.0
                or _point_in_bbox(
                    [
                        (det["bbox"][0] + det["bbox"][2]) / 2,
                        (det["bbox"][1] + det["bbox"][3]) / 2,
                    ],
                    prompt_box,
                )
            ]
        if positives:
            filtered = [
                det
                for det in filtered
                if any(_point_in_bbox(point, det["bbox"]) for point in positives)
            ]
        if negatives:
            filtered = [
                det
                for det in filtered
                if not any(_point_in_bbox(point, det["bbox"]) for point in negatives)
            ]
        return filtered

    def predict_interactive(
        self,
        points: Optional[list[list[float]]] = None,
        labels: Optional[list[int]] = None,
        box: Optional[list[float]] = None,
        conf: Optional[float] = 0.25,
    ) -> dict[str, list[Any]]:
        detections = self._filter_interactive(
            self._collect_detections(conf), points, labels, box
        )
        return {
            "polygons": [det["polygon"] for det in detections],
            "bboxes": [det["bbox"] for det in detections],
        }

    def predict_auto(
        self, texts: Optional[list[str]] = None, conf: Optional[float] = 0.25
    ) -> dict[str, list[dict[str, Any]]]:
        prompts = [text for text in (texts or []) if str(text).strip()]
        grouped: dict[str, dict[str, Any]] = {}
        for det in self._collect_detections(conf):
            prompt = _match_prompt(det["class_name"], prompts)
            if prompt is None:
                continue
            if prompt not in grouped:
                grouped[prompt] = {"prompt": prompt, "polygons": [], "bboxes": []}
            grouped[prompt]["polygons"].append(det["polygon"])
            grouped[prompt]["bboxes"].append(det["bbox"])
        return {"results": list(grouped.values())}


class LocateAnythingAdapter:
    @property
    def is_loaded(self):
        return False

    def load(self, path: str, conf: float = 0.25):
        raise RuntimeError(
            "LocateAnything is recognized by MultiAnno, but no official public "
            "code/model API is available in this repository. Provide NVIDIA's "
            "official implementation entrypoint before enabling inference."
        )


class InteractiveVisionEngine:
    def __init__(self):
        self.adapter: Any = None
        self.model_path = ""
        self.current_image_key = ""
        self.model_type = ""
        self.confidence = 0.25
        self.predictor = None

    @property
    def is_loaded(self):
        return self.adapter is not None and self.adapter.is_loaded

    @property
    def supported_models(self):
        return SUPPORTED_MODEL_TYPES

    def _create_adapter(self, model_type: str):
        if model_type == "SAM-3":
            return SAM3Adapter()
        if model_type in YOLO_MODEL_TYPES:
            return UltralyticsYOLOAdapter(model_type)
        if model_type == "LocateAnything":
            return LocateAnythingAdapter()
        raise ValueError(
            f"Unsupported Vision AI model type: {model_type}. "
            f"Supported: {', '.join(SUPPORTED_MODEL_TYPES)}"
        )

    def load_model(self, path: str, model_type: str, conf: float = 0.25):
        normalized_type = _normalize_model_type(model_type)
        if (
            self.model_path == path
            and self.model_type == normalized_type
            and self.is_loaded
            and self.confidence == conf
        ):
            return

        adapter = self._create_adapter(normalized_type)
        adapter.load(path, conf)
        self.adapter = adapter
        self.predictor = getattr(adapter, "predictor", None)
        self.model_path = path
        self.model_type = normalized_type
        self.confidence = conf
        self.current_image_key = ""

    def set_image(self, img_array: np.ndarray):
        if not self.is_loaded:
            raise RuntimeError("Vision AI model is not loaded.")
        self.adapter.set_image(img_array)

    def predict_interactive(
        self,
        points: Optional[list[list[float]]] = None,
        labels: Optional[list[int]] = None,
        box: Optional[list[float]] = None,
        conf: Optional[float] = None,
    ):
        if not self.is_loaded:
            raise RuntimeError("Vision AI model is not loaded.")
        return self.adapter.predict_interactive(points, labels, box, conf)

    def predict_auto(self, texts: Optional[list[str]] = None, conf: Optional[float] = None):
        if not self.is_loaded:
            raise RuntimeError("Vision AI model is not loaded.")
        return self.adapter.predict_auto(texts, conf)

    @staticmethod
    def mask_to_bbox(mask_array: np.ndarray):
        return _mask_to_bbox(mask_array)

    @staticmethod
    def mask_to_polygons(mask_array: np.ndarray, epsilon_factor: float = 0.002):
        return _mask_to_polygons(mask_array, epsilon_factor)
