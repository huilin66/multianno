import json
import math
import os
import shutil
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from models import (
    ApplyAttributeRequest,
    BatchDeleteAttributeRequest,
    BatchRenameAttributeRequest,
    BatchDeleteClassRequest,
    BatchMergeClassRequest,
    MergeWithAttributeRequest,
    RepairRequest,
    StatRequest,
)
from utils.logging_config import get_logger, shorten

router = APIRouter(prefix="/api/taxonomy", tags=["Taxonomy"])
logger = get_logger("taxonomy")


SHP_RATE_BINS = [
    0,
    0.1,
    0.2,
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.8,
    0.9,
    1,
    1.1,
    1.2,
    1.3,
    1.4,
    1.5,
    1.6,
    1.7,
    1.8,
    1.9,
    2,
    2.1,
    2.2,
    2.4,
    2.6,
    3,
    3.5,
    4,
    5,
    float("inf"),
]
AREA_RATE_BINS = [0, 0.001, 0.005, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]


@router.post("/merge_class")  # 因为有 prefix，这里写 /merge_class 即可
async def batch_merge_class(request: BatchMergeClassRequest):
    logger.info(
        "MERGE_CLASS_START folders=%d old_names=%s new_name=%s",
        len(request.save_dirs),
        shorten(request.old_names, 1000),
        request.new_name,
    )
    modified_count = 0
    import json

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                changed = False
                # 遍历修改匹配的 label
                for shape in anno_data.get("shapes", []):
                    if shape.get("label") in request.old_names:
                        shape["label"] = request.new_name
                        changed = True

                # 只有发生实质修改，才重新写入，最大化节省硬盘 I/O
                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
            except Exception as e:
                logger.exception("MERGE_CLASS_FILE_ERROR path=%s error=%s", shorten(file_path, 1500), e)

    logger.info("MERGE_CLASS_END modified_files=%d", modified_count)
    return {"status": "success", "modified_files": modified_count}


@router.post("/delete_class")
async def batch_delete_class(request: BatchDeleteClassRequest):
    logger.info(
        "DELETE_CLASS_START folders=%d class=%s hard_delete=%s",
        len(request.save_dirs),
        request.class_name,
        request.hard_delete,
    )
    modified_count = 0
    import json

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                original_len = len(anno_data.get("shapes", []))

                if request.hard_delete:
                    # 硬删除：过滤掉该类别的框
                    anno_data["shapes"] = [
                        s
                        for s in anno_data.get("shapes", [])
                        if s.get("label") != request.class_name
                    ]
                    changed = len(anno_data["shapes"]) != original_len
                else:
                    # 软删除：把类别名改成 'background'
                    changed = False
                    for shape in anno_data.get("shapes", []):
                        if shape.get("label") == request.class_name:
                            shape["label"] = "background"
                            changed = True

                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
            except Exception as e:
                logger.exception("DELETE_CLASS_FILE_ERROR path=%s error=%s", shorten(file_path, 1500), e)

    logger.info("DELETE_CLASS_END modified_files=%d", modified_count)
    return {"status": "success", "modified_files": modified_count}


@router.post("/delete_attribute")
async def batch_delete_attribute(request: BatchDeleteAttributeRequest):
    logger.info(
        "DELETE_ATTRIBUTE_START folders=%d attribute=%s",
        len(request.save_dirs),
        request.attribute_name,
    )
    modified_count = 0
    import json

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                changed = False
                for shape in anno_data.get("shapes", []):
                    # 如果该框存在 attributes 字典，并且包含了我们要删的属性
                    if (
                        "attributes" in shape
                        and request.attribute_name in shape["attributes"]
                    ):
                        del shape["attributes"][request.attribute_name]
                        changed = True

                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
            except Exception as e:
                logger.exception("DELETE_ATTRIBUTE_FILE_ERROR path=%s error=%s", shorten(file_path, 1500), e)

    logger.info("DELETE_ATTRIBUTE_END modified_files=%d", modified_count)
    return {"status": "success", "modified_files": modified_count}


@router.post("/rename_attribute")
async def batch_rename_attribute(request: BatchRenameAttributeRequest):
    old_name = request.old_name.strip()
    new_name = request.new_name.strip()
    logger.info(
        "RENAME_ATTRIBUTE_START folders=%d old_name=%s new_name=%s",
        len(request.save_dirs),
        old_name,
        new_name,
    )

    if not old_name or not new_name:
        return JSONResponse(status_code=400, content={"detail": "Attribute name cannot be empty."})
    if old_name == new_name:
        return {"status": "success", "modified_files": 0, "renamed_shapes": 0}

    import json

    files: list[tuple[str, dict]] = []
    conflicts: list[str] = []

    # 先完成只读扫描，避免部分文件已修改后才发现属性键冲突。
    for folder in request.save_dirs:
        if not os.path.exists(folder):
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)
                files.append((file_path, anno_data))

                has_conflict = any(
                    isinstance(shape.get("attributes"), dict)
                    and old_name in shape["attributes"]
                    and new_name in shape["attributes"]
                    for shape in anno_data.get("shapes", [])
                )
                if has_conflict:
                    conflicts.append(file_path)
            except Exception as e:
                logger.exception("RENAME_ATTRIBUTE_FILE_READ_ERROR path=%s error=%s", shorten(file_path, 1500), e)

    if conflicts:
        logger.warning(
            "RENAME_ATTRIBUTE_CONFLICT old_name=%s new_name=%s files=%d",
            old_name,
            new_name,
            len(conflicts),
        )
        return JSONResponse(
            status_code=409,
            content={
                "detail": (
                    f'Cannot rename "{old_name}" to "{new_name}": '
                    f'{len(conflicts)} annotation file(s) already contain both attribute keys.'
                )
            },
        )

    modified_count = 0
    renamed_shapes = 0
    for file_path, anno_data in files:
        changed = False
        for shape in anno_data.get("shapes", []):
            attrs = shape.get("attributes")
            if not isinstance(attrs, dict) or old_name not in attrs:
                continue
            attrs[new_name] = attrs.pop(old_name)
            changed = True
            renamed_shapes += 1

        if changed:
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(anno_data, f, indent=2, ensure_ascii=False)
                modified_count += 1
            except Exception as e:
                logger.exception("RENAME_ATTRIBUTE_FILE_WRITE_ERROR path=%s error=%s", shorten(file_path, 1500), e)

    logger.info(
        "RENAME_ATTRIBUTE_END old_name=%s new_name=%s modified_files=%d renamed_shapes=%d",
        old_name,
        new_name,
        modified_count,
        renamed_shapes,
    )
    return {
        "status": "success",
        "modified_files": modified_count,
        "renamed_shapes": renamed_shapes,
    }


def calculate_shape_metrics(shape_type: str, points: list):
    """
    几何计算引擎：返回 (像素面积, 宽, 高, center_x, center_y, min_x, min_y, max_x, max_y)
    """
    if not points or len(points) < 2:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

    x_coords = [p[0] for p in points]
    y_coords = [p[1] for p in points]

    min_x, max_x = min(x_coords), max(x_coords)
    min_y, max_y = min(y_coords), max(y_coords)

    width = abs(max_x - min_x)
    height = abs(max_y - min_y)
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    area = 0.0
    if shape_type in ["bbox", "rectangle"]:
        area = width * height
    elif shape_type == "polygon":
        n = len(points)
        for i in range(n):
            j = (i + 1) % n
            area += points[i][0] * points[j][1]
            area -= points[j][0] * points[i][1]
        area = abs(area) / 2.0
    elif shape_type in ["ellipse", "circle"]:
        area = math.pi * (width / 2.0) * (height / 2.0)

    return area, width, height, center_x, center_y, min_x, min_y, max_x, max_y


def format_bins(s: pd.Series) -> dict:
    """将 pandas cut 产生的 Interval 格式化为字符串字典"""
    if s.empty:
        return {}
    d = {}
    for interval, count in s.items():
        if getattr(interval, "right", None) == float("inf"):
            key = f">={interval.left}"
        else:
            key = f"{interval.left}-{interval.right}"
        d[key] = int(count)
    return d


def get_2d_heatmap(df: pd.DataFrame, x_col: str, y_col: str, bins: int = 10) -> list:
    """生成 10x10 的二维热力图矩阵，对应 yolo 的 sns.jointplot"""
    if df.empty:
        return []
    # 限定相对坐标在 0~1 之间，防止越界
    x_data = df[x_col].clip(0, 1)
    y_data = df[y_col].clip(0, 1)

    # 计算 2D 直方图
    H, xedges, yedges = np.histogram2d(
        x_data, y_data, bins=bins, range=[[0, 1], [0, 1]]
    )

    # H.T 转置使得行代表 Y(高度)，列代表 X(宽度)，方便前端 ECharts 渲染
    return H.T.astype(int).tolist()


@router.post("/statistics")
async def get_project_statistics(req: StatRequest):
    logger.info(
        "TAXONOMY_STATISTICS_START folders=%d force_refresh=%s",
        len(req.save_dirs),
        req.force_refresh,
    )
    if not req.save_dirs:
        logger.info("TAXONOMY_STATISTICS_END empty_request=True")
        return {"global": {"total_images": 0, "total_objects": 0}, "classes": {}}

    # 🌟 1. 缓存路径定义：存在第一个存档目录的上一级（通常是项目根目录）
    project_root = os.path.dirname(req.save_dirs[0])
    cache_file = os.path.join(project_root, "stats_cache.json")

    # 🌟 2. 缓存拦截：如果不强制刷新，且缓存文件存在，直接秒回！
    if not req.force_refresh and os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                result = json.load(f)
            logger.info("TAXONOMY_STATISTICS_CACHE_HIT path=%s", shorten(cache_file, 1500))
            return result
        except Exception as e:
            logger.exception("TAXONOMY_STATISTICS_CACHE_ERROR path=%s error=%s", cache_file, e)

    records = []
    total_images = 0

    # 🌟 1. 高效遍历提取数据到 List
    for directory in req.save_dirs:
        if not os.path.exists(directory):
            continue

        for fname in os.listdir(directory):
            if not fname.endswith(".json"):
                continue

            fpath = os.path.join(directory, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)

                total_images += 1
                file_stem = fname.replace(".json", "")
                raw_stem = data.get("stem", "")
                if (
                    raw_stem
                    and raw_stem != file_stem
                    and raw_stem.startswith(file_stem)
                ):
                    stem = file_stem
                elif raw_stem:
                    stem = raw_stem
                else:
                    stem = file_stem
                img_w = data.get("imageWidth", 1) or 1
                img_h = data.get("imageHeight", 1) or 1
                shapes = data.get("shapes", [])

                for shape in shapes:
                    area, w, h, cx, cy, min_x, min_y, max_x, max_y = (
                        calculate_shape_metrics(
                            shape.get("shape_type"), shape.get("points")
                        )
                    )

                    attrs = shape.get("attributes", {})
                    attr_num = len(attrs)

                    records.append(
                        {
                            "image": stem,
                            "label": shape.get("label", "unknown"),
                            "shape_type": shape.get("shape_type", "unknown"),
                            "attr_num": attr_num,  # 🌟 新增：挂载属性数量
                            "attributes": attrs,  # 🌟 新增：挂载具体属性字典
                            "area": area,
                            "width": w,
                            "height": h,
                            "cx_rel": cx / img_w,  # 中心点相对 X
                            "cy_rel": cy / img_h,  # 中心点相对 Y
                            "sx_rel": min_x / img_w,  # 始点相对 X
                            "sy_rel": min_y / img_h,  # 始点相对 Y
                            "ex_rel": max_x / img_w,  # 终点相对 X
                            "ey_rel": max_y / img_h,  # 终点相对 Y
                            "img_area": img_w * img_h,
                        }
                    )
            except Exception as e:
                logger.exception("TAXONOMY_STATISTICS_FILE_ERROR path=%s error=%s", shorten(fpath, 1500), e)
                continue

    # 如果完全没有标注数据，直接返回空
    if not records:
        empty_stats = {
            "total_objects": 0,
            "shape_types": {},
            "attribute_counts": {},
            "attribute_details": {},
            "attribute_value_stems": {},
            "shape_rate_distribution": {},
            "area_distribution": {},
            "box_number_distribution": {},
            "heatmap_center": [],
            "heatmap_start": [],
            "heatmap_end": [],
        }

        final_result = {
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "global": {**empty_stats, "total_images": total_images, "class_counts": {}},
            "classes": {},
            "shapes": {"bbox": {}, "polygon": {}},
        }
        # 🌟 关键：就算没数据，也要把这个“空结果”写进缓存，覆盖掉旧项目的脏数据！
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(final_result, f, ensure_ascii=False)
            logger.info("TAXONOMY_STATISTICS_CACHE_WRITE path=%s", shorten(cache_file, 1500))
        except Exception:
            logger.exception("TAXONOMY_STATISTICS_CACHE_WRITE_ERROR path=%s", shorten(cache_file, 1500))

        logger.info("TAXONOMY_STATISTICS_END images=%d objects=0", total_images)
        return final_result

    # 🌟 2. 转换为 DataFrame 享受降维打击
    df = pd.DataFrame(records)

    df["shape_type"] = df["shape_type"].replace(
        {"rectangle": "bbox", "Rectangle": "bbox"}
    )

    # 矢量化计算长宽比与相对面积
    df["shape_rate"] = (df["width"] / df["height"].replace(0, 1e-6)).round(2)
    df["rel_area"] = df["area"] / df["img_area"]

    # 使用 pd.cut 分箱
    df["shape_rate_bin"] = pd.cut(df["shape_rate"], bins=SHP_RATE_BINS, right=False)
    df["rel_area_bin"] = pd.cut(df["rel_area"], bins=AREA_RATE_BINS, right=False)

    # 🌟 3. 封装统计聚合函数 (升级版：加入属性深度聚合)
    def aggregate_stats(sub_df: pd.DataFrame, *, include_attribute_value_stems: bool = False):
        # 1. 基础图像/框数分布
        boxes_per_img = (
            sub_df.groupby("image").size().value_counts().sort_index().to_dict()
        )

        # 🌟 2. 属性密度分布 (每个对象有几个属性：0个, 1个, 2个...)
        attr_counts_raw = (
            sub_df["attr_num"].value_counts().sort_index().to_dict()
            if "attr_num" in sub_df
            else {}
        )
        attr_counts = {str(k): int(v) for k, v in attr_counts_raw.items()}

        # 🌟 3. 属性详情分布 (统计每个属性具体值的出现次数)
        attr_details = {}
        attr_value_stems = {}
        if include_attribute_value_stems and "attributes" in sub_df:
            for image, attrs in zip(sub_df["image"], sub_df["attributes"]):
                if not isinstance(attrs, dict):
                    continue
                for k, v in attrs.items():
                    if k not in attr_details:
                        attr_details[k] = {}
                    if k not in attr_value_stems:
                        attr_value_stems[k] = {}

                    # 处理空值 (有些标签标了属性但是没选值)
                    val_str = str(v).strip() if str(v).strip() != "" else "(empty)"
                    attr_details[k][val_str] = attr_details[k].get(val_str, 0) + 1
                    attr_value_stems[k].setdefault(val_str, set()).add(str(image))

        attribute_value_stems = {
            attribute_name: {
                value: sorted(stems)
                for value, stems in value_stem_map.items()
            }
            for attribute_name, value_stem_map in attr_value_stems.items()
        }

        return {
            "total_objects": len(sub_df),
            "shape_types": sub_df["shape_type"].value_counts().to_dict(),
            # 🌟 新增的数据结构：喂给前端的属性图表
            "attribute_counts": attr_counts,
            "attribute_details": attr_details,
            "attribute_value_stems": attribute_value_stems,
            "shape_rate_distribution": format_bins(
                sub_df["shape_rate_bin"].value_counts().sort_index()
            ),
            "area_distribution": format_bins(
                sub_df["rel_area_bin"].value_counts().sort_index()
            ),
            "box_number_distribution": {
                str(k): int(v) for k, v in boxes_per_img.items()
            },
            # 热力图矩阵
            "heatmap_center": get_2d_heatmap(sub_df, "cx_rel", "cy_rel"),
            "heatmap_start": get_2d_heatmap(sub_df, "sx_rel", "sy_rel"),
            "heatmap_end": get_2d_heatmap(sub_df, "ex_rel", "ey_rel"),
        }

    # 🌟 4. 生成 Global 与 Classes 数据
    global_stats = aggregate_stats(df, include_attribute_value_stems=True)
    global_stats["total_images"] = total_images
    global_stats["class_counts"] = df["label"].value_counts().to_dict()

    class_stats = {}
    for label, group_df in df.groupby("label"):
        class_stats[str(label)] = aggregate_stats(group_df)
        class_stats[str(label)]["stems"] = group_df["image"].unique().tolist()

        # 🌟 新增：在当前类别下，继续按照 shape_type 细分统计
        c_shapes = {}
        for shape_t, s_df in group_df.groupby("shape_type"):
            if str(shape_t) in ["bbox", "polygon"]:
                c_shapes[str(shape_t)] = aggregate_stats(s_df)
        class_stats[str(label)]["shapes"] = c_shapes  # 挂载到该 class 下

    # 🌟 3. 组装最终结果，加入时间戳
    # 🌟 新增：对不同 shape_type 的独立统计 (满足前端的 Shape Tab 切换)
    shape_stats = {}
    for shape_t, group_df in df.groupby("shape_type"):
        if str(shape_t) in ["bbox", "polygon"]:  # 目前仅支持这两种
            shape_stats[str(shape_t)] = aggregate_stats(group_df)

    final_result = {
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "global": global_stats,
        "classes": class_stats,
        "shapes": shape_stats,  # 🌟 把新增的数据传给前端
    }

    # 🌟 4. 将结果持久化写入磁盘缓存
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(final_result, f, ensure_ascii=False)
    except Exception as e:
        logger.exception("TAXONOMY_STATISTICS_CACHE_WRITE_ERROR path=%s error=%s", cache_file, e)

    logger.info(
        "TAXONOMY_STATISTICS_END images=%d objects=%d records=%d",
        total_images,
        len(records),
        len(records),
    )
    return final_result


def _invalidate_statistics_caches(save_dirs: list[str]) -> int:
    """Invalidate derived taxonomy statistics after annotation files change."""
    cache_files = {
        os.path.join(os.path.dirname(os.path.abspath(os.path.normpath(folder))), "stats_cache.json")
        for folder in save_dirs
        if folder
    }
    invalidated = 0
    for cache_file in cache_files:
        try:
            if os.path.exists(cache_file):
                os.remove(cache_file)
                invalidated += 1
                logger.info("TAXONOMY_STATISTICS_CACHE_INVALIDATED path=%s", shorten(cache_file, 1500))
        except Exception:
            logger.exception("TAXONOMY_STATISTICS_CACHE_INVALIDATE_ERROR path=%s", shorten(cache_file, 1500))
    return invalidated


@router.post("/apply_attribute")
async def batch_apply_attribute(request: ApplyAttributeRequest):
    logger.info(
        "APPLY_ATTRIBUTE_START folders=%d attribute=%s old_default=%s new_default=%s replacements=%d",
        len(request.save_dirs),
        request.attribute_name,
        request.old_default,
        request.new_default,
        len(request.value_replacements),
    )

    modified_count = 0
    replaced_count = 0
    import json
    import os

    value_replacements = {
        str(old_value).strip(): str(new_value)
        for old_value, new_value in request.value_replacements.items()
        if str(old_value).strip() != str(new_value)
    }

    try:
        for folder in request.save_dirs:
            logger.info("APPLY_ATTRIBUTE_FOLDER_START path=%s", shorten(folder, 1500))
            if not os.path.exists(folder):
                logger.warning("APPLY_ATTRIBUTE_FOLDER_MISSING path=%s", shorten(folder, 1500))
                continue

            for file_name in os.listdir(folder):
                if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                    continue

                file_path = os.path.join(folder, file_name)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        anno_data = json.load(f)

                    changed = False
                    for shape in anno_data.get("shapes", []):
                        attributes = shape.get("attributes")
                        if not isinstance(attributes, dict):
                            attributes = {}
                            shape["attributes"] = attributes

                        if request.attribute_name in attributes:
                            current_value = attributes.get(request.attribute_name)
                            current_key = str(current_value).strip()
                            if current_key in value_replacements:
                                replacement = value_replacements[current_key]
                                if current_value != replacement:
                                    attributes[request.attribute_name] = replacement
                                    replaced_count += 1
                                    changed = True

                        if request.attribute_name not in attributes:
                            attributes[request.attribute_name] = request.new_default
                            changed = True
                        elif (
                            request.old_default is not None
                            and attributes.get(request.attribute_name) == request.old_default
                        ):
                            attributes[request.attribute_name] = request.new_default
                            changed = True

                    if changed:
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(anno_data, f, indent=2, ensure_ascii=False)
                        modified_count += 1

                except Exception as e:
                    logger.exception("APPLY_ATTRIBUTE_FILE_ERROR path=%s error=%s", shorten(file_path, 1500), e)

        invalidated_caches = _invalidate_statistics_caches(request.save_dirs) if modified_count else 0
        logger.info(
            "APPLY_ATTRIBUTE_END modified_files=%d replaced_values=%d invalidated_caches=%d",
            modified_count,
            replaced_count,
            invalidated_caches,
        )
        return {
            "status": "success",
            "modified_files": modified_count,
            "replaced_values": replaced_count,
            "invalidated_caches": invalidated_caches,
        }

    except Exception as e:
        # 3. 捕获一切内部致命错误
        logger.exception("APPLY_ATTRIBUTE_FATAL_ERROR error=%s", e)
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.post("/repair")
async def repair_project_data(req: RepairRequest):
    """
    统一数据修复入口，支持多种修复类型
    目前支持：
    - stem: 修复 JSON 文件中带后缀的 stem 字段
    后续可扩展：
    - attribute: 修复缺失的属性默认值
    - duplicate: 清理重复标注
    """
    logger.info(
        "REPAIR_START folders=%d types=%s stems=%d",
        len(req.save_dirs),
        req.repair_types,
        len(req.stems),
    )
    result = {"total_scanned": 0, "total_fixed": 0, "details": {}}

    for repair_type in req.repair_types:
        if repair_type == "stem":
            stem_result = _repair_stems(req.save_dirs)
            result["details"]["stem"] = stem_result
            result["total_scanned"] += stem_result["scanned"]
            result["total_fixed"] += stem_result["fixed"]
        if repair_type == "json_file":
            json_file_result = _repair_json_files(req.save_dirs, req.stems)
            result["details"]["json_file"] = json_file_result
            result["total_scanned"] += json_file_result["scanned"]
            result["total_fixed"] += json_file_result["fixed"]
    logger.info(
        "REPAIR_END scanned=%d fixed=%d",
        result["total_scanned"],
        result["total_fixed"],
    )
    return result


def _repair_stems(save_dirs: list) -> dict:
    """
    修复规则：
    如果文件名是 DJI_20260211160843_1138.json，
    JSON 内的 stem 却是 DJI_20260211160843_1138_T，
    说明带了下游文件的后缀，需要修正为文件名。
    """
    scanned = 0
    fixed = 0
    fixed_files = []

    for directory in save_dirs:
        if not os.path.exists(directory):
            continue

        for fname in os.listdir(directory):
            if not fname.endswith(".json"):
                continue
            if fname.endswith("_meta.json"):
                continue

            fpath = os.path.join(directory, fname)
            file_stem = fname.replace(".json", "")
            scanned += 1

            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)

                changed = False

                # 修复顶层 stem
                current_stem = data.get("stem", "")
                if (
                    current_stem
                    and current_stem != file_stem
                    and current_stem.startswith(file_stem)
                ):
                    data["stem"] = file_stem
                    changed = True

                if changed:
                    with open(fpath, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    fixed += 1
                    fixed_files.append(fname)

            except Exception as e:
                logger.exception("REPAIR_STEM_FILE_ERROR path=%s error=%s", shorten(fpath, 1500), e)

    return {"scanned": scanned, "fixed": fixed, "fixed_files": fixed_files}


def _repair_json_files(save_dirs: list, stems: list) -> dict:
    """
    修复规则：
    如果 JSON 内的 stem 字段与文件名不一致，
    说明带了下游文件的后缀，需要修正为文件名。
    """
    scanned = 0
    fixed = 0
    fixed_files = []

    for directory in save_dirs:
        if not os.path.exists(directory):
            continue
        directory_backup_error = directory + "_backup_error"
        os.makedirs(directory_backup_error, exist_ok=True)
        for fname in os.listdir(directory):
            if not fname.endswith(".json"):
                continue
            if fname.endswith("_meta.json"):
                continue

            fpath = os.path.join(directory, fname)
            scanned += 1

            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                current_stem = data.get("stem", "")
                if current_stem not in stems:
                    fpath_backup_error = os.path.join(directory_backup_error, fname)
                    shutil.move(fpath, fpath_backup_error)
                    fixed += 1
                    fixed_files.append(fname)

            except Exception as e:
                logger.exception("REPAIR_JSON_FILE_ERROR path=%s error=%s", shorten(fpath, 1500), e)

    return {"scanned": scanned, "fixed": fixed, "fixed_files": fixed_files}


@router.post("/merge_with_attribute")
async def batch_merge_with_attribute(request: MergeWithAttributeRequest):
    modified_count = 0
    total_objects = 0

    # 🌟 构建快速查找字典
    merge_map = {}
    for m in request.merges:
        # 兼容 Pydantic 对象和 dict
        old_name = m.old_name if hasattr(m, "old_name") else m["old_name"]
        merge_map[old_name] = m

    logger.info(
        "MERGE_WITH_ATTRIBUTE_START folders=%d rules=%d",
        len(request.save_dirs),
        len(request.merges),
    )

    for folder in request.save_dirs:
        if not os.path.exists(folder):
            logger.warning("MERGE_WITH_ATTRIBUTE_FOLDER_MISSING path=%s", shorten(folder, 1500))
            continue

        for file_name in os.listdir(folder):
            if not file_name.endswith(".json") or file_name.endswith("_meta.json"):
                continue

            file_path = os.path.join(folder, file_name)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    anno_data = json.load(f)

                changed = False
                file_objects_updated = 0

                for shape in anno_data.get("shapes", []):
                    label = shape.get("label", "")

                    if label in merge_map:
                        merge = merge_map[label]

                        # 🌟 兼容 Pydantic 和 dict
                        if hasattr(merge, "new_name"):
                            new_name = merge.new_name
                            attr_name = merge.attribute_name
                            attr_value = merge.attribute_value
                        else:
                            new_name = merge["new_name"]
                            attr_name = merge["attribute_name"]
                            attr_value = merge["attribute_value"]

                        old_attr = shape.get("attributes", {}).get(
                            attr_name, "<not set>"
                        )

                        shape["label"] = new_name
                        if "attributes" not in shape:
                            shape["attributes"] = {}
                        shape["attributes"][attr_name] = attr_value

                        logger.info(
                            "MERGE_WITH_ATTRIBUTE_OBJECT file=%s label=%s new_label=%s "
                            "attribute=%s old_value=%s new_value=%s",
                            file_name,
                            label,
                            new_name,
                            attr_name,
                            old_attr,
                            attr_value,
                        )

                        changed = True
                        file_objects_updated += 1

                if changed:
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(anno_data, f, indent=2, ensure_ascii=False)
                    modified_count += 1
                    total_objects += file_objects_updated

            except Exception as e:
                logger.exception("MERGE_WITH_ATTRIBUTE_FILE_ERROR path=%s error=%s", shorten(file_path, 1500), e)

    logger.info(
        "MERGE_WITH_ATTRIBUTE_END modified_files=%d objects=%d",
        modified_count,
        total_objects,
    )

    return {
        "status": "success",
        "modified_files": modified_count,
        "total_objects": total_objects,
    }
