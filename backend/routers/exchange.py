# backend/routers/exchange.py
import json
import os
import uuid
import warnings
from datetime import datetime
from pathlib import Path

import cv2  # 用于读取图片尺寸
from fastapi import APIRouter, HTTPException
from models import ExportRequest, ImportRequest  # 🌟 引入拆分后的极简模型
from skimage import io

# 🌟 从你完美的 format_converters 引入所有需要的纯函数
from utils.format_converters import (
    coco_ann_to_shape,  # <- 导入所需
    convert_to_coco_anns,
    convert_to_yolo,
    filter_multianno,
    mask_to_shapes,  # <- 新增
    render_mask_array,
    yolo_to_shapes,
)

router = APIRouter(prefix="/api/exchange", tags=["Data Exchange"])


# ==========================================
# 辅助类与函数
# ==========================================
class ExportReporter:
    def __init__(self, target_dir, generate_report=True):
        self.target_dir = target_dir
        self.generate_report = generate_report
        self.parent_dir = os.path.dirname(target_dir.rstrip("/\\")) or target_dir
        self.summary = {"total_scenes": 0, "native": 0, "converted": 0, "discarded": 0}
        self.details = {}

    def log_scene(self, scene_name, stats):
        self.summary["total_scenes"] += 1
        for k in ["native", "converted", "discarded"]:
            self.summary[k] += stats.get(k, 0)
        self.details[scene_name] = stats

    def save_report(self, task_type, format_name):
        if not self.generate_report:
            return
        report_path = os.path.join(self.parent_dir, "export_report.txt")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"=== Dataset Export Report ===\n")
            f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Task: {task_type.upper()} | Format: {format_name.upper()}\n\n")
            f.write("[Global Summary]\n")
            for k, v in self.summary.items():
                f.write(f"- {k}: {v}\n")


def get_native_jsons(source_dirs):
    jsons = []
    for d in source_dirs:
        if os.path.exists(d):
            jsons.extend(
                [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".json")]
            )
    return jsons


@router.get("/read_text")
async def read_text_file(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return {"content": f.read()}


# ==========================================
# 🌟 路由 1：导出接口 (/export)
# ==========================================
@router.post("/export")
async def handle_export(req: ExportRequest):
    if not os.path.exists(req.target_dir):
        os.makedirs(req.target_dir, exist_ok=True)

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


async def export_to_multianno(req: ExportRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    exported_count = 0
    for j_path in get_native_jsons(req.source_dirs):
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        base_stem = data.get("stem", Path(j_path).stem)
        filtered_shapes, stats = filter_multianno(
            data.get("shapes", []), req.selected_classes, req.allowed_shapes
        )
        if not filtered_shapes and len(data.get("shapes", [])) > 0:
            reporter.log_scene(base_stem, stats)
            continue
        data["shapes"] = filtered_shapes
        with open(
            os.path.join(
                req.target_dir, f"{base_stem}{req.custom_suffix}{req.extension}"
            ),
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        exported_count += 1
        reporter.log_scene(base_stem, stats)
    reporter.save_report(req.task_type, req.format)
    return {
        "status": "success",
        "message": f"MultiAnno: 成功导出 {exported_count} 个场景。",
    }


async def export_to_yolo(req: ExportRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    exported_count = 0
    for j_path in get_native_jsons(req.source_dirs):
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        base_stem = data.get("stem", Path(j_path).stem)
        yolo_lines, stats = convert_to_yolo(
            data.get("shapes", []),
            data.get("imageWidth", 1),
            data.get("imageHeight", 1),
            req.selected_classes,
            req.allowed_shapes,
            req.task_type,
        )
        if yolo_lines:
            with open(
                os.path.join(
                    req.target_dir, f"{base_stem}{req.custom_suffix}{req.extension}"
                ),
                "w",
            ) as tf:
                tf.write("\n".join(yolo_lines))
            exported_count += 1
        reporter.log_scene(base_stem, stats)
    reporter.save_report(req.task_type, req.format)
    with open(
        os.path.join(reporter.parent_dir, "classes.txt"), "w", encoding="utf-8"
    ) as cf:
        cf.write("\n".join(req.selected_classes))
    return {"status": "success", "message": f"YOLO: 生成 {exported_count} 个 txt。"}


async def export_to_coco(req: ExportRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    coco_dict = {
        "images": [],
        "annotations": [],
        "categories": [
            {"id": i, "name": name} for i, name in enumerate(req.selected_classes)
        ],
    }
    img_id, ann_id = 1, 1
    for j_path in get_native_jsons(req.source_dirs):
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        base_stem = data.get("stem", Path(j_path).stem)
        coco_dict["images"].append(
            {
                "id": img_id,
                "file_name": f"{base_stem}.jpg",
                "width": data.get("imageWidth", 1),
                "height": data.get("imageHeight", 1),
            }
        )
        anns, stats, ann_id = convert_to_coco_anns(
            data.get("shapes", []),
            img_id,
            ann_id,
            req.selected_classes,
            req.allowed_shapes,
        )
        coco_dict["annotations"].extend(anns)
        img_id += 1
        reporter.log_scene(base_stem, stats)
    reporter.save_report(req.task_type, req.format)
    with open(
        os.path.join(
            req.target_dir, f"instances_default{req.custom_suffix}{req.extension}"
        ),
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(coco_dict, f, ensure_ascii=False)
    return {"status": "success", "message": f"COCO: 成功导出 {img_id - 1} 张图的标注。"}


async def export_to_images_only(req: ExportRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)
    exported_count = 0
    for j_path in get_native_jsons(req.source_dirs):
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        base_stem = data.get("stem", Path(j_path).stem)
        img_w, img_h = data.get("imageWidth"), data.get("imageHeight")
        if not img_w or not img_h:
            continue
        mask, stats = render_mask_array(
            data.get("shapes", []),
            img_w,
            img_h,
            req.selected_classes,
            req.allowed_shapes,
        )
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            io.imsave(
                os.path.join(
                    req.target_dir, f"{base_stem}{req.custom_suffix}{req.extension}"
                ),
                mask,
                check_contrast=False,
            )
        exported_count += 1
        reporter.log_scene(base_stem, stats)
    reporter.save_report(req.task_type, req.format)
    with open(
        os.path.join(reporter.parent_dir, "classes.txt"), "w", encoding="utf-8"
    ) as cf:
        cf.write("\n".join(req.selected_classes))
    return {
        "status": "success",
        "message": f"语义分割: 成功渲染并导出 {exported_count} 张掩码图。",
    }


# ==========================================
# 🌟 路由 2：导入接口 (/import)
# ==========================================
@router.post("/import")
async def handle_import(req: ImportRequest):
    if not os.path.exists(req.target_dir):
        os.makedirs(req.target_dir, exist_ok=True)

    if req.format == "yolo":
        return await import_from_yolo(req)
    elif req.format == "coco":
        return await import_from_coco(req)
    # 🌟 新增的两种格式分发
    elif req.format == "multianno":
        return await import_from_multianno(req)
    elif req.format == "images_only":
        return await import_from_images_only(req)
    else:
        raise HTTPException(status_code=400, detail="不支持的导入格式")


async def import_from_yolo(req: ImportRequest):
    if not os.path.exists(req.source_path):
        raise HTTPException(status_code=404, detail="YOLO目录不存在")
    classes_map = []
    if req.classes_file and os.path.exists(req.classes_file):
        with open(req.classes_file, "r", encoding="utf-8") as f:
            classes_map = [line.strip() for line in f if line.strip()]

    imported_count = 0
    for txt_file in os.listdir(req.source_path):
        if not txt_file.endswith(".txt") or txt_file == "classes.txt":
            continue
        stem = Path(txt_file).stem
        base_stem = stem
        if req.custom_suffix and stem.endswith(req.custom_suffix):
            base_stem = stem[: -len(req.custom_suffix)]
        target_json = os.path.join(req.target_dir, f"{base_stem}.json")

        img_w, img_h = 1024, 1024
        existing_data = {"shapes": []}
        if os.path.exists(target_json):
            with open(target_json, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                img_w, img_h = (
                    existing_data.get("imageWidth", img_w),
                    existing_data.get("imageHeight", img_h),
                )
        else:
            for ext in [".jpg", ".png", ".bmp", ".tif"]:
                img_path = os.path.join(req.target_dir, f"{stem}{ext}")
                if os.path.exists(img_path):
                    img = cv2.imread(img_path)
                    if img is not None:
                        img_h, img_w = img.shape[:2]
                    break

        if req.merge_strategy == "skip" and existing_data.get("shapes"):
            continue
        if req.merge_strategy == "overwrite":
            existing_data["shapes"] = []

        with open(os.path.join(req.source_path, txt_file), "r", encoding="utf-8") as f:
            lines = f.readlines()
        new_shapes, _ = yolo_to_shapes(lines, img_w, img_h, classes_map)

        if new_shapes:
            existing_data["shapes"].extend(new_shapes)
            existing_data["stem"] = stem
            existing_data["imageWidth"], existing_data["imageHeight"] = img_w, img_h
            with open(target_json, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            imported_count += 1

    return {
        "status": "success",
        "message": f"成功导入 {imported_count} 张图像的 YOLO 标注。",
    }


async def import_from_coco(req: ImportRequest):
    if not os.path.exists(req.source_path) or not req.source_path.endswith(".json"):
        raise HTTPException(status_code=400, detail="COCO文件无效")
    with open(req.source_path, "r", encoding="utf-8") as f:
        coco_data = json.load(f)

    cat_map = {c["id"]: c["name"] for c in coco_data.get("categories", [])}
    img_info = {
        img["id"]: {
            "stem": Path(img["file_name"]).stem,
            "w": img.get("width", 1024),
            "h": img.get("height", 1024),
        }
        for img in coco_data.get("images", [])
    }

    grouped_anns = {}
    for ann in coco_data.get("annotations", []):
        grouped_anns.setdefault(ann["image_id"], []).append(ann)

    imported_count = 0
    for img_id, anns in grouped_anns.items():
        if img_id not in img_info:
            continue
        info = img_info[img_id]
        base_stem = info["stem"]
        if req.custom_suffix and info["stem"].endswith(req.custom_suffix):
            base_stem = info["stem"][: -len(req.custom_suffix)]
        target_json = os.path.join(req.target_dir, f"{base_stem}.json")

        existing_data = {"shapes": []}
        if os.path.exists(target_json):
            with open(target_json, "r", encoding="utf-8") as f:
                existing_data = json.load(f)

        if req.merge_strategy == "skip" and existing_data.get("shapes"):
            continue
        if req.merge_strategy == "overwrite":
            existing_data["shapes"] = []

        for ann in anns:
            shape = coco_ann_to_shape(ann, cat_map)
            if shape:
                existing_data["shapes"].append(shape)

        existing_data["stem"] = info["stem"]
        existing_data["imageWidth"], existing_data["imageHeight"] = info["w"], info["h"]
        with open(target_json, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        imported_count += 1

    return {
        "status": "success",
        "message": f"成功从 COCO 导入 {imported_count} 张图像的标注。",
    }


# ==========================================
# 🌟 新增：导入 MultiAnno
# ==========================================
async def import_from_multianno(req: ImportRequest):
    """
    直接导入原生的 JSON 标注文件，重点在于处理冲突合并策略、ID去重、以及 Stem 校准
    """
    if not os.path.exists(req.source_path):
        raise HTTPException(status_code=404, detail="源目录不存在")

    print(f"import_from {req.source_path}")
    imported_count = 0

    for json_file in os.listdir(req.source_path):
        if not json_file.endswith(".json"):
            continue

        file_stem = Path(json_file).stem

        # ==========================================
        # 🌟 修正 1：精准过滤源文件
        # 如果前端传了 _src2，我们就只认 _src2 结尾的文件，其余一律无视！
        # ==========================================
        if req.custom_suffix and not file_stem.endswith(req.custom_suffix):
            continue

        # ==========================================
        # 🌟 修正 2：拨乱反正！
        # base_stem 必须是剥离了后缀的纯净 scene group 名字
        # ==========================================
        base_stem = file_stem
        if req.custom_suffix:
            base_stem = file_stem[: -len(req.custom_suffix)]

        source_json_path = os.path.join(req.source_path, json_file)

        # 🌟 修正 3：目标路径必须是绝对纯净的 base_stem.json
        target_json_path = os.path.join(req.target_dir, f"{base_stem}.json")

        print(f"try to load {target_json_path} base {json_file}")

        # 🌟 增加一道保险：防止用户把 source 和 target 选成同一个文件夹导致死循环追加
        if (
            os.path.abspath(source_json_path) == os.path.abspath(target_json_path)
            and req.merge_strategy == "append"
        ):
            continue

        # 1. 读取外部 JSON
        with open(source_json_path, "r", encoding="utf-8") as f:
            source_data = json.load(f)

        # 2. 读取或初始化目标 JSON
        existing_data = {"shapes": []}
        if os.path.exists(target_json_path):
            with open(target_json_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)

        # 3. 冲突策略拦截
        if req.merge_strategy == "skip" and len(existing_data.get("shapes", [])) > 0:
            continue
        if req.merge_strategy == "overwrite":
            existing_data["shapes"] = []

        # 4. 执行合并写入 (核心修复区)
        new_shapes = source_data.get("shapes", [])
        if new_shapes:
            # Append 模式下绝对不能直接 extend，必须遍历赋予新 ID
            for shape in new_shapes:
                shape["id"] = str(uuid.uuid4())  # 强制生成全新、唯一的 UUID
                shape["stem"] = (
                    base_stem  # 强制将图形内部归属修正为不带后缀的工作区 Stem
                )
                existing_data["shapes"].append(shape)

            # 统一内部全局 stem 为纯净的 base_stem
            existing_data["stem"] = base_stem

            # 保留或更新宽高信息
            existing_data["imageWidth"] = source_data.get(
                "imageWidth", existing_data.get("imageWidth", 1024)
            )
            existing_data["imageHeight"] = source_data.get(
                "imageHeight", existing_data.get("imageHeight", 1024)
            )

            with open(target_json_path, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            imported_count += 1

    return {
        "status": "success",
        "message": f"成功合并导入 {imported_count} 个 MultiAnno 场景。",
    }


# ==========================================
# 🌟 新增：导入纯图像 (Semantic Mask 逆向解析)
# ==========================================
async def import_from_images_only(req: ImportRequest):
    """
    从灰度掩码图像中提取多边形
    """
    if not os.path.exists(req.source_path):
        raise HTTPException(status_code=404, detail="源目录不存在")

    # 掩码图中的像素值(0,1,2...)需要依赖 classes.txt 还原为真实的 Label 名称
    classes_map = []
    if req.classes_file and os.path.exists(req.classes_file):
        with open(req.classes_file, "r", encoding="utf-8") as f:
            classes_map = [line.strip() for line in f if line.strip()]

    if not classes_map:
        raise HTTPException(
            status_code=400, detail="导入掩码图必须提供有效的 classes.txt"
        )

    valid_exts = (".png", ".tif", ".bmp", ".jpg", ".jpeg")
    imported_count = 0

    for mask_file in os.listdir(req.source_path):
        if not mask_file.lower().endswith(valid_exts):
            continue

        stem = Path(mask_file).stem
        mask_path = os.path.join(req.source_path, mask_file)
        base_stem = stem
        if req.custom_suffix and stem.endswith(req.custom_suffix):
            base_stem = stem[: -len(req.custom_suffix)]
        target_json_path = os.path.join(req.target_dir, f"{base_stem}.json")

        # 读取或初始化目标 JSON
        existing_data = {"shapes": []}
        if os.path.exists(target_json_path):
            with open(target_json_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)

        # 冲突策略拦截
        if req.merge_strategy == "skip" and existing_data.get("shapes"):
            continue
        if req.merge_strategy == "overwrite":
            existing_data["shapes"] = []

        # 调用逆向提取引擎
        new_shapes, _, img_w, img_h = mask_to_shapes(mask_path, classes_map)

        if new_shapes:
            existing_data["shapes"].extend(new_shapes)
            existing_data["stem"] = stem
            existing_data["imageWidth"] = img_w
            existing_data["imageHeight"] = img_h

            with open(target_json_path, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            imported_count += 1

    return {
        "status": "success",
        "message": f"成功从 {imported_count} 张掩码图中逆向提取了多边形标注。",
    }
