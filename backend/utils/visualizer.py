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

    def _load_all_views(self, stem: str, view_configs: list) -> list:
        """
        第一步：纯粹的加载，返回 N 个 View 的独立图像列表
        """
        frames = []
        for v_conf in view_configs:
            img_array = self._load_and_transform_view(v_conf, stem)
            frames.append(img_array)
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
        # annotations = parse_annotation_file(stem, format_type, anno_folder)
        annotations = []  # 这里假设返回了解析好的标准数据结构

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
        """语义分割渲染：读取掩码图并上色（若为单类别则返回黑白或伪彩）"""
        if not folder_path:
            return np.zeros_like(base_img)

        # 尝试拼接可能的掩码图路径
        mask_path = os.path.join(folder_path, f"{stem}{suffix}")

        # 兼容性寻找：如果没有找到精确后缀，尝试寻找 .png, .tif 等
        if not os.path.exists(mask_path):
            for ext in [".png", ".tif", ".jpg", ".bmp"]:
                fallback_path = os.path.join(folder_path, f"{stem}{ext}")
                if os.path.exists(fallback_path):
                    mask_path = fallback_path
                    break

        if os.path.exists(mask_path):
            mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            if mask is not None:
                # 调整 Mask 尺寸以严格匹配当前的 Base View
                mask = cv2.resize(
                    mask,
                    (base_img.shape[1], base_img.shape[0]),
                    interpolation=cv2.INTER_NEAREST,
                )

                # 简单映射：将灰度值放大（避免都是0和1看不见），然后应用伪彩
                # 如果业务需求是保留黑白，可以直接返回 cv2.cvtColor(mask * 255, cv2.COLOR_GRAY2BGR)
                colored_mask = cv2.applyColorMap(mask * 50, cv2.COLORMAP_JET)

                # 创建一个纯净的 Mask 展示层（而不是和原图叠加，叠加由前端或导出配置决定）
                return colored_mask

        # 如果找不到掩码图，返回一张全黑的图或带有错误提示的图
        return self._create_error_placeholder(
            f"Mask Not Found: {stem}", base_img.shape[1], base_img.shape[0]
        )

    def _draw_vector_annotations(
        self, img: np.ndarray, folder_path: str, stem: str, color: tuple
    ) -> np.ndarray:
        """目标检测/实例分割渲染：在 Base 图上画框 (这里为占位示意逻辑)"""
        if not folder_path:
            return img

        # TODO: 这里是你未来对接具体 YOLO/COCO 解析器的地方
        # 示例：假设我们找到了标注，我们在图像中心画一个框以示对齐成功
        # h, w = img.shape[:2]
        # cv2.rectangle(img, (int(w*0.4), int(h*0.4)), (int(w*0.6), int(h*0.6)), color, self.thickness)

        return img

    def render_separated_layers(
        self,
        stem: str,
        view_configs: list,
        anno_config: dict = None,
        pred_configs: list = None,
    ) -> dict:
        """
        🚀 终极多通道渲染管线：不再进行物理拼图。
        返回格式: { "MainView_Base": img_array, "MainView_GT_Mask": mask_array, "MainView_ModelA_Mask": mask_array ... }
        """
        # 1. 获取所有纯净的基础视图 (RGB, Thermal 等)
        view_images = self._load_all_views(stem, view_configs)
        result_layers = {}

        for idx, v_conf in enumerate(view_configs):
            view_name = v_conf.get("name", f"view_{idx}")
            base_img = view_images[idx].copy()  # 复制一份，避免互相污染

            # --- 2. 处理真实标注 (Ground Truth) ---
            if anno_config and anno_config.get("folder_path"):
                task_type = anno_config.get("task_type")
                if task_type == "semantic_seg":
                    # 语义分割：生成独立的 Mask 层
                    mask_img = self._draw_semantic_mask(
                        base_img,
                        anno_config.get("folder_path"),
                        stem,
                        anno_config.get("suffix", ""),
                    )
                    result_layers[f"{view_name}_GT_Mask"] = mask_img
                else:
                    # Bbox/Instance：在 Base 图上绘制绿色框代表 GT
                    base_img = self._draw_vector_annotations(
                        base_img,
                        anno_config.get("folder_path"),
                        stem,
                        color=(0, 255, 0),
                    )

            # --- 3. 处理多组预测结果 (Predictions) ---
            if pred_configs:
                for p_idx, pred in enumerate(pred_configs):
                    if not pred.get("path"):
                        continue

                    p_name = pred.get("name", f"Pred_{p_idx}")
                    p_task = pred.get("taskType")

                    if p_task == "semantic_seg":
                        # 预测的语义分割：生成独立的 Mask 层
                        pred_mask = self._draw_semantic_mask(
                            base_img, pred.get("path"), stem, pred.get("suffix", "")
                        )
                        result_layers[f"{view_name}_{p_name}_Mask"] = pred_mask
                    else:
                        # 预测的 Bbox/Instance：在 Base 图上绘制红色或橙色框
                        base_img = self._draw_vector_annotations(
                            base_img, pred.get("path"), stem, color=(0, 165, 255)
                        )

            # --- 4. 将叠加了所有 Vector 框 (GT + Preds) 的最终 Base 图加入结果集 ---
            result_layers[f"{view_name}_Base"] = base_img

        return result_layers

    def _draw_vector_annotations(
        self, img: np.ndarray, folder_path: str, stem: str, color: tuple
    ) -> np.ndarray:
        """目标检测/实例分割渲染：在 Base 图上画框 (这里为占位示意逻辑)"""
        if not folder_path:
            return img

        # TODO: 这里是你未来对接具体 YOLO/COCO 解析器的地方
        # 示例：假设我们找到了标注，我们在图像中心画一个框以示对齐成功
        # h, w = img.shape[:2]
        # cv2.rectangle(img, (int(w*0.4), int(h*0.4)), (int(w*0.6), int(h*0.6)), color, self.thickness)

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
        🚀 终极多通道渲染管线：不再进行物理拼图。
        返回格式: { "MainView_Base": img_array, "MainView_GT_Mask": mask_array, "MainView_ModelA_Mask": mask_array ... }
        """
        # 1. 获取所有纯净的基础视图 (RGB, Thermal 等)
        view_images = self._load_all_views(stem, view_configs)
        result_layers = {}

        for idx, v_conf in enumerate(view_configs):
            view_name = v_conf.get("name", f"view_{idx}")
            base_img = view_images[idx].copy()  # 复制一份，避免互相污染

            # --- 2. 处理真实标注 (Ground Truth) ---
            if anno_config and anno_config.get("folder_path"):
                task_type = anno_config.get("task_type")
                if task_type == "semantic_seg":
                    # 语义分割：生成独立的 Mask 层
                    mask_img = self._draw_semantic_mask(
                        base_img,
                        anno_config.get("folder_path"),
                        stem,
                        anno_config.get("suffix", ""),
                    )
                    result_layers[f"{view_name}_GT_Mask"] = mask_img
                else:
                    # Bbox/Instance：在 Base 图上绘制绿色框代表 GT
                    base_img = self._draw_vector_annotations(
                        base_img,
                        anno_config.get("folder_path"),
                        stem,
                        color=(0, 255, 0),
                    )

            # --- 3. 处理多组预测结果 (Predictions) ---
            if pred_configs:
                for p_idx, pred in enumerate(pred_configs):
                    if not pred.get("path"):
                        continue

                    p_name = pred.get("name", f"Pred_{p_idx}")
                    p_task = pred.get("taskType")

                    if p_task == "semantic_seg":
                        # 预测的语义分割：生成独立的 Mask 层
                        pred_mask = self._draw_semantic_mask(
                            base_img, pred.get("path"), stem, pred.get("suffix", "")
                        )
                        result_layers[f"{view_name}_{p_name}_Mask"] = pred_mask
                    else:
                        # 预测的 Bbox/Instance：在 Base 图上绘制红色或橙色框
                        base_img = self._draw_vector_annotations(
                            base_img, pred.get("path"), stem, color=(0, 165, 255)
                        )

            # --- 4. 将叠加了所有 Vector 框 (GT + Preds) 的最终 Base 图加入结果集 ---
            result_layers[f"{view_name}_Base"] = base_img

        return result_layers
