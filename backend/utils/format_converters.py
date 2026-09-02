# backend/utils/format_converters.py
import json
import math
import os
import uuid
import xml.etree.ElementTree as ET

import cv2
import numpy as np


def normalize_shape_type(shape_type) -> str:
    """Normalize legacy/external shape names to MultiAnno canonical names."""
    normalized = str(shape_type or "bbox").lower()
    if normalized == "rectangle":
        return "bbox"
    if normalized == "linestrip":
        return "line"
    return normalized


def get_bounding_box(shape_type: str, points: list) -> list:
    """将任何形状转换为 [xmin, ymin, xmax, ymax] 的绝对边界框"""
    if not points:
        return []

    # 🌟 统一名称映射防御
    shape_type = normalize_shape_type(shape_type)

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
    shape_type = normalize_shape_type(shape_type)

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
    allowed_shapes_normalized = {normalize_shape_type(s) for s in allowed_shapes}

    for shape in shapes:
        label = shape.get("label")
        shape_type = normalize_shape_type(shape.get("shape_type", "bbox"))

        if label not in selected_classes or shape_type not in allowed_shapes_normalized:
            stats["discarded"] += 1
        else:
            stats["native"] += 1  # MultiAnno 原生支持所有合法形状
            normalized_shape = dict(shape)
            normalized_shape["shape_type"] = shape_type
            if "type" in normalized_shape:
                normalized_shape["type"] = normalize_shape_type(normalized_shape.get("type"))
            filtered_shapes.append(normalized_shape)

    return filtered_shapes, stats


def ma_to_yolo(
    ma_path,
    yolo_path,
    selected_classes,
    allowed_shapes,
    task_type,
    include_empty: bool = False,
    attributes_map: dict = None,
    include_attributes: bool = False,
):
    """将 MultiAnno 格式的标注文件转换为 YOLO 格式"""
    if not os.path.exists(ma_path):
        if include_empty:
            with open(yolo_path, "w", encoding="utf-8"):
                pass
            return True
        return False
    with open(ma_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    shapes = data.get("shapes", [])
    yolo_lines, stats = convert_to_yolo(
        shapes,
        data.get("imageWidth", 1),
        data.get("imageHeight", 1),
        selected_classes,
        allowed_shapes,
        task_type,
        attributes_map=attributes_map,
        include_attributes=include_attributes,
    )
    if yolo_lines or include_empty:
        with open(yolo_path, "w", encoding="utf-8") as f:
            f.write("\n".join(yolo_lines))
        return True
    return False


def ma_to_voc(
    ma_path,
    voc_path,
    selected_classes,
    allowed_shapes,
    task_type,
    include_empty: bool = False,
):
    """将 MultiAnno 格式的标注文件转换为 Pascal VOC XML（检测框）"""
    if not os.path.exists(ma_path):
        if not include_empty:
            return False
        data = {}
    else:
        with open(ma_path, "r", encoding="utf-8") as f:
            data = json.load(f)

    shapes = data.get("shapes", [])
    img_w = max(1, int(data.get("imageWidth", 1)))
    img_h = max(1, int(data.get("imageHeight", 1)))
    img_d = max(1, int(data.get("imageDepth", 3)))
    image_path = data.get("imagePath", "")
    file_name = (
        os.path.basename(image_path)
        if image_path
        else f"{os.path.splitext(os.path.basename(ma_path))[0]}.jpg"
    )
    allowed_shapes_lower = [s.lower() for s in allowed_shapes]

    root = ET.Element("annotation")
    ET.SubElement(root, "folder").text = os.path.basename(
        os.path.dirname(image_path)
    ) or "images"
    ET.SubElement(root, "filename").text = file_name
    ET.SubElement(root, "path").text = image_path

    source = ET.SubElement(root, "source")
    ET.SubElement(source, "database").text = "Unknown"

    size = ET.SubElement(root, "size")
    ET.SubElement(size, "width").text = str(img_w)
    ET.SubElement(size, "height").text = str(img_h)
    ET.SubElement(size, "depth").text = str(img_d)
    ET.SubElement(root, "segmented").text = "0"

    has_object = False
    for shape in shapes:
        label = shape.get("label")
        shape_type = normalize_shape_type(shape.get("shape_type", "unknown"))

        if label not in selected_classes or shape_type not in allowed_shapes_lower:
            continue

        raw_points = shape.get("points", [])
        bbox = get_bounding_box(shape_type, raw_points)
        if not bbox:
            continue

        xmin, ymin, xmax, ymax = bbox
        xmin = max(0, min(img_w - 1, int(round(xmin))))
        ymin = max(0, min(img_h - 1, int(round(ymin))))
        xmax = max(0, min(img_w - 1, int(round(xmax))))
        ymax = max(0, min(img_h - 1, int(round(ymax))))
        if xmax <= xmin or ymax <= ymin:
            continue

        obj = ET.SubElement(root, "object")
        ET.SubElement(obj, "name").text = str(label)
        ET.SubElement(obj, "pose").text = "Unspecified"
        ET.SubElement(obj, "truncated").text = "0"
        ET.SubElement(obj, "difficult").text = "0"

        bndbox = ET.SubElement(obj, "bndbox")
        ET.SubElement(bndbox, "xmin").text = str(xmin)
        ET.SubElement(bndbox, "ymin").text = str(ymin)
        ET.SubElement(bndbox, "xmax").text = str(xmax)
        ET.SubElement(bndbox, "ymax").text = str(ymax)
        has_object = True

    if not has_object and not include_empty:
        return False

    ET.ElementTree(root).write(voc_path, encoding="utf-8", xml_declaration=True)
    return True


def ma_to_coco(ma_path, coco_path, selected_classes, allowed_shapes, task_type):
    """将单个 MultiAnno 标注文件转换为 COCO JSON"""
    if not os.path.exists(ma_path):
        return False

    with open(ma_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    image_path = data.get("imagePath", "")
    file_name = os.path.basename(image_path) or f"{os.path.splitext(os.path.basename(ma_path))[0]}.jpg"
    anns, _, _ = convert_to_coco_anns(
        data.get("shapes", []), 1, 1, selected_classes, allowed_shapes
    )

    if not anns:
        return False

    coco_dict = {
        "images": [
            {
                "id": 1,
                "file_name": file_name,
                "width": data.get("imageWidth", 1),
                "height": data.get("imageHeight", 1),
            }
        ],
        "annotations": anns,
        "categories": [
            {"id": i, "name": name} for i, name in enumerate(selected_classes)
        ],
    }
    with open(coco_path, "w", encoding="utf-8") as f:
        json.dump(coco_dict, f, ensure_ascii=False)
    return True


def convert_to_yolo(
    shapes: list,
    img_w: int,
    img_h: int,
    selected_classes: list,
    allowed_shapes: list,
    task_type: str,
    attributes_map: dict = None,
    include_attributes: bool = False,
) -> tuple:
    yolo_lines = []
    stats = {"native": 0, "converted": 0, "discarded": 0}
    img_w, img_h = max(1, img_w), max(1, img_h)

    # 多属性检测 (mdet) 导出开关:开启时检测分支写 `cls na a1..ana cx cy w h`。
    mdet_enabled = bool(include_attributes and attributes_map)
    na = len(attributes_map) if attributes_map else 0

    for shape in shapes:
        label = shape.get("label")
        shape_type = normalize_shape_type(shape.get("shape_type", "unknown"))
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

            if mdet_enabled:
                # `cls na a1..ana cx cy w h` —— 属性按配置顺序编码为级别索引(缺值落 0)。
                shape_attrs = shape.get("attributes") or {}
                enc = [
                    _encode_attribute_value(
                        shape_attrs.get(name), attributes_map[name]
                    )
                    for name in attributes_map
                ]
                yolo_lines.append(
                    f"{class_id} {na} {' '.join(str(x) for x in enc)} "
                    f"{x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}"
                )
            else:
                yolo_lines.append(
                    f"{class_id} {x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}"
                )

            if shape_type == "bbox":
                stats["native"] += 1
            else:
                stats["converted"] += 1
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
        shape_type = normalize_shape_type(shape.get("shape_type", shape.get("type", "bbox")))

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
        shape_type = normalize_shape_type(shape.get("shape_type", shape.get("type", "bbox")))

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
    return mask, stats


def parse_attributes_config(path) -> dict:
    """
    解析属性配置文件，返回有序字典 {属性名: [级别名...]}。

    兼容 ultralytics 的 data.yaml（含 `attributes:` 块）或裸的 ``{属性名: [级别...]}``
    字典（YAML/JSON 均可）。na = 键数，nal = 级别列表的最大长度。

    YAML 1.1 会把 ``no/yes/on/off`` 当作布尔值解析，而属性级别名常是这类短词
    （如 surface_missing: [no, yes]）。这里用保留原始拼写的字符串加载器读取，
    避免级别名被静默改写成 False/True。
    """
    import yaml

    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"属性配置文件不存在: {path}")

    class _StringLoader(yaml.SafeLoader):
        pass

    # SafeLoader 默认解析 bool/int/float/null 等标量标签；全部按原始字符串读取。
    for _tag in (
        "tag:yaml.org,2002:str",
        "tag:yaml.org,2002:int",
        "tag:yaml.org,2002:float",
        "tag:yaml.org,2002:bool",
        "tag:yaml.org,2002:timestamp",
    ):
        _StringLoader.add_constructor(
            _tag, lambda loader, node: loader.construct_scalar(node)
        )
    _StringLoader.add_constructor("tag:yaml.org,2002:null", lambda loader, node: "")

    def _safe_load(raw_text):
        return yaml.load(raw_text, Loader=_StringLoader)

    suffix = os.path.splitext(path)[1].lower()
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    try:
        if suffix == ".json":
            data = json.loads(raw)
        elif suffix in (".yaml", ".yml"):
            data = _safe_load(raw)
        else:
            # 无扩展名时按 YAML 兼容格式尝试
            data = _safe_load(raw)
    except Exception as e:
        raise ValueError(f"属性配置文件解析失败 ({path}): {e}")

    if data is None:
        raise ValueError(f"属性配置文件为空: {path}")
    if isinstance(data, dict) and "attributes" in data:
        attributes = data["attributes"]
    else:
        attributes = data  # 裸 `{属性名: [级别...]}` 字典

    if not isinstance(attributes, dict) or not attributes:
        raise ValueError(f"属性配置中未找到有效的 attributes 块: {path}")

    attributes_map = {}
    for name, levels in attributes.items():
        if not isinstance(levels, (list, tuple)) or not levels:
            raise ValueError(f"属性 '{name}' 的级别列表为空或无效: {path}")
        attributes_map[str(name)] = [str(x) for x in levels]
    return attributes_map


def _encode_attribute_value(value, levels: list) -> int:
    """将标注中的属性值编码为级别索引（缺值/未知值回退到 0，0 恒为合法索引）。"""
    if value is None:
        return 0
    try:
        idx = levels.index(str(value))
        return idx
    except (ValueError, TypeError):
        pass
    try:
        idx = int(value)
        if 0 <= idx < len(levels):
            return idx
    except (ValueError, TypeError):
        pass
    return 0


def _decode_mdet_attributes(
    values: list[float],
    attributes_map: dict,
    *,
    probability_layout: bool,
    nal: int,
) -> dict:
    """将 mdet 行中的离散索引或概率通道转换为 MultiAnno 属性字典。"""
    attribute_names = list(attributes_map)
    if probability_layout:
        # Ultralytics 的多分类输出按属性连续排列为 [na, nal]，每个属性
        # 取 argmax；属性级别不足全局 nal 时，行为与其 Results 解码保持一致。
        attributes = {}
        for index, name in enumerate(attribute_names):
            levels = attributes_map[name]
            start = index * nal
            probabilities = values[start : start + nal]
            if len(probabilities) != nal:
                raise ValueError("属性概率通道数量不足")
            level_index = max(range(nal), key=probabilities.__getitem__)
            level_index = min(level_index, len(levels) - 1)
            attributes[name] = levels[level_index]
        return attributes

    attributes = {}
    for name, value in zip(attribute_names, values):
        if not math.isfinite(value):
            raise ValueError("属性索引不是有限数值")
        level_index = int(round(value))
        levels = attributes_map[name]
        attributes[name] = (
            levels[level_index]
            if 0 <= level_index < len(levels)
            else str(level_index)
        )
    return attributes


def yolo_to_shapes(
    yolo_lines: list,
    img_w: int,
    img_h: int,
    classes_map: list,
    attributes_map: dict = None,
) -> tuple:
    """
    将 YOLO txt 行逆向解析为系统的 shapes
    返回: (解析后的 shapes 列表, 统计字典)

    提供 ``attributes_map`` 时，支持以下多属性检测 (mdet) 格式：

    - 离散标签：`cls na a1..ana cx cy w h [score]`
    - 多分类概率：`cls (na*nal) p1..p(na*nal) cx cy w h [score]`

    其余行行为不变（向后兼容标准 YOLO 与多边形 YOLO）。
    """
    shapes = []
    stats = {
        "imported_bboxes": 0,
        "imported_attribute_bboxes": 0,
        "imported_attribute_probability_bboxes": 0,
        "imported_polygons": 0,
        "attribute_dropped": 0,
        "dropped": 0,
    }

    img_w = max(1, img_w)
    img_h = max(1, img_h)

    na = len(attributes_map) if attributes_map else 0
    nal = max(
        (len(levels) for levels in attributes_map.values()), default=0
    ) if attributes_map else 0
    mdet_channel_counts = {na, na * nal} if na and nal else set()

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

        # 🌟 多属性检测 (mdet): 仅在显式提供属性配置时识别，必须在 polygon
        # 判定之前处理，避免概率通道被误当作多边形坐标。
        line_na = None
        if na > 0:
            try:
                line_na = int(parts[1])
            except (IndexError, ValueError):
                line_na = None

        mdet_candidate = line_na in mdet_channel_counts
        mdet_layout = mdet_candidate and len(parts) in (
            6 + line_na,
            7 + line_na,
        )
        if mdet_candidate and not mdet_layout:
            # 属性配置已明确表明这是 mdet 导入；不要静默回退为 polygon。
            stats["attribute_dropped"] += 1
            stats["dropped"] += 1
            continue
        if mdet_layout:
            try:
                attribute_values = [
                    float(x) for x in parts[2 : 2 + line_na]
                ]
                coord_start = 2 + line_na
                xc, yc, w, h = map(float, parts[coord_start : coord_start + 4])
                score = (
                    float(parts[coord_start + 4])
                    if len(parts) == 7 + line_na
                    else 1.0
                )
                probability_layout = line_na == na * nal and nal > 1
                attributes = _decode_mdet_attributes(
                    attribute_values,
                    attributes_map,
                    probability_layout=probability_layout,
                    nal=nal,
                )
            except (TypeError, ValueError, IndexError):
                stats["attribute_dropped"] += 1
                stats["dropped"] += 1
                continue

            abs_xc, abs_yc = xc * img_w, yc * img_h
            abs_w, abs_h = w * img_w, h * img_h
            xmin, ymin = abs_xc - abs_w / 2, abs_yc - abs_h / 2
            xmax, ymax = abs_xc + abs_w / 2, abs_yc + abs_h / 2

            shapes.append(
                {
                    "label": label,
                    "class_id": class_id,
                    "type": "bbox",
                    "score": score,
                    "shape_type": "bbox",
                    "points": [[xmin, ymin], [xmax, ymax]],
                    "attributes": attributes,
                }
            )
            stats["imported_attribute_bboxes"] += 1
            if probability_layout:
                stats["imported_attribute_probability_bboxes"] += 1
            continue

        is_bbox = len(parts) == 5 or len(parts) == 6
        is_polygon = len(parts) > 6
        score = 1.0  # 🌟 如果没有分数，默认设置为 1.0

        # 目标检测 (5个值 -> 还原为 bbox)
        if is_bbox:
            if len(parts) >= 6:
                score = float(parts[5])
            xc, yc, w, h = map(float, parts[1:5])
            abs_xc, abs_yc = xc * img_w, yc * img_h
            abs_w, abs_h = w * img_w, h * img_h

            xmin, ymin = abs_xc - abs_w / 2, abs_yc - abs_h / 2
            xmax, ymax = abs_xc + abs_w / 2, abs_yc + abs_h / 2

            shapes.append(
                {
                    "label": label,
                    "class_id": class_id,
                    "type": "bbox",
                    "score": score,
                    "shape_type": "bbox",
                    "points": [[xmin, ymin], [xmax, ymax]],
                    "attributes": {},
                }
            )
            stats["imported_bboxes"] += 1

        # 实例分割 (多边形点阵 -> 还原为 polygon)
        elif is_polygon:
            if len(parts) % 2 == 0:  # 长度为偶数说明最后多了一个 score
                score = float(parts[-1])
                coords = parts[1:-1]
            else:
                coords = parts[1:]
            points_flat = list(map(float, coords))
            points = []
            for i in range(0, len(points_flat), 2):
                points.append([points_flat[i] * img_w, points_flat[i + 1] * img_h])

            shapes.append(
                {
                    "label": label,
                    "class_id": class_id,
                    "type": "polygon",
                    "score": score,
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
    score = ann.get("score", 1.0)

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
                "class_id": cat_id,
                "label": label,
                "type": "polygon",
                "score": score,
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
                "class_id": cat_id,
                "label": label,
                "type": "bbox",
                "score": score,
                "shape_type": "bbox",
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
