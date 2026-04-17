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

    report_data = {
        "summary": {
            "total_scenes": len(native_jsons),
            "total_exported_shapes": 0,
            "total_converted_shapes": 0,
            "total_discarded_shapes": 0,
        },
        "details": {},  # 按 scene_group 或 stem 记录详细数据
    }

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
            group_id = data.get("group_id", "unassigned")
            scene_key = f"Group: {group_id} | Scene: {stem}"

            report_data["details"][scene_key] = {
                "exported": 0,
                "converted": 0,
                "discarded": 0,
            }

            yolo_lines = []
            for shape in data.get("shapes", []):
                label = shape.get("label")
                if label not in classes:
                    classes.append(label)
                class_id = classes.index(label)

                shape_type = shape.get("shape_type")
                # 🌟 核心：判断导出、转换还是丢弃
                if shape_type in ["rectangle", "bbox"]:
                    # 完美匹配 YOLO 检测框
                    report_data["details"][scene_key]["exported"] += 1
                    report_data["summary"]["total_exported_shapes"] += 1
                    # ... (YOLO 计算与 append) ...

                elif shape_type in ["polygon", "cuboid"]:
                    # 降维转换：比如多边形转外接矩形
                    report_data["details"][scene_key]["converted"] += 1
                    report_data["summary"]["total_converted_shapes"] += 1
                    # ... (执行提取 min_x, max_x 等转换逻辑) ...

                else:
                    # 无法转换的形状（如 Point），丢弃
                    report_data["details"][scene_key]["discarded"] += 1
                    report_data["summary"]["total_discarded_shapes"] += 1

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
        # 🌟 报告生成逻辑
        if req.generate_report:
            report_path = os.path.join(req.target_dir, "export_report.txt")
            with open(report_path, "w", encoding="utf-8") as rf:
                rf.write("=========================================\n")
                rf.write("        Data Export Report\n")
                rf.write("=========================================\n\n")
                rf.write("[Summary]\n")
                rf.write(f"- Target Format: {req.format.upper()}\n")
                rf.write(
                    f"- Total Scenes Processed: {report_data['summary']['total_scenes']}\n"
                )
                rf.write(
                    f"- Shapes Exported (Native): {report_data['summary']['total_exported_shapes']}\n"
                )
                rf.write(
                    f"- Shapes Converted: {report_data['summary']['total_converted_shapes']}\n"
                )
                rf.write(
                    f"- Shapes Discarded: {report_data['summary']['total_discarded_shapes']}\n\n"
                )

                rf.write("[Details by Scene]\n")
                for scene, stats in report_data["details"].items():
                    if (
                        stats["exported"] > 0
                        or stats["converted"] > 0
                        or stats["discarded"] > 0
                    ):
                        rf.write(f"- {scene}\n")
                        rf.write(
                            f"    Exported: {stats['exported']} | Converted: {stats['converted']} | Discarded: {stats['discarded']}\n"
                        )
    return {
        "status": "success",
        "message": f"Successfully exported {exported_count} items to {req.format} format.",
    }


async def import_data(req: ExchangeRequest):
    # TODO: 逆向逻辑，解析 YOLO/COCO 转为 MultiAnno Native JSON，并存入 source_dirs
    return {"status": "success", "message": "Import structure ready."}
