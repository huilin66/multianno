// src/config/contract.ts
import { COLOR_MAPS } from './colors';
/**
 * 🌟 核心数据契约 (Project Meta Contract)
 * 定义了前端 Workspace 与 Python 后端交互的 project_meta.json 标准格式
 */

// 针对单个标注对象的结构定义
export interface AnnotationShape {
  label: string;
  text: string;
  points: number[][]; // 例如: [[x1, y1], [x2, y2], ...]
  group_id: number | null;
  track_id: number | null;
  shape_type: 'polygon' | 'rectangle' | 'point' | 'line';
  flags: Record<string, boolean>;
  // 🌟 核心新增：灵活的属性字典与困难样本标记
  attributes: Record<string, string | number | boolean>;
  difficult: boolean;
  occluded: boolean;
}
export interface SceneAnnotationJSON {
  version: string;
  flags: Record<string, boolean>;
  stem: string;
  // 🌟 1. 关联 project meta 的字段 (你可以存项目名称或 ID)
  projectName: string;
  // 🌟 5. 新增的描述字段
  imageDescription: string;
  // 🌟 2 & 3. 剥离了 imageData，将路径明确为主视图的文件名
  imageNameMain: string;
  // 🌟 4. 严格对应主视图的物理尺寸
  imageHeight: number;
  imageWidth: number;
  shapes: AnnotationShape[];
}

type ColormapNames = (typeof COLOR_MAPS)[number]['name'];
export interface ProjectMetaContract {
  projectName: string;
  sceneGroups?: Record<string, Record<string, string>>;
  folders: {
    Id: number;                  
    path: string;                
    suffix: string;              
    "files in sceneGroups": number;
    "files Skipped": number;
    "files total": number;
    "image meta": {
      width: number | string;
      height: number | string;
      bands: number | string;
      "data type": string;       
    };
  }[];
  views: {
    id: string;                  
    "folder id": number | string; 
    bands: number[];             
    renderMode: 'rgb' | ColormapNames;   
    isMain: boolean;             
    transform: {
      crop: { t: number; r: number; b: number; l: number }; 
      scaleX: number;
      scaleY: number;
      offsetX: number;           
      offsetY: number;
    };
    settings?: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      minMax?: [number, number];
    };
  }[];
}