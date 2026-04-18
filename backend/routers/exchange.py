# backend/routers/exchange.py
import json
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from models import ExchangeRequest
from skimage import io

# 引入纯函数转换器
from utils.format_converters import (
    convert_to_coco_anns,
    convert_to_yolo,
    filter_multianno,
    render_mask_array,
)

router = APIRouter(prefix="/api/exchange", tags=["Data Exchange"])


class ExportReporter:
    def __init__(self, target_dir, generate_report=True):
        self.target_dir = target_dir
        self.generate_report = generate_report

        # 🌟 核心修改：计算目标文件夹的“同级（父目录）”
        # 使用 rstrip 去除末尾斜杠，确保 dirname 计算正确
        self.parent_dir = os.path.dirname(target_dir.rstrip("/\\"))
        # 如果路径已经是系统的根目录，则 fallback 回原来的目录
        if not self.parent_dir:
            self.parent_dir = target_dir

        self.summary = {"total_scenes": 0, "native": 0, "converted": 0, "discarded": 0}
        self.details = {}

    def log_scene(self, scene_name, stats):
        self.summary["total_scenes"] += 1
        self.summary["native"] += stats.get("native", 0)
        self.summary["converted"] += stats.get("converted", 0)
        self.summary["discarded"] += stats.get("discarded", 0)
        self.details[scene_name] = stats

    def save_report(self, task_type, format_name):
        if not self.generate_report:
            return

        # 🌟 核心修改：将报告存放到同级（父目录）
        report_path = os.path.join(self.parent_dir, "export_report.txt")

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"=== Dataset Export Report ===\n")
            f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Task: {task_type.upper()} | Format: {format_name.upper()}\n\n")

            f.write("[Global Summary]\n")
            f.write(f"- Total Scenes Processed: {self.summary['total_scenes']}\n")
            f.write(f"- Shapes Exported (Native): {self.summary['native']}\n")
            f.write(f"- Shapes Auto-Converted: {self.summary['converted']}\n")
            f.write(f"- Shapes Discarded: {self.summary['discarded']}\n\n")

            f.write("[Details by Scene Group]\n")
            for scene, stats in self.details.items():
                if (
                    stats["native"] > 0
                    or stats["converted"] > 0
                    or stats["discarded"] > 0
                ):
                    f.write(
                        f"- {scene}: Native({stats['native']}), Converted({stats['converted']}), Discarded({stats['discarded']})\n"
                    )


def get_native_jsons(source_dirs):
    jsons = []
    for d in source_dirs:
        if os.path.exists(d):
            jsons.extend(
                [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".json")]
            )
    return jsons


@router.post("/process")
async def process_data_exchange(req: ExchangeRequest):
    if not os.path.exists(req.target_dir):
        try:
            os.makedirs(req.target_dir)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"无法创建目标目录: {str(e)}")

    if req.mode == "export":
        if req.format == "multianno":
            return await export_to_multianno(req)
        elif req.format == "yolo":
            return await export_to_yolo(req)
        elif req.format == "coco":
            return await export_to_coco(req)
        elif req.format == "images_only":
            return await export_to_images_only(req)
        else:
            raise HTTPException(status_code=400, detail="不支持的导出格式")
    else:
        return {"status": "success", "message": "Import structure ready."}


# ==========================================
# 具体的导出调度逻辑 (I/O)
# ==========================================


async def export_to_multianno(req: ExchangeRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    native_jsons = get_native_jsons(req.source_dirs)
    exported_count = 0

    for j_path in native_jsons:
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        base_stem = data.get("stem", Path(j_path).stem)
        shapes = data.get("shapes", [])

        # 🌟 调用纯函数进行过滤
        filtered_shapes, stats = filter_multianno(
            shapes, req.selected_classes, req.allowed_shapes
        )

        if not filtered_shapes and len(shapes) > 0:
            reporter.log_scene(base_stem, stats)
            continue

        data["shapes"] = filtered_shapes
        target_name = f"{base_stem}{req.custom_suffix}{req.extension}"

        with open(
            os.path.join(req.target_dir, target_name), "w", encoding="utf-8"
        ) as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        exported_count += 1
        reporter.log_scene(base_stem, stats)

    reporter.save_report(req.task_type, req.format)
    return {
        "status": "success",
        "message": f"MultiAnno: 成功导出 {exported_count} 个场景。",
    }


async def export_to_yolo(req: ExchangeRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    native_jsons = get_native_jsons(req.source_dirs)
    exported_count = 0

    for j_path in native_jsons:
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        base_stem = data.get("stem", Path(j_path).stem)
        w, h = data.get("imageWidth", 1), data.get("imageHeight", 1)
        shapes = data.get("shapes", [])

        # 调用纯函数进行转换计算
        yolo_lines, stats = convert_to_yolo(
            shapes, w, h, req.selected_classes, req.allowed_shapes, req.task_type
        )

        if yolo_lines:
            target_name = f"{base_stem}{req.custom_suffix}{req.extension}"
            with open(os.path.join(req.target_dir, target_name), "w") as tf:
                tf.write("\n".join(yolo_lines))
            exported_count += 1

        reporter.log_scene(base_stem, stats)

    reporter.save_report(req.task_type, req.format)

    # 🌟 核心修改：计算父目录并把 classes.txt 放过去
    parent_dir = os.path.dirname(req.target_dir.rstrip("/\\"))
    if not parent_dir:
        parent_dir = req.target_dir

    with open(os.path.join(parent_dir, "classes.txt"), "w", encoding="utf-8") as cf:
        cf.write("\n".join(req.selected_classes))

    return {
        "status": "success",
        "message": f"YOLO: 生成 {exported_count} 个 txt，及 classes.txt。",
    }


async def export_to_coco(req: ExchangeRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    native_jsons = get_native_jsons(req.source_dirs)

    coco_dict = {
        "images": [],
        "annotations": [],
        "categories": [
            {"id": i, "name": name} for i, name in enumerate(req.selected_classes)
        ],
    }

    img_id_counter = 1
    ann_id_counter = 1

    for j_path in native_jsons:
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        base_stem = data.get("stem", Path(j_path).stem)
        w, h = data.get("imageWidth", 1), data.get("imageHeight", 1)
        shapes = data.get("shapes", [])

        coco_dict["images"].append(
            {
                "id": img_id_counter,
                "file_name": f"{base_stem}.jpg",
                "width": w,
                "height": h,
            }
        )

        # 🌟 调用纯函数生成 annotation
        anns, stats, ann_id_counter = convert_to_coco_anns(
            shapes,
            img_id_counter,
            ann_id_counter,
            req.selected_classes,
            req.allowed_shapes,
        )

        coco_dict["annotations"].extend(anns)
        img_id_counter += 1
        reporter.log_scene(base_stem, stats)

    reporter.save_report(req.task_type, req.format)
    target_json_name = f"instances_default{req.custom_suffix}{req.extension}"
    with open(
        os.path.join(req.target_dir, target_json_name), "w", encoding="utf-8"
    ) as f:
        json.dump(coco_dict, f, ensure_ascii=False)

    return {
        "status": "success",
        "message": f"COCO: 成功导出 {img_id_counter - 1} 张图的标注。",
    }


# ==========================================
# 🌟 纯图像导出 (语义分割 Mask 灰度图)
# ==========================================
async def export_to_images_only(req: ExchangeRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    native_jsons = get_native_jsons(req.source_dirs)
    exported_count = 0

    for j_path in native_jsons:
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        base_stem = data.get("stem", Path(j_path).stem)
        img_w = data.get("imageWidth")
        img_h = data.get("imageHeight")

        # 防御：如果没有物理尺寸记录，无法生成掩码
        if not img_w or not img_h:
            reporter.log_scene(
                base_stem,
                {"native": 0, "converted": 0, "discarded": len(data.get("shapes", []))},
            )
            continue

        shapes = data.get("shapes", [])

        # 🌟 调用 format_converters.py 中的纯函数进行矩阵渲染
        mask, stats = render_mask_array(
            shapes, img_w, img_h, req.selected_classes, req.allowed_shapes
        )

        # 拼接文件名：原名 + 填写的后缀(如有) + .tif/.png 等格式扩展名
        target_name = f"{base_stem}{req.custom_suffix}{req.extension}"
        target_path = os.path.join(req.target_dir, target_name)

        io.imsave(target_path, mask, check_contrast=False)

        exported_count += 1
        reporter.log_scene(base_stem, stats)

    reporter.save_report(req.task_type, req.format)

    # 生成 classes.txt 到同级父目录，供模型训练时对照 ID
    parent_dir = os.path.dirname(req.target_dir.rstrip("/\\"))
    if not parent_dir:
        parent_dir = req.target_dir

    with open(os.path.join(parent_dir, "classes.txt"), "w", encoding="utf-8") as cf:
        cf.write("\n".join(req.selected_classes))

    return {
        "status": "success",
        "message": f"语义分割: 成功渲染并导出 {exported_count} 张灰度掩码图 ({req.extension})。",
    }


@router.get("/read_text")
async def read_text_file(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
