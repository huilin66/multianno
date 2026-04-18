// src/components/Modules.tsx

// 从各个独立文件中导入组件
import { LoadProject, CreateProject} from './modules/ProjectSetup';
import { SyncAnnotation } from './modules/SyncAnnotation';
import { DataPreload } from './modules/DataPreload';
import { ViewExtentCheck } from './modules/ViewExtentCheck';
import { ProjectMetaDashboard } from './modules/ProjectMetaDashboard';
import { TaxonomyDashboard } from './modules/TaxonomyDashboard';
import { DataExport } from './modules/DataExport';
import { DataImport } from './modules/DataImport';

// 统一导出给 App.tsx 使用
export {
  LoadProject,
  CreateProject,
  SyncAnnotation,
  DataPreload,
  ViewExtentCheck,
  ProjectMetaDashboard,
  TaxonomyDashboard,
  DataExport,
  DataImport
};