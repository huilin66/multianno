// src/config/supportedFormats.ts

export type TaskType = 'object_detection' | 'instance_segmentation' | 'image_segmentation' | 'change_detection';

// ==========================================
// 1. task definition
// ==========================================
export interface TaskInfo {
  label: string;
  description: string;
  formats: string[];
}

export const SUPPORTED_TASKS: Record<TaskType, TaskInfo> = {
  object_detection: {
    label: 'Object Detection',
    description: 'Bounding box detection',
    formats: ['yolo', 'coco', 'voc', 'multianno'],
  },
  instance_segmentation: {
    label: 'Instance Segmentation',
    description: 'Polygon-based instance masks',
    formats: ['coco', 'yolo', 'multianno'],
  },
  image_segmentation: {
    label: 'Image Segmentation',
    description: 'Class-based pixel masks',
    formats: ['mask', 'multianno'],
  },
  change_detection: {
    label: 'Change Detection',
    description: 'Class-based pixel change detection masks',
    formats: ['mask', 'multianno'],
  },
};

// ==========================================
// 2. format definition
// ==========================================
export interface FormatInfo {
  id: string;
  label: string;
  defaultExtension: string;
  extensions: string[];
  description: string;
}

export const FORMAT_DETAILS: Record<string, FormatInfo> = {
  yolo: {
    id: 'yolo',
    label: 'YOLO',
    defaultExtension: '.txt',
    extensions: ['.txt'],
    description: 'YOLO format bounding boxes',
  },
  coco: {
    id: 'coco',
    label: 'COCO',
    defaultExtension: '.json',
    extensions: ['.json'],
    description: 'COCO JSON format',
  },
  voc: {
    id: 'voc',
    label: 'VOC',
    defaultExtension: '.xml',
    extensions: ['.xml'],
    description: 'Pascal VOC XML format',
  },
  multianno: {
    id: 'multianno',
    label: 'MultiAnno',
    extensions: ['.json'],
    defaultExtension: '.json',
    description: 'MultiAnno JSON format',
  },
  mask: {
    id: 'mask',
    label: 'Mask',
    extensions: ['.png', '.tif', '.jpg', '.bmp'],
    defaultExtension: '.png',
    description: 'Mask image format',
  },
};

export const IMAGE_EXT_MAP: Record<string, string> = {
  'TIFF': '.tif',
  'TIF': '.tif',
  'PNG': '.png',
  'JPEG': '.jpg',
  'JPG': '.jpg',
  'BMP': '.bmp',
};

// ==========================================
// 3. shape compatibility mapping
// ==========================================
export type ShapeStatus = 'native' | 'convertible' | 'incompatible';

export const ALL_SHAPES = [
  'bbox', 'polygon', 
  'oriented_bbox', 'cuboid',
  'ellipse', 'circle', 
  'keypoints',
  'point', 'line'
] as const;


export const TASK_SHAPE_MAPPINGS: Record<TaskType, Record<string, ShapeStatus>> = {
  object_detection: {
    bbox: 'native',
    oriented_bbox: 'incompatible',
    polygon: 'incompatible',
    ellipse: 'incompatible',
    circle: 'incompatible',
    cuboid: 'incompatible',
    point: 'incompatible',
    line: 'incompatible',
    keypoints: 'incompatible',
  },
  instance_segmentation: {
    polygon: 'native',
    bbox: 'convertible',
    ellipse: 'convertible',
    circle: 'convertible',
    oriented_bbox: 'convertible',
    point: 'incompatible',
    line: 'incompatible',
    cuboid: 'incompatible',
    keypoints: 'incompatible',
  },
  image_segmentation: {
    polygon: 'native',
    bbox: 'convertible',
    ellipse: 'convertible',
    circle: 'convertible',
    oriented_bbox: 'convertible',
    point: 'incompatible',
    line: 'incompatible',
    cuboid: 'incompatible',
    keypoints: 'incompatible',
  },
  change_detection: {
    polygon: 'native',
    bbox: 'convertible',
    ellipse: 'convertible',
    circle: 'convertible',
    oriented_bbox: 'convertible',
    point: 'incompatible',
    line: 'incompatible',
    cuboid: 'incompatible',
    keypoints: 'incompatible',
  },
};


