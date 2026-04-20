# backend/utils/format_converters.py
import math
import uuid

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


def yolo_to_shapes(
    yolo_lines: list, img_w: int, img_h: int, classes_map: list
) -> tuple:
    """
    将 YOLO txt 行逆向解析为系统的 shapes
    返回: (解析后的 shapes 列表, 统计字典)
    """
    shapes = []
    stats = {"imported_bboxes": 0, "imported_polygons": 0, "dropped": 0}

    img_w = max(1, img_w)
    img_h = max(1, img_h)

    for line in yolo_lines:
        parts = line.strip().split()
        if not parts or len(parts) < 5:
            stats["dropped"] += 1
            continue

        class_id = int(parts[0])
        label = (
            classes_map[class_id]
            if class_id < len(classes_map)
            else f"Class_{class_id}"
        )

        # 目标检测 (5个值 -> 还原为 bbox)
        if len(parts) == 5:
            xc, yc, w, h = map(float, parts[1:5])
            abs_xc, abs_yc = xc * img_w, yc * img_h
            abs_w, abs_h = w * img_w, h * img_h

            xmin, ymin = abs_xc - abs_w / 2, abs_yc - abs_h / 2
            xmax, ymax = abs_xc + abs_w / 2, abs_yc + abs_h / 2

            shapes.append(
                {
                    "label": label,
                    "type": "bbox",
                    "shape_type": "rectangle",
                    "points": [[xmin, ymin], [xmax, ymax]],
                    "attributes": {},
                }
            )
            stats["imported_bboxes"] += 1

        # 实例分割 (多边形点阵 -> 还原为 polygon)
        elif len(parts) > 5:
            points_flat = list(map(float, parts[1:]))
            points = []
            for i in range(0, len(points_flat), 2):
                points.append([points_flat[i] * img_w, points_flat[i + 1] * img_h])

            shapes.append(
                {
                    "label": label,
                    "type": "polygon",
                    "shape_type": "polygon",
                    "points": points,
                    "attributes": {},
                }
            )
            stats["imported_polygons"] += 1

    return shapes, stats


def coco_ann_to_shape(ann: dict, classes_map: dict, coco_mode: str = "polygon") -> dict:
    """
    将单个 COCO annotation 字典转换为前端支持的 shape 格式。
    支持策略分流：优先多边形 (polygon) 或 强制矩形框 (bbox)
    """
    cat_id = ann.get("category_id")
    label = classes_map.get(cat_id, f"Class_{cat_id}")

    shape_id = str(uuid.uuid4())
    shape_obj = None

    # ==========================================
    # 🌟 策略 1：如果模式是 polygon，且数据里确实有多边形
    # ==========================================
    if (
        coco_mode == "polygon"
        and "segmentation" in ann
        and isinstance(ann["segmentation"], list)
        and len(ann["segmentation"]) > 0
    ):
        # COCO 的 segmentation 是 [x1, y1, x2, y2...] 这样的一维数组
        # 需要转成前端的 [[x1, y1], [x2, y2]...]
        seg = ann["segmentation"][0]  # 取第一个多边形轮廓
        if len(seg) >= 6:  # 至少需要3个点
            points = [[seg[i], seg[i + 1]] for i in range(0, len(seg), 2)]
            shape_obj = {
                "id": shape_id,
                "label": label,
                "type": "polygon",
                "shape_type": "polygon",
                "points": points,
                "attributes": {},
            }

    # ==========================================
    # 🌟 策略 2：如果模式是 bbox，或者策略 1 失败（比如物体太小没有多边形只有框）
    # ==========================================
    if shape_obj is None and "bbox" in ann:
        # COCO bbox 格式是 [x_min, y_min, width, height]
        bbox = ann["bbox"]
        if len(bbox) == 4:
            x_min, y_min, w, h = bbox
            x_max = x_min + w
            y_max = y_min + h

            # 转换为前端的 bbox: 两个点 [左上角, 右下角]
            points = [[x_min, y_min], [x_max, y_max]]
            shape_obj = {
                "id": shape_id,
                "label": label,
                "type": "bbox",
                "shape_type": "rectangle",
                "points": points,
                "attributes": {},
            }

    return shape_obj


# ==========================================
# 🌟 新增：从语义分割 Mask 逆向提取多边形
# ==========================================
def mask_to_shapes(
    mask_path: str, classes_map: list, import_zero_class: bool = False
) -> tuple:
    """
    读取单通道灰度掩码图，使用寻边算法还原出系统的 shapes 多边形。
    🌟 支持提取带“洞”的复杂多边形（如包裹着其他对象的背景类），并自动缝合为单路径。
    返回: (解析后的 shapes 列表, 统计字典, 图像宽, 图像高)
    """
    shapes = []
    stats = {"imported_polygons": 0, "dropped": 0}

    # 强制以单通道灰度模式读取
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return shapes, stats, 0, 0

    img_h, img_w = mask.shape[:2]
    unique_ids = np.unique(mask)

    for class_id in unique_ids:
        # 拦截 0 类（如果前端未开启导入 0 类开关）
        if class_id == 0 and not import_zero_class:
            continue

        label = (
            classes_map[class_id]
            if class_id < len(classes_map)
            else f"Class_{class_id}"
        )

        binary_mask = (mask == class_id).astype(np.uint8) * 255

        # 🌟 核心突破 1：使用 RETR_CCOMP 提取两层拓扑结构（0层是外轮廓，1层是洞）
        contours, hierarchy = cv2.findContours(
            binary_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        if hierarchy is None:
            continue

        hierarchy = hierarchy[0]

        # 找到所有的【纯外层轮廓】 (其 parent 属性等于 -1)
        outer_indices = [i for i, h in enumerate(hierarchy) if h[3] == -1]

        for i in outer_indices:
            outer_contour = contours[i].reshape(-1, 2)
            if len(outer_contour) < 3:
                stats["dropped"] += 1
                continue

            # 找到属于当前这个外轮廓的所有【内层的洞】 (其 parent 等于当前外轮廓的索引 i)
            inner_contours = []
            for j, h in enumerate(hierarchy):
                if h[3] == i:
                    inner_contour = contours[j].reshape(-1, 2)
                    if len(inner_contour) >= 3:
                        inner_contours.append(inner_contour)

            # 🌟 核心突破 2：将带有洞的结构“缝合”成一个连续的一笔画多边形
            polygon = outer_contour.tolist()

            for inner in inner_contours:
                poly_arr = np.array(polygon)
                min_dist = float("inf")
                best_i, best_j = 0, 0

                # 利用 numpy 矩阵运算极速寻找外轮廓和洞之间“最近的两个点”
                for j_idx, p_in in enumerate(inner):
                    # 计算洞上的一个点到当前外轮廓所有点的平方距离
                    dists = np.sum((poly_arr - p_in) ** 2, axis=1)
                    min_idx = np.argmin(dists)
                    if dists[min_idx] < min_dist:
                        min_dist = dists[min_idx]
                        best_i = min_idx
                        best_j = j_idx

                inner_list = inner.tolist()

                # 搭建隐形桥梁 (Seam / Bridge)
                # 路线：原外侧[...起点] -> 进洞走一圈 -> 原路退出 -> 原外侧[接续...]
                bridge = inner_list[best_j:] + inner_list[: best_j + 1]
                polygon = (
                    polygon[: best_i + 1]
                    + bridge
                    + [polygon[best_i]]
                    + polygon[best_i + 1 :]
                )

            # 最终的 polygon 是一个单一的数组，前端的普通多边形渲染组件能直接完美渲染它，且自动产生洞！
            shapes.append(
                {
                    "label": label,
                    "type": "polygon",
                    "shape_type": "polygon",
                    "points": polygon,
                    "attributes": {},
                }
            )
            stats["imported_polygons"] += 1

    return shapes, stats, img_w, img_h
