import json
import math
import os
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import APIRouter

# 从咱们新建的模型文件里引入需要的 Model
from models import (
    BatchDeleteAttributeRequest,
    BatchDeleteClassRequest,
    BatchMergeClassRequest,
    StatRequest,
)

# 统一加上前缀和标签，方便管理
router = APIRouter(prefix="/api/taxonomy", tags=["Taxonomy"])


# 🌟 Bins 设定 (最后加上 inf 以防极端比例报错)
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
                print(f"Error processing {file_path}: {e}")

    return {"status": "success", "modified_files": modified_count}


@router.post("/delete_class")
async def batch_delete_class(request: BatchDeleteClassRequest):
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
                print(f"Error processing {file_path}: {e}")

    return {"status": "success", "modified_files": modified_count}


@router.post("/delete_attribute")
async def batch_delete_attribute(request: BatchDeleteAttributeRequest):
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
                print(f"Error processing {file_path}: {e}")

    return {"status": "success", "modified_files": modified_count}


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
    if not req.save_dirs:
        return {"global": {"total_images": 0, "total_objects": 0}, "classes": {}}

    # 🌟 1. 缓存路径定义：存在第一个存档目录的上一级（通常是项目根目录）
    project_root = os.path.dirname(req.save_dirs[0])
    cache_file = os.path.join(project_root, "stats_cache.json")

    # 🌟 2. 缓存拦截：如果不强制刷新，且缓存文件存在，直接秒回！
    if not req.force_refresh and os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"读取缓存失败: {e}，将重新计算。")

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
                stem = data.get("stem", fname.replace(".json", ""))
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
                print(f"[Warning] Failed to parse {fpath}: {e}")
                continue

    # 如果完全没有标注数据，直接返回空
    if not records:
        empty_stats = {
            "total_objects": 0,
            "shape_types": {},
            "attribute_counts": {},
            "attribute_details": {},
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
        except Exception:
            pass

        return final_result

    # 🌟 2. 转换为 DataFrame 享受降维打击
    df = pd.DataFrame(records)

    # 矢量化计算长宽比与相对面积
    df["shape_rate"] = (df["width"] / df["height"].replace(0, 1e-6)).round(2)
    df["rel_area"] = df["area"] / df["img_area"]

    # 使用 pd.cut 分箱
    df["shape_rate_bin"] = pd.cut(df["shape_rate"], bins=SHP_RATE_BINS, right=False)
    df["rel_area_bin"] = pd.cut(df["rel_area"], bins=AREA_RATE_BINS, right=False)

    # 🌟 3. 封装统计聚合函数 (升级版：加入属性深度聚合)
    def aggregate_stats(sub_df: pd.DataFrame):
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
        if "attributes" in sub_df:
            for attrs in sub_df["attributes"]:
                if not isinstance(attrs, dict):
                    continue
                for k, v in attrs.items():
                    if k not in attr_details:
                        attr_details[k] = {}

                    # 处理空值 (有些标签标了属性但是没选值)
                    val_str = str(v).strip() if str(v).strip() != "" else "(empty)"
                    attr_details[k][val_str] = attr_details[k].get(val_str, 0) + 1

        return {
            "total_objects": len(sub_df),
            "shape_types": sub_df["shape_type"].value_counts().to_dict(),
            # 🌟 新增的数据结构：喂给前端的属性图表
            "attribute_counts": attr_counts,
            "attribute_details": attr_details,
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
    global_stats = aggregate_stats(df)
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
        print(f"写入缓存失败: {e}")

    return final_result
