import base64

import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from models import ExportRequest, VisPreviewRequest  # 确保导入了 ExportRequest
from utils.visualizer import LocalVisualizer

router = APIRouter(prefix="/api/vis", tags=["Visualization"])


@router.post("/preview")
async def vis_preview(req: VisPreviewRequest):
    try:
        # 1. 提取配置
        configs = (
            req.view_configs if req.source_type == "project" else req.local_configs
        )
        if not configs:
            raise ValueError("没有提供任何视图配置")

        # 2. 实例化引擎
        engine = LocalVisualizer(config=req.render_settings)

        # 3. 获取分离的渲染层字典 (Numpy Arrays)
        layers_dict = engine.render_separated_layers(
            req.stem, configs, req.anno_config, req.pred_configs
        )

        # 4. 编码所有图层为 Base64
        b64_images = {}
        for layer_name, img_matrix in layers_dict.items():
            success, buffer = cv2.imencode(
                ".jpg", img_matrix, [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            if success:
                b64_str = base64.b64encode(buffer).decode("utf-8")
                b64_images[layer_name] = f"data:image/jpeg;base64,{b64_str}"

        # 🌟 核心修复：处理“合并拼图”预览请求 (对应前端的 handleApplyLayout)
        # 获取前端传来的 export_config (对应 VisPreviewRequest 中新增的字段)
        # 注意：你需要确保 models.py 中的 VisPreviewRequest 已经添加了 export_config: Optional[Dict]
        export_cfg = getattr(req, "export_config", None)

        if export_cfg and export_cfg.get("modes", {}).get("merged"):
            layout_settings = export_cfg.get("layout_settings", {})
            frames = list(layers_dict.values())

            # 调用 visualizer.py 中的拼图引擎
            fused_img = engine.assemble_custom_layout(frames, layout_settings)

            success, buffer = cv2.imencode(
                ".jpg", fused_img, [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            if success:
                b64_str = base64.b64encode(buffer).decode("utf-8")
                # 🌟 键名必须是 fused_result，匹配前端解构
                b64_images["fused_result"] = f"data:image/jpeg;base64,{b64_str}"

        # 🌟 核心修复：返回字段名统一为 preview_images
        return JSONResponse(content={"status": "success", "preview_images": b64_images})

    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"渲染引擎错误: {str(e)}")
