// src/components/Modules.tsx

// 从各个独立文件中导入组件
import { SyncAnnotation } from './SyncAnnotation';
import { DataPreload } from './DataPreload';
import { ViewExtentCheck } from './ViewExtentCheck';
import { ProjectMetaDashboard } from './ProjectMetaDashboard';
import { DataFormatExchange } from './DataFormatExchange';

// 统一导出给 App.tsx 使用
export {
  SyncAnnotation,
  DataPreload,
  ViewExtentCheck,
  ProjectMetaDashboard,
  DataFormatExchange
};