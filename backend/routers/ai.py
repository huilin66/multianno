# routers/ai.py
import base64
import gc
import os

import cv2
import numpy as np
import torch
from fastapi import APIRouter, HTTPException
from models import (
    AIConfigRequest,
    SAMAutoRequest,
    SAMInitRequest,
    SAMInteractiveRequest,
)

os.environ["KMP_DUPLICATE_LIB_OK"] = "True"
router = APIRouter(prefix="/api/ai/vision", tags=["Vision AI"])


class InteractiveVisionEngine:
    """
    终极版视觉引擎：严格映射前端交互逻辑。
    全局唯一维护一个 SAM3SemanticPredictor 实例。
    """

    def __init__(self):
        self.predictor = None
        self.model_path = ""
        self.model_type = ""
        self.current_image_key = ""  # 记录当前缓存在显存中的图片标识

    @property
    def is_loaded(self):
        return self.predictor is not None

    def load_model(self, path: str, model_type: str, conf: float = 0.25):
        if not os.path.exists(path):
            raise FileNotFoundError(f"模型文件不存在: {path}")

        if self.model_path == path and self.is_loaded:
            return

        # 🌟 阶段 1：装载模型。暴力清理旧模型，确保显存绝对安全
        if self.predictor is not None:
            del self.predictor
            self.predictor = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        print(f"Initializing SAM3 Semantic Predictor with model: {path}")
        from ultralytics.models.sam import SAM3SemanticPredictor

        # 核心：将全局唯一的预测器实例化
        overrides = dict(
            conf=conf,
            task="segment",
            mode="predict",
            model=path,
            half=True,  # 使用 FP16 节省一半显存并加速
            save=False,
            show=False,
        )
        self.predictor = SAM3SemanticPredictor(overrides=overrides)
        self.model_path = path
        self.model_type = model_type
        self.current_image_key = ""  # 模型切换，强制失效旧图片缓存

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


# 全局唯一引擎实例
vision_engine = InteractiveVisionEngine()


@router.get("/status")
async def get_engine_status():
    return {
        "is_loaded": vision_engine.is_loaded,
        "model_path": vision_engine.model_path,
        "model_type": vision_engine.model_type,
    }


@router.post("/config")
async def update_ai_config(req: AIConfigRequest):
    try:
        vision_engine.load_model(req.model_path, req.model_type, req.confidence)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/init")
async def init_image(req: SAMInitRequest):
    """
    🌟 阶段 2：提取特征 (前端点击 Confirm)
    只做一次 set_image，显存只在这里增加。
    """
    if not vision_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Vision AI 尚未装载")
    if not req.image_path and not req.image_data:
        raise HTTPException(status_code=400, detail="必须提供 image_path 或 image_data")

    try:
        cache_key = req.image_path or "base64_temp_image"

        # 如果是同一张图，直接跳过，保护显存！
        if vision_engine.current_image_key == cache_key:
            return {"status": "success", "msg": "Features already cached"}

        # 1. 读取图像 (无论是 Base64 还是本地路径，此时都是未经裁剪的全尺寸大图)
        if req.image_data:
            header, encoded = req.image_data.split(",", 1)
            data = base64.b64decode(encoded)
            nparr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            img = cv2.imread(req.image_path)

        # 🌟 核心修复：将裁剪逻辑提取到公共区域！无论数据源是什么，必须先切片！
        print(
            f"--> [AI Init] Crop: {req.crop_x}, {req.crop_y}, {req.crop_w}, {req.crop_h}"
        )
        if req.crop_w and req.crop_h:
            x, y = int(req.crop_x), int(req.crop_y)
            w, h = int(req.crop_w), int(req.crop_h)

            # 增加边界安全锁，防止前端由于精度问题传了超出原图尺寸的坐标
            img_h, img_w = img.shape[:2]
            y_end = min(y + h, img_h)
            x_end = min(x + w, img_w)

            # 使用 Numpy 进行物理切片
            img = img[max(0, y) : y_end, max(0, x) : x_end]

        print(f"--> [AI Init] Extracting features. Image size: {req.image_size or 644}")

        # 2. 对已经裁剪好的精准区域，进行缩放以满足 AI 的 Inference Size
        if req.image_size and req.image_size > 0:
            h, w = img.shape[:2]
            scale = req.image_size / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

        # 3. 动态更新 predictor 的内部参数以匹配前端尺寸
        vision_engine.predictor.args.imgsz = req.image_size or 644

        # 4. 调用底层 set_image 提取特征
        vision_engine.predictor.set_image(img)
        vision_engine.current_image_key = cache_key

        return {"status": "success"}
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Init Error: {str(e)}")


@router.post("/predict")
async def predict_interactive(req: SAMInteractiveRequest):
    """
    🌟 阶段 3A：交互式推理 (Semi 工具: 点 / 框)
    直接调用已缓存特征的 predictor，极速响应。
    """
    if not vision_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Vision AI 尚未装载")

    # 兜底：如果前端忘记点 Confirm，这里自动补救
    if vision_engine.current_image_key != req.image_path:
        vision_engine.predictor.set_image(req.image_path)
        vision_engine.current_image_key = req.image_path

    pts = [[p.x, p.y] for p in req.points] if req.points else None
    labels = [p.label for p in req.points] if req.points else None
    print(f"--> [AI Predict] Points: {pts}, Labels: {labels}, Box: {req.box}")
    try:
        # 直接推理，由于 set_image 已执行，这里耗时只有几十毫秒
        results = vision_engine.predictor(
            points=pts,
            labels=labels,
            bboxes=req.box,
            conf=req.conf,
            verbose=False,
        )

        result = results[0]
        response_data = {"polygons": [], "bboxes": []}

        if result.masks is not None:
            for i in range(len(result.masks.data)):
                mask_np = result.masks.data[i].cpu().numpy()
                response_data["polygons"].extend(
                    vision_engine.mask_to_polygons(mask_np)
                )
                bbox = vision_engine.mask_to_bbox(mask_np)
                if bbox:
                    response_data["bboxes"].append(bbox)
        print(f"--> [AI Predict] Result: {response_data}")
        return response_data
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto")
async def predict_auto(req: SAMAutoRequest):
    """
    🌟 阶段 3B：文本推理 (Auto 工具: Text Prompt)
    重构版：返回结构已改为 {"results": [{"prompt": "window", "polygons": [...]}, ...]}
    """
    if not vision_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Vision AI 尚未装载")

    # 兜底：如果特征图没缓存，自动补救
    if vision_engine.current_image_key != req.image_path:
        vision_engine.predictor.set_image(req.image_path)
        vision_engine.current_image_key = req.image_path

    try:
        results = vision_engine.predictor(
            text=req.texts,
            conf=req.conf,
            verbose=False,
        )

        # 🌟 1. 初始化一个字典，用来按 prompt 收集多边形
        grouped_polygons = {text: [] for text in req.texts}

        for result in results:
            if result.masks is not None and result.boxes is not None:
                # 这里的 names_data 可能是 dict，也可能是 list
                names_data = result.names

                for i in range(len(result.masks.data)):
                    # 1. 提取当前 mask 对应的类别 ID
                    cls_id = int(result.boxes.cls[i].item())

                    # 🌟 2. 核心修复：兼容 list 和 dict 两种情况
                    if isinstance(names_data, dict):
                        prompt_text = names_data.get(cls_id, "unknown")
                    elif isinstance(names_data, list):
                        prompt_text = (
                            names_data[cls_id]
                            if 0 <= cls_id < len(names_data)
                            else "unknown"
                        )
                    else:
                        prompt_text = "unknown"

                    # 3. 提取并转换坐标
                    mask_np = result.masks.data[i].cpu().numpy()
                    polys = vision_engine.mask_to_polygons(mask_np)

                    if polys:
                        if prompt_text not in grouped_polygons:
                            grouped_polygons[prompt_text] = []
                        grouped_polygons[prompt_text].extend(polys)

        # 🌟 3. 组装为前端需要的、带签名的结构体数组
        final_results = []
        for prompt, polys in grouped_polygons.items():
            # 只有当该 prompt 真的识别到了多边形，才放进返回列表里
            if len(polys) > 0:
                final_results.append({"prompt": prompt, "polygons": polys})

        return {"results": final_results}

    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
