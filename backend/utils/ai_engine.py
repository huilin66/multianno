# routers/engine.py
import gc
import os

import cv2
import numpy as np
import torch
import torch._dynamo
import torch.nn as nn
from ultralytics.models.sam.predict import SAM3Predictor, SAM3SemanticPredictor

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["TORCH_COMPILE_DISABLE"] = "1"
torch._dynamo.config.disable = True

_original_compile = torch.compile


class InteractiveVisionEngine:
    def __init__(self):
        self.engine = None
        self.model_path = ""
        self.current_image_key = ""
        self.model_type = ""

    @property
    def is_loaded(self):
        return self.engine is not None

    def load_model(self, path: str, model_type: str, conf: float = 0.25):
        if self.model_path == path and self.is_loaded:
            return

        overrides = dict(
            conf=conf,
            task="segment",
            mode="predict",
            model=path,
            half=True,
            compile=False,
        )
        # 实例化统一引擎
        self.predictor = UnifiedSAM3Predcitor(overrides=overrides)
        self.model_path = path
        self.engine = True

    @staticmethod
    def mask_to_bbox(mask_array: np.ndarray):
        coords = np.argwhere(mask_array > 0)
        if len(coords) == 0:
            return None
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        return [float(x_min), float(y_min), float(x_max), float(y_max)]

    @staticmethod
    def mask_to_polygons(mask_array: np.ndarray, epsilon_factor: float = 0.002):
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


def _safe_compile(model=None, **kwargs):
    if kwargs.get("mode") is False:
        kwargs["mode"] = "default"
    kwargs["disable"] = True
    return _original_compile(model, **kwargs)


torch.compile = _safe_compile


class InteractiveDecoderOnly(SAM3Predictor):
    """纯特征解码器：0 显存额外开销"""

    def __init__(self, overrides=None):
        old_cuda = os.environ.get("CUDA_VISIBLE_DEVICES")
        cpu_overrides = overrides.copy() if overrides else {}
        cpu_overrides["device"] = "cpu"
        super().__init__(overrides=cpu_overrides)

        if self.model is None:
            self.setup_model(None)

        # 恢复环境与狸猫换太子
        if old_cuda is None:
            os.environ.pop("CUDA_VISIBLE_DEVICES", None)
        else:
            os.environ["CUDA_VISIBLE_DEVICES"] = old_cuda

        self.model.image_encoder = nn.Identity()  # 替换掉 6GB 的主干
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
            raise ValueError("Interactive Predictor: 特征未注入！")
        return self.injected_features


class UnifiedSAM3Predcitor:
    """统一视觉引擎：完美融合 Semantic (Auto) 与 Interactive (Semi)"""

    def __init__(self, overrides):
        print("====== Loading Semantic Master Engine ======")
        self.semantic = SAM3SemanticPredictor(overrides=overrides)
        if self.semantic.model is None:
            self.semantic.setup_model(None)

        print("====== Loading Interactive Decoder (Shared VRAM) ======")
        self.interactive = InteractiveDecoderOnly(overrides=overrides)
        self.current_cv2_img = None

    def set_image(self, img_array):
        """核心：提取一次特征，喂饱两个 Predictor"""
        self.current_cv2_img = img_array
        self.semantic.set_image(img_array)

        # 获取 SAM2 格式特征
        semantic_feats = self.semantic.features
        sam2_feats = semantic_feats.get("sam2_backbone_out", semantic_feats)

        # 核心修复：高分辨率特征降维 (256 -> 32/64)
        interactive_model = self.interactive.model
        if getattr(interactive_model, "use_high_res_features_in_sam", False):
            with torch.no_grad():
                fpn_feats = list(sam2_feats["backbone_fpn"])
                fpn_feats[0] = interactive_model.sam_mask_decoder.conv_s0(fpn_feats[0])
                fpn_feats[1] = interactive_model.sam_mask_decoder.conv_s1(fpn_feats[1])
                sam2_feats = {**sam2_feats, "backbone_fpn": fpn_feats}

        # 依赖注入
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
        """根据传参自动路由：有 text 走语义，没 text 走互动"""
        kwargs["source"] = self.current_cv2_img
        kwargs["stream"] = False
        if kwargs.get("text"):
            return self.semantic(**kwargs)
        else:
            kwargs.pop("text", None)
            return self.interactive(**kwargs)
