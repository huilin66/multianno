# backend/utils/format_converters.py
import math

import cv2
import numpy as np


def get_bounding_box(shape_type: str, points: list) -> list:
    """将任何形状转换为 [xmin, ymin, xmax, ymax] 的绝对边界框"""
    if not points:
        return []

    # 🌟 统一名称映射防御
    shape_type = shape_type.lower()
    if shape_type == "rectangle":
        shape_type = "bbox"
    if shape_type == "linestrip":
        shape_type = "line"

    if shape_type == "circle" and len(points) == 2:
        cx, cy = points[0]
        ex, ey = points[1]
        r = math.hypot(ex - cx, ey - cy)
        return [cx - r, cy - r, cx + r, cy + r]

    x_coords = [p[0] for p in points]
    y_coords = [p[1] for p in points]
    return [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]


def get_polygon_points(shape_type: str, points: list, num_segments: int = 16) -> list:
    """将任何形状离散化为多边形点阵 [[x,y], [x,y]...]"""
    if not points:
        return []

    # 🌟 统一名称映射防御
    shape_type = shape_type.lower()
    if shape_type == "rectangle":
        shape_type = "bbox"
    if shape_type == "linestrip":
        shape_type = "line"

    if shape_type == "polygon":
        return points

    # 🌟 核心修复：框转多边形。强制将 2 个点（对角线）补齐为 4 个角（形成闭合多边形）
    if shape_type == "bbox":
        bbox = get_bounding_box("bbox", points)
        if not bbox:
            return []
        xmin, ymin, xmax, ymax = bbox
        # 顺时针返回 4 个顶点
        return [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]]

    if shape_type == "circle" and len(points) == 2:
        cx, cy = points[0]
        ex, ey = points[1]
        r = math.hypot(ex - cx, ey - cy)
        poly = []
        for i in range(num_segments):
            angle = 2 * math.pi * i / num_segments
            poly.append([cx + r * math.cos(angle), cy + r * math.sin(angle)])
        return poly

    if shape_type == "ellipse":
        bbox = get_bounding_box("bbox", points)
        if not bbox:
            return []
        xmin, ymin, xmax, ymax = bbox
        cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
        rx, ry = (xmax - xmin) / 2, (ymax - ymin) / 2
        poly = []
        for i in range(num_segments):
            angle = 2 * math.pi * i / num_segments
            poly.append([cx + rx * math.cos(angle), cy + ry * math.sin(angle)])
        return poly

    return points


def filter_multianno(
    shapes: list, selected_classes: list, allowed_shapes: list
) -> tuple:
    """
    清洗 MultiAnno 数据：只保留合法的类别和形状
    返回: (过滤后的 shapes 列表, 统计字典)
    """
    filtered_shapes = []
    stats = {"native": 0, "converted": 0, "discarded": 0}

    for shape in shapes:
        label = shape.get("label")
        shape_type = shape.get("shape_type", "bbox")

        if label not in selected_classes or shape_type not in allowed_shapes:
            stats["discarded"] += 1
        else:
            stats["native"] += 1  # MultiAnno 原生支持所有合法形状
            filtered_shapes.append(shape)

    return filtered_shapes, stats


def convert_to_yolo(
    shapes: list,
    img_w: int,
    img_h: int,
    selected_classes: list,
    allowed_shapes: list,
    task_type: str,
) -> tuple:
    yolo_lines = []
    stats = {"native": 0, "converted": 0, "discarded": 0}
    img_w, img_h = max(1, img_w), max(1, img_h)
    print(allowed_shapes)
    for shape in shapes:
        label = shape.get("label")
        raw_type = shape.get("shape_type", "unknown").lower()
        if raw_type == "rectangle":
            shape_type = "bbox"
        elif raw_type == "linestrip":
            shape_type = "line"
        else:
            shape_type = raw_type
        if label not in selected_classes or shape_type not in [
            s.lower() for s in allowed_shapes
        ]:
            stats["discarded"] += 1
            continue

        class_id = selected_classes.index(label)
        raw_points = shape.get("points", [])
        if not raw_points:
            continue

        # 🌟 真正的“自动转换”逻辑分流
        is_segmentation = task_type.lower() in [
            "instance_segmentation",
            "semantic_segmentation",
        ]

        if is_segmentation:
            # 1. 目标是多边形：强制将 Circle/BBox/Ellipse 全部转为多边形点阵
            poly_points = get_polygon_points(shape_type, raw_points)
            if not poly_points:
                continue

            norm_points = [
                f"{max(0, min(1, p[0] / img_w)):.6f} {max(0, min(1, p[1] / img_h)):.6f}"
                for p in poly_points
            ]
            yolo_lines.append(f"{class_id} {' '.join(norm_points)}")

            if shape_type == "polygon":
                stats["native"] += 1
            else:
                stats["converted"] += 1

        else:
            # 2. 目标是检测框：强制将 Polygon/Circle/Ellipse 全部提取为绝对边界框
            bbox = get_bounding_box(shape_type, raw_points)
            if not bbox:
                continue
            xmin, ymin, xmax, ymax = bbox

            x_center = max(0, min(1, ((xmin + xmax) / 2) / img_w))
            y_center = max(0, min(1, ((ymin + ymax) / 2) / img_h))
            box_w = max(0, min(1, (xmax - xmin) / img_w))
            box_h = max(0, min(1, (ymax - ymin) / img_h))

            yolo_lines.append(
                f"{class_id} {x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}"
            )

            if shape_type == "bbox":
                stats["native"] += 1
            else:
                stats["converted"] += 1
        print(shape_type)
    return yolo_lines, stats


def convert_to_coco_anns(
    shapes: list,
    img_id: int,
    start_ann_id: int,
    selected_classes: list,
    allowed_shapes: list,
) -> tuple:
    """
    将单张图像的 shapes 转换为 COCO 的 annotations 列表
    返回: (COCO annotation 字典列表, 统计字典, 下一个可用的 ann_id)
    """
    anns = []
    stats = {"native": 0, "converted": 0, "discarded": 0}
    current_ann_id = start_ann_id

    # 统一小写，防止前端传参大小写不一致
    allowed_shapes_lower = [s.lower() for s in allowed_shapes]

    for shape in shapes:
        label = shape.get("label")

        # 🌟 修复 1：兼容读取字段，并将 LabelMe 的 rectangle 映射回系统的 bbox
        raw_type = shape.get("shape_type", shape.get("type", "bbox")).lower()
        if raw_type == "rectangle":
            shape_type = "bbox"
        elif raw_type == "linestrip":
            shape_type = "line"
        else:
            shape_type = raw_type

        # 拦截不合法的类别和形状
        if label not in selected_classes or shape_type not in allowed_shapes_lower:
            stats["discarded"] += 1
            continue

        raw_points = shape.get("points", [])
        if not raw_points:
            continue

        # 🌟 修复 2：调用我们在文件顶部写的几何引擎 (提取外接矩形和多边形点阵)
        bbox = get_bounding_box(shape_type, raw_points)
        poly_points = get_polygon_points(shape_type, raw_points)

        if not bbox or not poly_points:
            continue

        xmin, ymin, xmax, ymax = bbox
        box_w, box_h = xmax - xmin, ymax - ymin

        # 展平多边形数组 [x1, y1, x2, y2 ...]
        # （如果是 bbox，这里的 poly_points 已经被展开成了 4 个角的 8 个值！）
        flat_points = [coord for pt in poly_points for coord in pt]

        # 终极防御：如果点数依然少于 6 个（比如异常的废点），COCO 会崩溃，直接跳过
        if len(flat_points) < 6:
            stats["discarded"] += 1
            continue

        cat_id = selected_classes.index(label)

        anns.append(
            {
                "id": current_ann_id,
                "image_id": img_id,
                "category_id": cat_id,
                "bbox": [xmin, ymin, box_w, box_h],
                "segmentation": [flat_points],
                "area": box_w * box_h,
                "iscrowd": 0,
            }
        )
        current_ann_id += 1

        if shape_type in ["bbox", "polygon"]:
            stats["native"] += 1
        else:
            stats["converted"] += 1

    return anns, stats, current_ann_id


def render_mask_array(
    shapes: list, img_w: int, img_h: int, selected_classes: list, allowed_shapes: list
) -> tuple:
    """
    将单个 JSON 的 shapes 渲染为语义分割的 NumPy 灰度矩阵
    返回: (渲染好的 numpy 数组, 统计字典)
    """
    # 初始化全黑的 8 位单通道灰度图
    mask = np.zeros((int(img_h), int(img_w)), dtype=np.uint8)
    stats = {"native": 0, "converted": 0, "discarded": 0}

    allowed_shapes_lower = [s.lower() for s in allowed_shapes]

    for shape in shapes:
        label = shape.get("label")

        # 兼容读取并映射 shape_type
        raw_type = shape.get("shape_type", shape.get("type", "bbox")).lower()
        if raw_type == "rectangle":
            shape_type = "bbox"
        elif raw_type == "linestrip":
            shape_type = "line"
        else:
            shape_type = raw_type

        # 拦截不合规的数据
        if label not in selected_classes or shape_type not in allowed_shapes_lower:
            stats["discarded"] += 1
            continue

        raw_points = shape.get("points", [])
        if not raw_points:
            continue

        # 复用我们写好的几何引擎离散化多边形
        poly_points = get_polygon_points(shape_type, raw_points)
        if not poly_points:
            continue

        class_id = selected_classes.index(label)

        # OpenCV 高速填充像素
        pts = np.array(poly_points, np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(mask, [pts], color=int(class_id))

        if shape_type in ["polygon", "circle"]:
            stats["native"] += 1
        else:
            stats["converted"] += 1
    print(np.unique(mask))
    return mask, stats
