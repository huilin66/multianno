# routers/ai.py
import base64

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from models import (
    AIConfigRequest,
    SAMAutoRequest,
    SAMInitRequest,
    SAMInteractiveRequest,
)
from utils.image_io import is_raw_image, render_preview_rgb

try:
    from utils.ai_engine import InteractiveVisionEngine
except (ImportError, OSError) as exc:
    InteractiveVisionEngine = None
    AI_IMPORT_ERROR = exc
else:
    AI_IMPORT_ERROR = None

router = APIRouter(prefix="/api/ai/vision", tags=["Vision AI"])


vision_engine = InteractiveVisionEngine() if InteractiveVisionEngine else None


def _ai_unavailable_detail() -> str:
    detail = "Vision AI dependencies are not installed. Install backend AI/GPU requirements to enable this feature."
    if AI_IMPORT_ERROR:
        detail += f" Missing dependency: {AI_IMPORT_ERROR}"
    return detail


def _require_vision_engine():
    if vision_engine is None:
        raise HTTPException(status_code=503, detail=_ai_unavailable_detail())
    return vision_engine


def _read_ai_image(image_path: str):
    if not image_path:
        return None
    img = None if is_raw_image(image_path) else cv2.imread(image_path)
    if img is not None:
        return img
    rgb = render_preview_rgb(image_path)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


@router.get("/status")
async def get_engine_status():
    if vision_engine is None:
        return {
            "is_available": False,
            "is_loaded": False,
            "model_path": "",
            "model_type": "",
            "supported_models": [],
            "detail": _ai_unavailable_detail(),
        }

    return {
        "is_available": True,
        "is_loaded": vision_engine.is_loaded,
        "model_path": vision_engine.model_path,
        "model_type": vision_engine.model_type,
        "supported_models": vision_engine.supported_models,
    }


@router.post("/config")
async def update_ai_config(req: AIConfigRequest):
    engine = _require_vision_engine()
    try:
        engine.load_model(req.model_path, req.model_type, req.confidence)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/init")
async def init_image(req: SAMInitRequest):
    """
    🌟 阶段 2：提取特征 (前端点击 Confirm)
    只做一次 set_image，显存只在这里增加。
    """
    engine = _require_vision_engine()
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Vision AI 尚未装载")
    if not req.image_path and not req.image_data:
        raise HTTPException(status_code=400, detail="必须提供 image_path 或 image_data")

    try:
        cache_key = req.image_path or "base64_temp_image"
        if engine.current_image_key == cache_key:
            return {"status": "success", "msg": "Features already cached"}

        # 1. 读取图像 (无论是 Base64 还是本地路径，此时都是未经裁剪的全尺寸大图)
        if req.image_data:
            header, encoded = req.image_data.split(",", 1)
            data = base64.b64decode(encoded)
            nparr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            img = _read_ai_image(req.image_path)
        if img is None:
            raise ValueError("Failed to read image for AI initialization.")

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

        # 3. 动态更新模型内部缓存以匹配前端尺寸
        engine.set_image(img)
        engine.current_image_key = cache_key
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
    engine = _require_vision_engine()
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Vision AI 尚未装载")

    # 兜底：如果前端忘记点 Confirm，这里自动补救
    if engine.current_image_key != req.image_path:
        engine.set_image(_read_ai_image(req.image_path))
        engine.current_image_key = req.image_path

    pts = [[p.x, p.y] for p in req.points] if req.points else None
    labels = [p.label for p in req.points] if req.points else None

    print(f"--> [AI Predict] Points: {pts}, Labels: {labels}, Box: {req.box}")
    try:
        response_data = engine.predict_interactive(
            points=pts,
            labels=labels,
            box=req.box,
            conf=req.conf,
        )
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
    engine = _require_vision_engine()
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Vision AI 尚未装载")

    # 兜底：如果特征图没缓存，自动补救
    if engine.current_image_key != req.image_path:
        engine.set_image(_read_ai_image(req.image_path))
        engine.current_image_key = req.image_path
    try:
        return engine.predict_auto(texts=req.texts, conf=req.conf)

    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
