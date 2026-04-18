import json
import os
import shutil
from pathlib import Path


def get_native_jsons(source_dirs):
    jsons = []
    for d in source_dirs:
        if os.path.exists(d):
            jsons.extend(
                [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".json")]
            )
    return jsons


async def export_to_multianno(req):
    """原生导出：只复制属于 selected_classes 的标注并携带关联图片"""
    native_jsons = get_native_jsons(req.source_dirs)
    exported_count = 0

    for j_path in native_jsons:
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 过滤需要的形状
        filtered_shapes = [
            s for s in data.get("shapes", []) if s.get("label") in req.selected_classes
        ]
        if not filtered_shapes and len(data.get("shapes", [])) > 0:
            continue  # 如果过滤后空了，跳过导出（可选策略）

        data["shapes"] = filtered_shapes

        # 组装最终文件名
        base_stem = data.get("stem", Path(j_path).stem)
        target_json_name = f"{base_stem}{req.custom_suffix}{req.extension}"

        with open(
            os.path.join(req.target_dir, target_json_name), "w", encoding="utf-8"
        ) as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        exported_count += 1

    return {
        "status": "success",
        "message": f"MultiAnno: 成功导出 {exported_count} 个场景。",
    }


async def export_to_yolo(req):
    """YOLO 导出：数学投影为 Normalized BBox"""
    native_jsons = get_native_jsons(req.source_dirs)
    exported_count = 0
    classes = req.selected_classes  # 前端已经完美排好序了！

    for j_path in native_jsons:
        with open(j_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        w, h = data.get("imageWidth", 1), data.get("imageHeight", 1)
        base_stem = data.get("stem", Path(j_path).stem)
        yolo_lines = []

        for shape in data.get("shapes", []):
            label = shape.get("label")
            if label not in classes:
                continue

            class_id = classes.index(label)
            points = shape.get("points", [])
            if not points:
                continue

            # 核心：无论多边形还是矩形，全部提取外接矩形
            x_coords = [p[0] for p in points]
            y_coords = [p[1] for p in points]
            xmin, xmax = min(x_coords), max(x_coords)
            ymin, ymax = min(y_coords), max(y_coords)

            # YOLO 归一化计算
            x_center = ((xmin + xmax) / 2) / w
            y_center = ((ymin + ymax) / 2) / h
            box_w = (xmax - xmin) / w
            box_h = (ymax - ymin) / h

            # 限制在 0-1 之间
            x_center, y_center = max(0, min(1, x_center)), max(0, min(1, y_center))
            box_w, box_h = max(0, min(1, box_w)), max(0, min(1, box_h))

            yolo_lines.append(
                f"{class_id} {x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}"
            )

        if yolo_lines:
            target_txt_name = f"{base_stem}{req.custom_suffix}{req.extension}"
            with open(os.path.join(req.target_dir, target_txt_name), "w") as tf:
                tf.write("\n".join(yolo_lines))
            exported_count += 1

    # 顺手生成 classes.txt
    with open(os.path.join(req.target_dir, "classes.txt"), "w", encoding="utf-8") as cf:
        cf.write("\n".join(classes))

    return {
        "status": "success",
        "message": f"YOLO: 生成 {exported_count} 个 txt，及 classes.txt。",
    }


async def export_to_coco(req):
    """COCO 导出：构建标准的 COCO JSON 树"""
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

        w, h = data.get("imageWidth", 1), data.get("imageHeight", 1)
        base_stem = data.get("stem", Path(j_path).stem)

        coco_dict["images"].append(
            {
                "id": img_id_counter,
                "file_name": f"{base_stem}.jpg",  # 假设图片后缀
                "width": w,
                "height": h,
            }
        )

        for shape in data.get("shapes", []):
            label = shape.get("label")
            if label not in req.selected_classes:
                continue

            cat_id = req.selected_classes.index(label)
            points = shape.get("points", [])

            x_coords = [p[0] for p in points]
            y_coords = [p[1] for p in points]
            xmin, ymin = min(x_coords), min(y_coords)
            box_w, box_h = max(x_coords) - xmin, max(y_coords) - ymin

            # 展平 points 用于 COCO segmentation [x1,y1, x2,y2...]
            flat_points = [coord for pt in points for coord in pt]

            coco_dict["annotations"].append(
                {
                    "id": ann_id_counter,
                    "image_id": img_id_counter,
                    "category_id": cat_id,
                    "bbox": [xmin, ymin, box_w, box_h],
                    "segmentation": [flat_points],
                    "area": box_w * box_h,
                    "iscrowd": 0,
                }
            )
            ann_id_counter += 1

        img_id_counter += 1

    target_json_name = f"instances_default{req.custom_suffix}{req.extension}"
    with open(
        os.path.join(req.target_dir, target_json_name), "w", encoding="utf-8"
    ) as f:
        json.dump(coco_dict, f, ensure_ascii=False)

    return {
        "status": "success",
        "message": f"COCO: 成功导出 {img_id_counter - 1} 张图的标注。",
    }
