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
from utils.ai_engine import InteractiveVisionEngine

router = APIRouter(prefix="/api/ai/vision", tags=["Vision AI"])


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
    if hasattr(vision_engine.predictor, "reset_prompts"):
        vision_engine.predictor.reset_prompts()  # 1. 调用官方方法清空 Embedding 缓存
    if hasattr(vision_engine.predictor, "args"):
        vision_engine.predictor.args.text = None  # 2. 强行抹除配置项中的文本记忆

    pts = [[[p.x, p.y] for p in req.points]] if req.points else None
    labels = [[p.label for p in req.points]] if req.points else None

    print(f"--> [AI Predict] Points: {pts}, Labels: {labels}, Box: {req.box}")
    try:
        # 直接推理，由于 set_image 已执行，这里耗时只有几十毫秒
        results = vision_engine.predictor(
            points=pts,
            labels=labels,
            bboxes=req.box,
            conf=req.conf,
        )

        result = results[0]
        response_data = {"polygons": [], "bboxes": []}

        if result.masks is not None and len(result.masks.data) > 0:
            best_mask_np = None

            # 获取原图尺寸，计算当前图片的物理总面积
            img_h, img_w = (
                result.orig_shape if hasattr(result, "orig_shape") else (644, 644)
            )
            total_area = img_h * img_w

            # 🌟 修复 2：智能防爆屏过滤 (Anti-Background Explosion)
            # 遍历 SAM 给出的所有候选 Mask
            for i in range(len(result.masks.data)):
                mask_np = result.masks.data[i].cpu().numpy()
                bbox = vision_engine.mask_to_bbox(mask_np)

                if bbox:
                    w = bbox[2] - bbox[0]
                    h = bbox[3] - bbox[1]
                    area = w * h

                    # 💡 核心逻辑：只要这个 Mask 面积小于整张图的 90%，
                    # 说明它是一个具体的物体，而不是“全屏背景”，直接采纳并跳出！
                    if area < total_area * 0.90:
                        best_mask_np = mask_np
                        break

            # 兜底逻辑：如果所有 Mask 都超过 90%（说明用户真的在选一个填满全屏的超级大物体）
            # 或者找不到符合条件的，就回退到使用分数最高的第一张
            if best_mask_np is None:
                best_mask_np = result.masks.data[0].cpu().numpy()

            # 解析多边形并返回
            response_data["polygons"].extend(
                vision_engine.mask_to_polygons(best_mask_np)
            )
            bbox = vision_engine.mask_to_bbox(best_mask_np)
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
    # 🌟🌟🌟 双保险强杀：清理上一次 Semi 任务的残留
    if hasattr(vision_engine.predictor, "reset_prompts"):
        vision_engine.predictor.reset_prompts()  # 1. 清空特征与 Prompt 缓存
    if hasattr(vision_engine.predictor, "args"):
        vision_engine.predictor.args.points = None  # 2. 强行抹除几何坐标记忆
        vision_engine.predictor.args.labels = None
        vision_engine.predictor.args.bboxes = None
    try:
        results = vision_engine.predictor(text=req.texts, conf=req.conf)

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
