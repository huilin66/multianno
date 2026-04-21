import base64

import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from models import VisPreviewRequest
from utils.visualizer import LocalVisualizer

router = APIRouter(prefix="/api/vis", tags=["Visualization"])


@router.post("/preview")
async def vis_preview(req: VisPreviewRequest):
    print("====== 🚀 收到新的渲染请求 ======")
    print(f"Stem: {req.stem}")
    print(f"Anno Config (GT): {req.anno_config}")
    print(f"Pred Configs: {req.pred_configs}")
    print("===================================")
    try:
        # 1. 提取配置
        configs = (
            req.view_configs if req.source_type == "project" else req.local_configs
        )
        if not configs:
            raise ValueError(
                "没有提供任何视图配置 (view_configs 或 local_configs 为空)"
            )

        # 2. 实例化引擎
        engine = LocalVisualizer(config=req.render_settings)

        # 3. 🌟 核心升级：获取分离的渲染层字典 (Numpy Arrays)
        layers_dict = engine.render_separated_layers(
            req.stem, configs, req.anno_config, req.pred_configs
        )

        # 4. 🌟 将所有 Numpy 矩阵编码为 Base64 字符串
        b64_images = {}
        for layer_name, img_matrix in layers_dict.items():
            # 压缩为 JPEG 以提升传输速度
            success, buffer = cv2.imencode(
                ".jpg", img_matrix, [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            if success:
                # 拼接成 Data URL 格式，前端可以直接放入 <img src="..."> 中
                b64_str = base64.b64encode(buffer).decode("utf-8")
                b64_images[layer_name] = f"data:image/jpeg;base64,{b64_str}"

        # 5. 🌟 包装成 JSON 返回
        return JSONResponse(content={"status": "success", "images": b64_images})

    except Exception as e:
        import traceback

        traceback.print_exc()  # 打印完整的错误堆栈到控制台
        raise HTTPException(status_code=500, detail=f"渲染引擎错误: {str(e)}")
