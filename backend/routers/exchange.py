# backend/routers/exchange.py
import json
import os
import random
import uuid
import warnings
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import tifffile
from fastapi import APIRouter, HTTPException
from models import ExportRequest, ImportRequest
from PIL import Image
from skimage import io
from utils.format_converters import (
    coco_ann_to_shape,
    convert_to_coco_anns,
    convert_to_yolo,
    filter_multianno,
    mask_to_shapes,
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
            f.write("=== Dataset Export Report ===\n")
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

    if req.export_mode == "dataset":
        return await export_dataset(req)

    if req.format == "multianno":
        return await export_to_multianno(req)
    elif req.format == "yolo":
        return await export_to_yolo(req)
    elif req.format == "coco":
        return await export_to_coco(req)
    elif req.format == "mask":
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
# 🌟 镜像模式清洗器
# ==========================================
def apply_mirror_cleanup(target_dir: str, processed_stems: set) -> int:
    """
    遍历目标文件夹，如果某个 scene 不在 processed_stems (外部源) 中，
    则将其标注完全清空，实现绝对镜像同步。
    """
    cleaned_count = 0
    for f_name in os.listdir(target_dir):
        if not f_name.endswith(".json"):
            continue
        base_stem = Path(f_name).stem
        if base_stem not in processed_stems:
            target_json = os.path.join(target_dir, f_name)
            try:
                with open(target_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if len(data.get("shapes", [])) > 0:
                    data["shapes"] = []
                    with open(target_json, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    cleaned_count += 1
            except Exception:
                pass
    return cleaned_count


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
    processed_stems = set()
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
        if req.merge_strategy in ["overwrite", "mirror"]:
            existing_data["shapes"] = []
        processed_stems.add(base_stem)

        with open(os.path.join(req.source_path, txt_file), "r", encoding="utf-8") as f:
            lines = f.readlines()
        new_shapes, _ = yolo_to_shapes(lines, img_w, img_h, classes_map)

        if new_shapes:
            existing_data["shapes"].extend(new_shapes)
            existing_data["stem"] = base_stem
            existing_data["imageWidth"], existing_data["imageHeight"] = img_w, img_h
            with open(target_json, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            imported_count += 1

    cleaned_count = 0
    if req.merge_strategy == "mirror":
        cleaned_count = apply_mirror_cleanup(req.target_dir, processed_stems)

    # 🌟 修改：返回信息中带上清理数量
    msg = f"成功合并导入 {imported_count} 个 YOLO 场景。"
    if req.merge_strategy == "mirror":
        msg += f" 镜像清理了 {cleaned_count} 个场景。"

    return {
        "status": "success",
        "message": msg,
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
    processed_stems = set()
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
        if req.merge_strategy in ["overwrite", "mirror"]:
            existing_data["shapes"] = []
        processed_stems.add(base_stem)

        for ann in anns:
            shape = coco_ann_to_shape(ann, cat_map, req.coco_mode)
            if shape:
                existing_data["shapes"].append(shape)

        existing_data["stem"] = base_stem
        existing_data["imageWidth"], existing_data["imageHeight"] = info["w"], info["h"]
        with open(target_json, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        imported_count += 1

    cleaned_count = 0
    if req.merge_strategy == "mirror":
        cleaned_count = apply_mirror_cleanup(req.target_dir, processed_stems)

    # 🌟 修改：返回信息中带上清理数量
    msg = f"成功合并导入 {imported_count} 个 COCO 场景。"
    if req.merge_strategy == "mirror":
        msg += f" 镜像清理了 {cleaned_count} 个场景。"

    return {
        "status": "success",
        "message": msg,
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

    imported_count = 0
    processed_stems = set()
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
        if req.merge_strategy in ["overwrite", "mirror"]:
            existing_data["shapes"] = []

        processed_stems.add(base_stem)

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

    cleaned_count = 0
    if req.merge_strategy == "mirror":
        cleaned_count = apply_mirror_cleanup(req.target_dir, processed_stems)

    # 🌟 修改：返回信息中带上清理数量
    msg = f"成功合并导入 {imported_count} 个 MultiAnno 场景。"
    if req.merge_strategy == "mirror":
        msg += f" 镜像清理了 {cleaned_count} 个场景。"

    return {
        "status": "success",
        "message": msg,
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
    processed_stems = set()
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
        if req.merge_strategy in ["overwrite", "mirror"]:
            existing_data["shapes"] = []
        processed_stems.add(base_stem)
        # 调用逆向提取引擎
        new_shapes, _, img_w, img_h = mask_to_shapes(
            mask_path, classes_map, import_zero_class=req.import_zero_class
        )

        if new_shapes:
            existing_data["shapes"].extend(new_shapes)
            existing_data["stem"] = base_stem
            existing_data["imageWidth"] = img_w
            existing_data["imageHeight"] = img_h

            with open(target_json_path, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            imported_count += 1

    cleaned_count = 0
    if req.merge_strategy == "mirror":
        cleaned_count = apply_mirror_cleanup(req.target_dir, processed_stems)

    # 🌟 修改：返回信息中带上清理数量
    msg = f"成功逆向提取并导入 {imported_count} 个掩码图标注。"
    if req.merge_strategy == "mirror":
        msg += f" 镜像清理了 {cleaned_count} 个场景。"

    return {
        "status": "success",
        "message": msg,
    }


async def export_dataset(req: ExportRequest):
    reporter = ExportReporter(req.target_dir, req.generate_report)

    stems = req.stems if req.stems else _collect_all_stems(req.source_dirs)
    if not stems:
        raise HTTPException(status_code=400, detail="未找到任何场景")

    # 1. 随机分割
    random.seed(req.random_seed)
    shuffled = sorted(stems)
    random.shuffle(shuffled)

    n_train = int(len(shuffled) * req.split.get("train", 80) / 100)
    n_val = int(len(shuffled) * req.split.get("val", 15) / 100)

    train_stems = shuffled[:n_train]
    val_stems = shuffled[n_train : n_train + n_val]
    test_stems = shuffled[n_train + n_val :]

    # 2. 创建目录（平层，不分子文件夹）
    anno_dir = os.path.join(req.target_dir, req.anno_subdir)
    os.makedirs(anno_dir, exist_ok=True)

    for vc in req.view_configs:
        d = os.path.join(req.target_dir, vc.subdir)
        os.makedirs(d, exist_ok=True)

    # 3. 导出标注 + 复制图像
    exported_count = 0
    for j_path in get_native_jsons(req.source_dirs):
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        stem = data.get("stem", Path(j_path).stem)
        if stem not in shuffled:
            continue  # 不在当前批次，跳过

        # 导出标注
        _export_annotation_for_stem(data, stem, anno_dir, req, reporter)
        exported_count += 1

        # 复制/转换图像
        _copy_images_for_stem(stem, req.source_dirs, req.view_configs, req.target_dir)

    # 4. 生成 split 文件
    _write_split_files(
        req.target_dir, req.split_files, train_stems, val_stems, test_stems
    )

    # 5. classes.txt
    with open(os.path.join(req.target_dir, "classes.txt"), "w") as f:
        f.write("\n".join(req.selected_classes))

    reporter.save_report(req.task_type, req.format)

    return {
        "status": "success",
        "message": f"Dataset: 导出 {exported_count} 个场景",
        "split": {
            "train": len(train_stems),
            "val": len(val_stems),
            "test": len(test_stems),
        },
    }


def _copy_images_for_stem(stem, source_dirs, view_configs, target_dir):
    """复制源图像到目标目录"""
    for vc in view_configs:
        dst_dir = os.path.join(target_dir, vc.subdir)
        os.makedirs(dst_dir, exist_ok=True)

        folder_path = vc.folder_path
        suffix = vc.suffix
        bands = vc.bands
        transform = vc.transform
        target_ext = vc.extension

        img_path = None

        for ext in [".tif", ".tiff", ".png", ".jpg", ".jpeg", ".bmp"]:
            candidate = os.path.join(folder_path, f"{stem}{suffix}{ext}")
            if os.path.exists(candidate):
                img_path = candidate
                break

        if not img_path:
            print(f"⚠️ Image not found for {stem}{suffix}.* in {folder_path}")
            continue

        try:
            # 2. 读取图像
            if img_path.lower().endswith((".tif", ".tiff")):
                img = tifffile.imread(img_path)
            else:
                img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)

            if img is None:
                print(f"⚠️ Failed to read: {img_path}")
                continue

            # 3. 提取波段
            if len(img.shape) == 3 and img.shape[-1] >= max(bands):
                selected = [b - 1 for b in bands]
                img = img[:, :, selected]
            elif len(img.shape) == 2:
                pass  # 单波段，保持原样
            else:
                print(f"⚠️ Band mismatch: shape={img.shape}, bands={bands}")
                continue

            # 4. 应用 transform
            scale_x = transform.get("scaleX", 1.0)
            scale_y = transform.get("scaleY", 1.0)
            offset_x = int(transform.get("offsetX", 0))
            offset_y = int(transform.get("offsetY", 0))

            if scale_x != 1.0 or scale_y != 1.0:
                h, w = img.shape[:2]
                img = cv2.resize(img, (int(w * scale_x), int(h * scale_y)))

            if offset_x != 0 or offset_y != 0:
                M = np.float32([[1, 0, offset_x], [0, 1, offset_y]])
                img = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]))

            # 5. 归一化并保存
            if img.dtype != np.uint8:
                img_min, img_max = img.min(), img.max()
                if img_max > img_min:
                    img = ((img - img_min) / (img_max - img_min) * 255).astype(np.uint8)
                else:
                    img = img.astype(np.uint8)

            dst = os.path.join(dst_dir, f"{stem}{suffix}.{target_ext.lstrip('.')}")
            Image.fromarray(img).save(dst)

        except Exception as e:
            print(f"❌ Error processing {img_path}: {e}")
            import traceback

            traceback.print_exc()


def _export_annotation_for_stem(data, stem, target_subdir, req, reporter):
    """导出单个场景的标注文件"""
    base_stem = stem
    shapes = data.get("shapes", [])

    if req.format == "yolo":
        yolo_lines, stats = convert_to_yolo(
            shapes,
            data.get("imageWidth", 1),
            data.get("imageHeight", 1),
            req.selected_classes,
            req.allowed_shapes,
            req.task_type,
        )
        if yolo_lines:
            out_path = os.path.join(
                target_subdir, f"{base_stem}{req.custom_suffix}{req.extension}"
            )
            with open(out_path, "w") as f:
                f.write("\n".join(yolo_lines))
            reporter.log_scene(base_stem, stats)
            return True

    elif req.format == "coco":
        # COCO 全量导出在最后
        return True

    elif req.format == "multianno":
        filtered_shapes, stats = filter_multianno(
            shapes, req.selected_classes, req.allowed_shapes
        )
        if filtered_shapes:
            data["shapes"] = filtered_shapes
            out_path = os.path.join(
                target_subdir, f"{base_stem}{req.custom_suffix}{req.extension}"
            )
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            reporter.log_scene(base_stem, stats)
            return True

    elif req.format == "mask":
        img_w, img_h = data.get("imageWidth"), data.get("imageHeight")
        if img_w and img_h:
            mask, stats = render_mask_array(
                shapes, img_w, img_h, req.selected_classes, req.allowed_shapes
            )
            out_path = os.path.join(
                target_subdir, f"{base_stem}{req.custom_suffix}{req.extension}"
            )
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                io.imsave(out_path, mask, check_contrast=False)
            reporter.log_scene(base_stem, stats)
            return True

    return False


def _write_split_files(target_dir, split_files, train, val, test):
    """生成 train.txt, val.txt, test.txt"""
    subsets = {
        split_files.get("train", "train.txt"): train,
        split_files.get("val", "val.txt"): val,
        split_files.get("test", "test.txt"): test,
    }
    for filename, stems in subsets.items():
        with open(os.path.join(target_dir, filename), "w") as f:
            f.write("\n".join(stems))


def _collect_all_stems(source_dirs):
    """收集所有 stem"""
    stems = []
    for j_path in get_native_jsons(source_dirs):
        with open(j_path, "r") as f:
            data = json.load(f)
        stems.append(data.get("stem", Path(j_path).stem))
    return stems
