import base64
import json
from pathlib import Path

import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from models import VisExportRequest, VisPreviewRequest
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


@router.post("/export")
async def vis_export(req: VisExportRequest):
    def generate_progress():
        try:
            engine = LocalVisualizer(config=req.render_settings)
            export_config = req.export_config
            save_path = Path(export_config.get("save_path"))

            modes = export_config.get("modes", {})
            save_independent = modes.get("independent", True)
            save_merged = modes.get("merged", False)
            layout_settings = export_config.get("layout_settings", {})

            configs = (
                req.view_configs if req.source_type == "project" else req.local_configs
            )

            # 1. 预创建文件夹
            save_path.mkdir(parents=True, exist_ok=True)
            if save_merged:
                (save_path / "fused").mkdir(parents=True, exist_ok=True)

            # 2. 批量循环处理
            total = len(req.all_stems)
            for idx, stem in enumerate(req.all_stems):
                # 渲染当前场景的所有独立图层
                layers_dict = engine.render_separated_layers(
                    stem, configs, req.anno_config, req.pred_configs
                )

                # --- A. 保存独立图层 ---
                if save_independent:
                    for layer_name, img_matrix in layers_dict.items():
                        # 清理非法路径字符
                        safe_folder = "".join(
                            [c if c.isalnum() else "_" for c in layer_name]
                        )
                        target_dir = save_path / safe_folder
                        target_dir.mkdir(parents=True, exist_ok=True)

                        cv2.imwrite(str(target_dir / f"{stem}.png"), img_matrix)

                # --- B. 保存合并拼图 ---
                if save_merged:
                    frames = list(layers_dict.values())
                    fused_img = engine.assemble_custom_layout(frames, layout_settings)
                    cv2.imwrite(str(save_path / "fused" / f"{stem}.png"), fused_img)

                progress = int(((idx + 1) / total) * 100)
                yield (
                    json.dumps(
                        {
                            "type": "progress",
                            "current": idx + 1,
                            "total": total,
                            "percent": progress,
                        }
                    )
                    + "\n"
                )

        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(generate_progress(), media_type="application/x-ndjson")
