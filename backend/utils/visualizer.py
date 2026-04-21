import json
import math
import os

import cv2
import numpy as np


class LocalVisualizer:
    def __init__(self, config: dict):
        self.config = config
        self.mode = config.get("mode", "merged")
        self.layout = config.get("layout", "grid")
        self.columns = config.get("columns", 2)
        self.thickness = config.get("thickness", 2)
        self.alpha = config.get("alpha", 0.5)

        # 🌟 1. 定义前端同步的 Hex 颜色
        taxonomy_colors_hex = [
            # "#ef4444",
            "#22c55e",
            "#3b82f6",
            "#a855f7",
            "#f59e0b",
            "#06b6d4",
            "#ec4899",
            "#84cc16",
            "#f97316",
            "#14b8a6",
        ]

        # 🌟 2. 构建调色板 (Palette)
        # 类别 0: 设置为灰色 [128, 128, 128] 或者 纯黑 [0, 0, 0]
        # 注意：OpenCV 的颜色顺序是 [B, G, R]
        palette = [[128, 128, 128]]  # 这里我用了灰色，如果是纯黑就写 [0, 0, 0]

        # 解析前端的 Hex 为 BGR
        for hex_str in taxonomy_colors_hex:
            hex_str = hex_str.lstrip("#")
            r, g, b = tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))
            palette.append((b, g, r))  # 存入 BGR

        self.palettes = palette
        self.palettes_np = np.array(palette)

    def _stretch_16bit_to_8bit(
        self, img: np.ndarray, min_val: float, max_val: float
    ) -> np.ndarray:
        """核心算法：线性拉伸"""
        img_float = img.astype(np.float32)
        # 防止除零错误
        if max_val <= min_val:
            max_val = min_val + 1
        stretched = np.clip((img_float - min_val) / (max_val - min_val) * 255.0, 0, 255)
        return stretched.astype(np.uint8)

    def _create_error_placeholder(self, text: str, width=800, height=600):
        """当图片缺失时，生成一张带报错文字的黑图"""
        img = np.zeros((height, width, 3), dtype=np.uint8)
        cv2.putText(
            img, text, (50, height // 2), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2
        )
        return img

    def _load_and_transform_view(self, view_conf: dict, stem: str) -> np.ndarray:
        folder_path = view_conf.get("path") or view_conf.get("folder_path", "")
        suffix = view_conf.get("suffix", "")
        img_path = os.path.join(folder_path, f"{stem}{suffix}")

        if not os.path.exists(img_path):
            return self._create_error_placeholder(f"File Missing: {stem}{suffix}")

        # 1. 强制保留原始位深读取 (IMREAD_UNCHANGED)
        raw_img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
        if raw_img is None:
            return self._create_error_placeholder(f"Read Error: {stem}{suffix}")

        # 2. 波段提取 (默认取前3个波段)
        bands = view_conf.get("bands", [1, 2, 3])
        if raw_img.ndim == 3:
            # OpenCV 读入多波段，根据配置的 bands 提取
            channels = [raw_img[:, :, b - 1] for b in bands if b <= raw_img.shape[2]]
            if len(channels) == 3:
                img_data = cv2.merge(channels)
            elif len(channels) == 1:
                img_data = cv2.cvtColor(channels[0], cv2.COLOR_GRAY2BGR)
            else:
                img_data = raw_img[:, :, :3]
        else:
            img_data = cv2.cvtColor(raw_img, cv2.COLOR_GRAY2BGR)

        # 3. 线性拉伸映射
        transform = view_conf.get("transform", {})
        min_m, max_m = transform.get("minMax", [0, 255])

        # 如果是 16-bit 图像，或者配置了拉伸范围，进行拉伸
        if raw_img.dtype in [np.uint16, np.int16] or min_m != 0 or max_m != 255:
            img_data = self._stretch_16bit_to_8bit(img_data, min_m, max_m)

        return img_data

    def _read_image_raw(self, stem: str, v_conf: dict) -> np.ndarray:
        """底层方法：仅读取原始矩阵，支持 16-bit 和多光谱"""
        folder = v_conf.get("folder_path")
        suffix = v_conf.get("suffix", "")
        if not folder:
            return None

        path = os.path.join(folder, f"{stem}{suffix}")
        if os.path.exists(path):
            # 使用 IMREAD_UNCHANGED 确保能读出 16位图或单通道图
            img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
            return img
        return None

    def _process_bands_and_render(
        self, raw_img: np.ndarray, v_conf: dict
    ) -> np.ndarray:
        """核心步骤 1：处理波段映射与位深转换 (修复紫红通道与变黑Bug)"""
        if raw_img is None:
            return None

        # 1. 安全提取波段 (保持 OpenCV 的 BGR 顺序，拒绝紫红错乱)
        bands = v_conf.get("bands", [1, 2, 3])
        extracted = []
        channels = raw_img.shape[2] if raw_img.ndim == 3 else 1

        for b in bands:
            idx = int(b) - 1
            if 0 <= idx < channels:
                if channels == 1:
                    extracted.append(raw_img)
                else:
                    extracted.append(raw_img[:, :, idx])
            else:
                extracted.append(np.zeros(raw_img.shape[:2], dtype=raw_img.dtype))

        # 2. 组合为 3 通道
        if len(extracted) == 1:
            img_data = cv2.cvtColor(extracted[0], cv2.COLOR_GRAY2BGR)
        elif len(extracted) >= 3:
            img_data = cv2.merge([extracted[0], extracted[1], extracted[2]])
        else:
            img_data = cv2.merge(extracted)

        # 3. 动态位深拉伸 (修复 16位图变纯黑/白的问题)
        if img_data.dtype in [np.uint16, np.int16]:
            transform = v_conf.get("transform", {})
            min_m, max_m = transform.get("minMax", [None, None])

            # 如果前端没传精确的 minMax，必须用自身的最小最大值，防止数据溢出成黑图
            if min_m is None or max_m is None or (min_m == 0 and max_m == 255):
                min_m, max_m = float(img_data.min()), float(img_data.max())

            img_data = self._stretch_16bit_to_8bit(img_data, min_m, max_m)

        return img_data

    def _apply_transform_and_align(
        self, img: np.ndarray, transform: dict, target_shape: tuple
    ) -> np.ndarray:
        """核心步骤 2：🌟 严格执行用户的【先裁剪，后 Resize】逻辑"""
        target_h, target_w = target_shape
        if transform is None:
            return cv2.resize(img, (target_w, target_h))

        h, w = img.shape[:2]

        # 1. Base Crop (处理基础的 t, b, l, r 边界裁剪)
        crop = transform.get("crop", {})
        y1 = max(0, int(float(crop.get("t", 0)) / 100.0 * h))
        y2 = min(h, int(float(crop.get("b", 100)) / 100.0 * h))
        x1 = max(0, int(float(crop.get("l", 0)) / 100.0 * w))
        x2 = min(w, int(float(crop.get("r", 100)) / 100.0 * w))

        if y2 > y1 and x2 > x1:
            cropped = img[y1:y2, x1:x2]
        else:
            cropped = img

        sx = float(transform.get("scaleX", 1.0))
        sy = float(transform.get("scaleY", 1.0))
        tx = float(transform.get("offsetX", 0.0))
        ty = float(transform.get("offsetY", 0.0))

        # 对于 Main View 通常全为默认值，直接 resize 即可
        if sx == 1.0 and sy == 1.0 and tx == 0.0 and ty == 0.0:
            return cv2.resize(cropped, (target_w, target_h))

        # ==============================================================
        # 🌟 核心算法：逆向推导在原图中的 Viewport (视口) 裁剪框
        # 公式: X_canvas = X_img * sx + tx -> X_img = (X_canvas - tx) / sx
        # ==============================================================
        crop_left = int(-tx / sx)
        crop_right = int((target_w - tx) / sx)
        crop_top = int(-ty / sy)
        crop_bottom = int((target_h - ty) / sy)

        ch, cw = cropped.shape[:2]
        req_w = crop_right - crop_left
        req_h = crop_bottom - crop_top

        # 限制有效像素边界 (防止裁剪框跑出图片外部)
        x_start_img = max(0, crop_left)
        y_start_img = max(0, crop_top)
        x_end_img = min(cw, crop_right)
        y_end_img = min(ch, crop_bottom)

        x_pos_box = x_start_img - crop_left
        y_pos_box = y_start_img - crop_top

        # 2. 构造一块纯黑的 Crop 缓冲垫，用来接住裁剪出来的有效像素
        box_img = np.zeros((max(1, req_h), max(1, req_w), 3), dtype=cropped.dtype)

        if x_end_img > x_start_img and y_end_img > y_start_img:
            box_img[
                y_pos_box : y_pos_box + (y_end_img - y_start_img),
                x_pos_box : x_pos_box + (x_end_img - x_start_img),
            ] = cropped[y_start_img:y_end_img, x_start_img:x_end_img]

        # 3. 最后一步：将带有安全黑边的 Crop Box 平滑 Resize 到目标画布尺寸
        final_aligned = cv2.resize(box_img, (target_w, target_h))
        return final_aligned

    def _load_all_views(self, stem: str, view_configs: list) -> list:
        """图像获取总管：确保所有 View 都向 Main View 看齐"""
        if not view_configs:
            return []

        frames = []
        target_shape = None

        # Pass 1: 获取 Main View 并确立世界绝对画布基准
        main_conf = view_configs[0]
        main_raw = self._read_image_raw(stem, main_conf)

        if main_raw is None:
            target_shape = (600, 800)
            main_aligned = self._create_error_placeholder("Main View Missing", 800, 600)
        else:
            main_processed = self._process_bands_and_render(main_raw, main_conf)

            # 严格计算 Main View 的原始像素画布大小
            transform = main_conf.get("transform", {})
            crop = transform.get("crop", {})
            mh, mw = main_processed.shape[:2]

            t = max(0, int(float(crop.get("t", 0)) / 100.0 * mh))
            b = min(mh, int(float(crop.get("b", 100)) / 100.0 * mh))
            l = max(0, int(float(crop.get("l", 0)) / 100.0 * mw))
            r = min(mw, int(float(crop.get("r", 100)) / 100.0 * mw))

            target_h = max(10, b - t)
            target_w = max(10, r - l)
            target_shape = (target_h, target_w)

            # Main View 同样走一遍安全管线
            main_aligned = self._apply_transform_and_align(
                main_processed, transform, target_shape
            )

        frames.append(main_aligned)

        # Pass 2: 处理其余 Aug Views，全部强制 Crop 然后 Resize 到 target_shape
        for v_conf in view_configs[1:]:
            raw_img = self._read_image_raw(stem, v_conf)
            if raw_img is not None:
                processed = self._process_bands_and_render(raw_img, v_conf)
                aligned = self._apply_transform_and_align(
                    processed, v_conf.get("transform", {}), target_shape
                )
                frames.append(aligned)
            else:
                frames.append(
                    np.zeros((target_shape[0], target_shape[1], 3), dtype=np.uint8)
                )

        return frames

    def _process_annotations(
        self, stem: str, view_images: list, anno_config: dict
    ) -> list:
        """
        第二步：独立于视图的标注处理
        """
        task_type = anno_config.get("task_type")  # bbox, instance_seg, semantic_seg
        format_type = anno_config.get("format")  # yolo, coco, mask
        anno_folder = anno_config.get("folder_path")

        # 1. 解析标注文件 (伪代码：你需要根据 format_type 写具体的解析器)
        annotations = self.parse_annotation_file(stem, format_type, anno_folder)

        processed_frames = []
        for img in view_images:
            if task_type == "semantic_seg":
                # 【语义分割】：生成新的图像 (如色块 Mask)，覆盖或与原图混合
                mask_img = self._draw_semantic_mask(
                    img, annotations, anno_folder, stem, format_type
                )
                processed_frames.append(mask_img)
            else:
                # 【目标检测/实例分割】：在各个 View 的原图基础上直接画框/画多边形
                drawn_img = self._draw_vector_annotations(img.copy(), annotations)
                processed_frames.append(drawn_img)

        return processed_frames

    def _draw_semantic_mask(
        self, base_img: np.ndarray, folder_path: str, stem: str, suffix: str
    ) -> np.ndarray:
        """语义分割：使用自定义分类调色板进行精确颜色映射"""
        if not folder_path:
            return np.zeros_like(base_img)

        # 尝试拼接可能的掩码图路径
        mask_path = os.path.join(folder_path, f"{stem}{suffix}")

        if not os.path.exists(mask_path):
            for ext in [".png", ".tif", ".jpg", ".bmp"]:
                fallback_path = os.path.join(folder_path, f"{stem}{ext}")
                if os.path.exists(fallback_path):
                    mask_path = fallback_path
                    break

        if os.path.exists(mask_path):
            # 以灰度图模式读取 Mask (像素值代表 Class ID，例如 0, 1, 2...)
            mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            if mask is not None:
                mask = cv2.resize(
                    mask,
                    (base_img.shape[1], base_img.shape[0]),
                    interpolation=cv2.INTER_NEAREST,
                )

                # 特殊处理：有些二值化 Mask 会把类别 1 保存为 255，这里做个安全修正
                if mask.max() == 255 and len(np.unique(mask)) == 2:
                    mask[mask == 255] = 1

                # 🌟 核心防弹保护：防止 Mask 中出现了超过我们调色板长度的 Class ID
                # 比如模型预测出了类别 15，但我们的 taxonomy_colors 只有 10 个颜色
                # 使用 np.clip 将超出的 ID 强制限制在调色板最大索引内，或者使用求余数
                max_class_id = len(self.palettes) - 1
                safe_mask = np.clip(mask, 0, max_class_id)
                # 或者使用循环映射: safe_mask = np.where(mask > 0, ((mask - 1) % max_class_id) + 1, 0)

                # 🌟 终极魔法：NumPy 高级索引直接映射！
                # 这一行代码会把 shape 为 (H, W) 的 2D 数组，瞬间变成 (H, W, 3) 的 RGB 彩图
                # 速度是普通 Python 循环的几万倍
                colored_mask = self.palettes_np[safe_mask]

                return colored_mask

        return self._create_error_placeholder(
            f"Mask Not Found: {stem}", base_img.shape[1], base_img.shape[0]
        )

    def _draw_vector_annotations(
        self,
        img: np.ndarray,
        config: dict,
        stem: str,
        color: tuple,
        is_pred: bool = False,
    ) -> np.ndarray:
        """目标检测/实例分割：读取 YOLO/COCO/JSON 标注并在 Base 图上绘制真实形状"""
        if not config:
            return img

        # 兼容 GT 的 'folder_path' 和 Pred 的 'path'
        base_path = config.get("folder_path") or config.get("path")
        if not base_path:
            return img

        format_type = config.get("format", "yolo").lower()
        suffix = config.get("suffix", "")
        task_type = config.get("task_type", config.get("taskType", "bbox")).lower()
        class_file = config.get("class_file", config.get("classFile", ""))

        h, w = img.shape[:2]

        try:
            t = int(float(self.thickness))
        except (ValueError, TypeError):
            t = 2

        shapes = []

        try:
            # ==========================================
            # 解析 1: YOLO 格式 (.txt)
            # ==========================================
            if format_type == "yolo":
                txt_path = os.path.join(base_path, f"{stem}{suffix}.txt")
                if not os.path.exists(txt_path):
                    txt_path = os.path.join(base_path, f"{stem}.txt")  # 降级兼容

                if os.path.exists(txt_path):
                    # 读取类别映射文件
                    classes_map = []
                    if class_file and os.path.exists(class_file):
                        with open(class_file, "r", encoding="utf-8") as f:
                            classes_map = [
                                line.strip() for line in f.readlines() if line.strip()
                            ]

                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = f.readlines()

                    # 复用 format_converters 的函数
                    from utils.format_converters import yolo_to_shapes

                    shapes, _ = yolo_to_shapes(lines, w, h, classes_map)

            # ==========================================
            # 解析 2: COCO 格式 (.json)
            # ==========================================
            elif format_type == "coco":
                # COCO 的 base_path 是一个单一的 .json 文件
                if os.path.exists(base_path) and base_path.endswith(".json"):
                    with open(base_path, "r", encoding="utf-8") as f:
                        coco_data = json.load(f)

                    # 寻找匹配的 image_id
                    img_id = None
                    for image in coco_data.get("images", []):
                        file_name = image.get("file_name", "")
                        if file_name.startswith(stem):
                            img_id = image.get("id")
                            break

                    if img_id is not None:
                        classes_map = {
                            cat["id"]: cat["name"]
                            for cat in coco_data.get("categories", [])
                        }
                        anns = [
                            ann
                            for ann in coco_data.get("annotations", [])
                            if ann.get("image_id") == img_id
                        ]

                        from utils.format_converters import coco_ann_to_shape

                        coco_mode = "polygon" if task_type == "instance_seg" else "bbox"

                        for ann in anns:
                            shape = coco_ann_to_shape(
                                ann, classes_map, coco_mode=coco_mode
                            )
                            if shape:
                                shapes.append(shape)

            # ==========================================
            # 解析 3: 原生 MultiAnno 格式 (.json)
            # ==========================================
            elif format_type == "multianno":
                json_path = os.path.join(base_path, f"{stem}{suffix}.json")
                if not os.path.exists(json_path):
                    json_path = os.path.join(base_path, f"{stem}.json")

                if os.path.exists(json_path):
                    with open(json_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        shapes = (
                            data if isinstance(data, list) else data.get("shapes", [])
                        )

        except Exception as e:
            print(f"解析标注文件失败: {str(e)}")
            return img

        # ==========================================
        # 统一绘制提取出的 Shapes
        # ==========================================
        for shape in shapes:
            shape_type = shape.get("type", shape.get("shape_type", "bbox")).lower()
            points = shape.get("points", [])
            base_label = shape.get("label", "")
            score = shape.get("score", 1.0)
            class_id = shape.get("class_id", -1)
            if class_id >= 0:
                current_color = self.palettes[class_id % len(self.palettes)]
            else:
                current_color = color

            if is_pred:
                display_label = (
                    f"{base_label} {score:.2f}" if base_label else f"{score:.2f}"
                )
            else:
                display_label = base_label

            if not points:
                continue

            # 绘制边界框 (BBox)
            if shape_type in ["bbox", "rectangle"] and len(points) == 2:
                pt1 = (int(points[0][0]), int(points[0][1]))
                pt2 = (int(points[1][0]), int(points[1][1]))
                cv2.rectangle(img, pt1, pt2, current_color, t)

                # 绘制文字标签
                if display_label:
                    text_size = cv2.getTextSize(
                        display_label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, max(1, t - 1)
                    )[0]
                    cv2.rectangle(
                        img,
                        (pt1[0], pt1[1] - text_size[1] - 5),
                        (pt1[0] + text_size[0], pt1[1]),
                        current_color,
                        -1,
                    )
                    cv2.putText(
                        img,
                        display_label,
                        (pt1[0], pt1[1] - 5),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (255, 255, 255) if current_color[1] < 200 else (0, 0, 0),
                        max(1, t - 1),
                    )

            # 绘制多边形 (Polygon)
            elif shape_type == "polygon" and len(points) >= 3:
                pts = np.array(points, np.int32).reshape((-1, 1, 2))
                cv2.polylines(
                    img, [pts], isClosed=True, color=current_color, thickness=t
                )

                if display_label:
                    pt1 = (int(points[0][0]), int(points[0][1]))
                    # 为了在多边形上也能看清，同样加上底色背板
                    text_size = cv2.getTextSize(
                        display_label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, max(1, t - 1)
                    )[0]
                    cv2.rectangle(
                        img,
                        (pt1[0], pt1[1] - text_size[1] - 5),
                        (pt1[0] + text_size[0], pt1[1]),
                        current_color,
                        -1,
                    )
                    cv2.putText(
                        img,
                        display_label,
                        (pt1[0], pt1[1] - 5),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (255, 255, 255) if current_color[1] < 200 else (0, 0, 0),
                        max(1, t - 1),
                    )

        return img

    def _assemble_layout(self, frames: list) -> np.ndarray:
        """多视图拼图引擎"""
        if not frames:
            return self._create_error_placeholder("No frames to assemble")

        if self.mode == "separate":
            return frames[0]  # Separate 模式下，预览仅返回第一张

        # 简单 Grid 排版 (假设所有图已经被 resize 到一样大)
        # 为保证不报错，强行将所有图 resize 到第一张图的尺寸
        target_shape = frames[0].shape[:2]
        resized_frames = [
            cv2.resize(f, (target_shape[1], target_shape[0])) for f in frames
        ]

        cols = min(self.columns, len(resized_frames))
        rows = math.ceil(len(resized_frames) / cols)

        h, w = target_shape
        canvas = np.zeros((h * rows, w * cols, 3), dtype=np.uint8)

        for idx, frame in enumerate(resized_frames):
            r = idx // cols
            c = idx % cols
            canvas[r * h : (r + 1) * h, c * w : (c + 1) * w] = frame

        return canvas

    def assemble_custom_layout(self, frames: list, layout_settings: dict) -> np.ndarray:
        """🌟 智能多视图动态拼图引擎 (匹配前端配置)"""
        if not frames:
            return self._create_error_placeholder("No frames to assemble")

        layout_mode = layout_settings.get("layout", "grid")
        rows = int(layout_settings.get("rows", 1))
        cols = int(layout_settings.get("cols", len(frames)))

        # 为保证排版整齐，强行将所有图 Resize 到第一张图（Main View）的尺寸
        target_shape = frames[0].shape[:2]
        h, w = target_shape
        resized_frames = [cv2.resize(f, (w, h)) for f in frames]

        # 计算并创建黑色大画布
        canvas_h = h * rows
        canvas_w = w * cols
        canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

        # 遍历填入网格
        for idx, frame in enumerate(resized_frames):
            # 防止图层数超过网格容量
            if idx >= rows * cols:
                break

            if layout_mode == "horizontal":
                r, c = 0, idx
            elif layout_mode == "vertical":
                r, c = idx, 0
            else:  # grid
                r = idx // cols
                c = idx % cols

            # 将图像贴入画布的对应位置
            canvas[r * h : (r + 1) * h, c * w : (c + 1) * w] = frame

        return canvas

    def render_scene_group(
        self, stem: str, view_configs: list, anno_config: dict = None
    ) -> np.ndarray:
        """
        🚀 终极渲染管线 (Pipeline)
        """
        # Step 1: 加载获取 N 个独立的 View 图像
        view_images = self._load_all_views(stem, view_configs)

        # Step 2: 如果配置了标注，执行标注叠加或 Mask 生成
        if anno_config and anno_config.get("folder_path"):
            view_images = self._process_annotations(stem, view_images, anno_config)

        # Step 3: 根据模式，执行最终的多视图排版拼接
        final_canvas = self._assemble_layout(view_images)

        return final_canvas

    def render_separated_layers(
        self,
        stem: str,
        view_configs: list,
        anno_config: dict = None,
        pred_configs: list = None,
    ) -> dict:
        """
        🚀 终极多通道渲染管线 (带防弹容错机制)
        """
        result_layers = {}

        # 1. 尝试加载原始图像
        try:
            view_images = self._load_all_views(stem, view_configs)
            for idx, v_conf in enumerate(view_configs):
                view_name = v_conf.get("name", f"view_{idx}")
                result_layers[f"{view_name} (Original)"] = view_images[idx].copy()
        except Exception as e:
            result_layers["Fatal Error (Base Images)"] = self._create_error_placeholder(
                f"Load Error: {str(e)}"
            )
            return result_layers

        # 2. 处理真实标注 (Ground Truth)
        if anno_config and anno_config.get("folder_path"):
            try:
                task_type = anno_config.get("task_type")
                if task_type == "semantic_seg":
                    main_base = view_images[0].copy()
                    mask_img = self._draw_semantic_mask(
                        main_base,
                        anno_config.get("folder_path"),
                        stem,
                        anno_config.get("suffix", ""),
                    )
                    result_layers["Ground Truth (Semantic Mask)"] = mask_img
                else:
                    for idx, v_conf in enumerate(view_configs):
                        view_name = v_conf.get("name", f"view_{idx}")
                        base_img = view_images[idx].copy()
                        drawn_img = self._draw_vector_annotations(
                            base_img,
                            anno_config,  # 🌟 核心修复 1：直接传入完整的 anno_config 字典
                            stem,
                            color=(0, 255, 0),
                            is_pred=False,
                        )
                        result_layers[f"{view_name} (GT BBox/Polygon)"] = drawn_img
            except Exception as e:
                import traceback

                traceback.print_exc()
                h, w = view_images[0].shape[:2]
                result_layers["GT Render Error"] = self._create_error_placeholder(
                    f"GT Error: {str(e)}", w, h
                )

        # 3. 处理预测结果 (Predictions)
        if pred_configs:
            for p_idx, pred in enumerate(pred_configs):
                if not pred.get("path"):
                    continue
                p_name = pred.get("name", f"Pred_{p_idx}")
                p_task = pred.get("taskType")

                try:
                    if p_task == "semantic_seg":
                        main_base = view_images[0].copy()
                        pred_mask = self._draw_semantic_mask(
                            main_base, pred.get("path"), stem, pred.get("suffix", "")
                        )
                        result_layers[f"{p_name} (Semantic Mask)"] = pred_mask
                    else:
                        for idx, v_conf in enumerate(view_configs):
                            view_name = v_conf.get("name", f"view_{idx}")
                            base_img = view_images[idx].copy()
                            drawn_img = self._draw_vector_annotations(
                                base_img,
                                pred,  # 🌟 核心修复 2：直接传入完整的 pred 字典
                                stem,
                                color=(0, 165, 255),
                                is_pred=True,
                            )
                            result_layers[f"{view_name} ({p_name} Result)"] = drawn_img
                except Exception as e:
                    import traceback

                    traceback.print_exc()
                    h, w = view_images[0].shape[:2]
                    result_layers[f"{p_name} Render Error"] = (
                        self._create_error_placeholder(f"Pred Error: {str(e)}", w, h)
                    )

        return result_layers
