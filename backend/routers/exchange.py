# backend/routers/exchange.py
import json
import os
import shutil

from fastapi import APIRouter, HTTPException
from models import ExchangeRequest

router = APIRouter(prefix="/api/exchange", tags=["Data Exchange"])


@router.post("/process")
async def process_data_exchange(req: ExchangeRequest):
    if not os.path.exists(req.target_dir):
        try:
            os.makedirs(req.target_dir)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"无法创建目标目录: {str(e)}")

    if req.mode == "export":
        return await export_data(req)
    else:
        return await import_data(req)


async def export_data(req: ExchangeRequest):
    # 1. 扫描所有原生 JSON 文件
    native_jsons = []
    for d in req.source_dirs:
        if os.path.exists(d):
            for f in os.listdir(d):
                if f.endswith(".json"):
                    native_jsons.append(os.path.join(d, f))

    exported_count = 0

    # 2. 依据格式执行不同逻辑
    if req.format == "multianno":
        # 原生格式直接拷贝 JSON 和对应的图片
        for j_path in native_jsons:
            shutil.copy(j_path, req.target_dir)
            exported_count += 1
            # TODO: 拷贝对应同名的图片 (tif/jpg/png)

    elif req.format == "image_only":
        # 纯净图片导出，丢弃所有标注（用于洗数据）
        # TODO: 仅拷贝图片到 target_dir
        pass

    elif req.format == "yolo":
        # YOLO 格式: 需要生成 classes.txt 和 normalized 的 .txt
        classes = []
        for j_path in native_jsons:
            with open(j_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            w, h = data.get("imageWidth", 1024), data.get("imageHeight", 1024)
            stem = data.get("stem", "unknown")

            yolo_lines = []
            for shape in data.get("shapes", []):
                label = shape.get("label")
                if label not in classes:
                    classes.append(label)
                class_id = classes.index(label)

                pts = shape.get("points", [])
                if shape.get("shape_type") in ["rectangle", "bbox"]:
                    # [class_id, x_center, y_center, width, height]
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    cx = sum(xs) / 2.0 / w
                    cy = sum(ys) / 2.0 / h
                    bw = abs(xs[1] - xs[0]) / w
                    bh = abs(ys[1] - ys[0]) / h
                    yolo_lines.append(f"{class_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
                else:
                    # YOLOv8 Polygon: [class_id, x1, y1, x2, y2...] (Normalized)
                    norm_pts = []
                    for pt in pts:
                        norm_pts.extend([f"{pt[0] / w:.6f}", f"{pt[1] / h:.6f}"])
                    yolo_lines.append(f"{class_id} " + " ".join(norm_pts))

            # 写入 .txt
            txt_path = os.path.join(req.target_dir, f"{stem}.txt")
            with open(txt_path, "w") as tf:
                tf.write("\n".join(yolo_lines))
            exported_count += 1

        # 写入 classes.txt
        with open(os.path.join(req.target_dir, "classes.txt"), "w") as f:
            f.write("\n".join(classes))

    elif req.format == "coco":
        # TODO: 构建标准的 COCO dict (images, annotations, categories) 然后 dump
        pass

    return {
        "status": "success",
        "message": f"Successfully exported {exported_count} items to {req.format} format.",
    }


async def import_data(req: ExchangeRequest):
    # TODO: 逆向逻辑，解析 YOLO/COCO 转为 MultiAnno Native JSON，并存入 source_dirs
    return {"status": "success", "message": "Import structure ready."}
