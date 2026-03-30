// src/config/contract.ts
import { COLOR_MAPS } from './colors';
/**
 * 🌟 核心数据契约 (Project Meta Contract)
 * 定义了前端 Workspace 与 Python 后端交互的 project_meta.json 标准格式
 */

type ColormapNames = (typeof COLOR_MAPS)[number]['name'];
export interface ProjectMetaContract {
  projectName: string;
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
  }[];
}