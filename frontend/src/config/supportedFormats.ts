// src/config/supportedFormats.ts

export type TaskType = 'object_detection' | 'instance_segmentation' | 'semantic_segmentation';

export interface FormatConfig {
  id: string;
  label: string;
  extensions: string[];
  defaultExtension: string;
}

// 🌟 1. 任务定义映射
export const SUPPORTED_TASKS: Record<TaskType, { label: string; formats: string[] }> = {
  object_detection: {
    label: 'Object Detection',
    formats: ['yolo', 'coco', 'multianno'],
  },
  instance_segmentation: {
    label: 'Instance Segmentation',
    formats: ['yolo', 'coco', 'multianno'],
  },
  semantic_segmentation: {
    label: 'Semantic Segmentation',
    formats: ['image', 'multianno'],
  },
};

// 🌟 2. 格式详细属性
export const FORMAT_DETAILS: Record<string, FormatConfig> = {
  yolo: {
    id: 'yolo',
    label: 'YOLO 格式',
    extensions: ['.txt'],
    defaultExtension: '.txt',
  },
  coco: {
    id: 'coco',
    label: 'COCO 格式',
    extensions: ['.json'],
    defaultExtension: '.json',
  },
  multianno: {
    id: 'multianno',
    label: 'MultiAnno 格式',
    extensions: ['.json'],
    defaultExtension: '.json',
  },
  // 兼容 Local Visualization 的 key
  image: {
    id: 'image',
    label: 'Mask 图像',
    extensions: ['.png', '.tif', '.jpg', '.bmp'],
    defaultExtension: '.png',
  },
  // 兼容 Data Import / Export 的 key
  images_only: {
    id: 'images_only',
    label: 'Mask 图像',
    extensions: ['.png', '.tif', '.jpg', '.bmp'],
    defaultExtension: '.png',
  }
};