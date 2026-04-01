// src/store/useStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ProjectMetaContract } from '../config/contract';

export interface FolderData {
  id: string;
  path: string;
  suffix: string;
  files: File[];
  metadata: {
    height: number;
    width: number;
    bands: number;
    fileType: string;
    dataType: string;
    sceneGroupsLoaded?: number;
    sceneGroupsSkipped?: number;
  };
}

export interface FolderMetadata {
  path: string;
  folderName: string;
  files: {
    fileName: string;
    stem: string;
    width: number;
    height: number;
    bands: number;
    dtype: string;
  }[];
}

export interface ViewConfig {
  id: string;
  folderId: string;
  bands: number[]; 
  isMain: boolean;
  opacity: number;
  colormap?: 'gray' | 'jet' | 'viridis' | 'plasma' | 'inferno';
  transform: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
  };
  crop?: { t: number, r: number, b: number, l: number };
}

export interface Annotation {
  id: string;
  type: 'bbox' | 'polygon';
  points: { x: number; y: number }[]; 
  label: string;
  text?: string;
  stem: string; 
  difficult: boolean;
  attributes: Record<string, string | number | boolean>;
}

export interface SavedAlignment {
  id: string;
  name: string;
  crop: { t: number; r: number; b: number; l: number };
  transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number };
}

export interface TaxonomyClass {
  id: string;          // 唯一ID
  name: string;        // 类别名称，如 "building"
  color: string;       // BBox/Polygon 渲染颜色，如 "#FF5733"
  description?: string;// 类别定义说明
}

export interface TaxonomyAttribute {
  id: string;
  name: string;        // 属性名，如 "occluded" 或 "material"
  type: 'boolean' | 'select' | 'text'; // 属性值类型
  options?: string[];  // 如果是 select 类型，枚举的可选项
  applyToAll: boolean; // 是否全局通用 (如果不通用，可以绑定到特定 Class 上)
}


type ActiveModule = 'workspace' | 'preload' | 'extent' | 'export' | 'meta' | 'createproject' | 'loadproject' | 'taxonomy';

export interface AppState {
  projectName: string;
  setProjectName: (name: string) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  language: 'en' | 'zh';
  setLanguage: (lang: 'en' | 'zh') => void;
  projectMetadata: FolderMetadata[]; 
  folders: FolderData[];
  views: ViewConfig[];
  annotations: Annotation[];
  viewport: {zoom: number;panX: number;panY: number;};
  
  activeModule: ActiveModule;
  currentStem: string | null;
  stems: string[];
  activeAnnotationId: string | null;

  taxonomyClasses: TaxonomyClass[];
  taxonomyAttributes: TaxonomyAttribute[];


  savedAlignments: SavedAlignment[];
  addSavedAlignment: (preset: SavedAlignment) => void;
  removeSavedAlignment: (id: string) => void;
  completedViews: string[];
  setCompletedViews: (views: string[]) => void;
  setProjectMetadata: (data: FolderMetadata[]) => void;
  loadProjectMeta: (meta: ProjectMetaContract) => void; // 🌟 修复拼写错误

  addFolder: (folder: FolderData) => void;
  updateFolder: (id: string, data: Partial<FolderData>) => void;
  removeFolder: (id: string) => void;
  clearFolders: () => void;

  addView: (view: ViewConfig) => void;
  updateView: (id: string, data: Partial<ViewConfig>) => void;
  removeView: (id: string) => void;
  clearViews: () => void;

  setViewport: (zoom: number, panX: number, panY: number) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  
  setActiveModule: (module: ActiveModule) => void;
  setCurrentStem: (stem: string | null) => void;
  setStems: (stems: string[]) => void;
  setActiveAnnotationId: (id: string | null) => void;


  addTaxonomyClass: (cls: TaxonomyClass) => void;
  updateTaxonomyClass: (id: string, updates: Partial<TaxonomyClass>) => void;
  deleteTaxonomyClass: (id: string, deleteAnnotations: boolean) => void;
  mergeTaxonomyClasses: (sourceIds: string[], targetId: string) => void;

  addTaxonomyAttribute: (attr: TaxonomyAttribute) => void;
  updateTaxonomyAttribute: (id: string, updates: Partial<TaxonomyAttribute>) => void;
  deleteTaxonomyAttribute: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      projectName: 'multianno project1',
      theme: 'dark', // 默认深色
      language: 'en',
      projectMetadata: [],
      folders: [],
      views: [],
      annotations: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      activeModule: 'workspace', 
      currentStem: null,
      stems: [],
      completedViews: [],
      savedAlignments: [],
      activeAnnotationId: null,

      taxonomyClasses: [
        { id: 'class-default', name: 'object', color: '#3B82F6', description: 'Default generic object' }
      ],
      taxonomyAttributes: [
        { id: 'attr-default', name: 'occluded', type: 'boolean', applyToAll: true }
      ],

      setProjectName: (name) => set({ projectName: name }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (lang) => set({ language: lang }),
      setProjectMetadata: (data) => set({ projectMetadata: data }),
      setCompletedViews: (views) => set({ completedViews: views }),
      setActiveModule: (module) => set({ activeModule: module }),
      setCurrentStem: (stem) => set({ currentStem: stem }),
      setStems: (stems) => set({ stems }),
      setViewport: (zoom, panX, panY) => set({ viewport: { zoom, panX, panY } }),
      setActiveAnnotationId: (id) => set({ activeAnnotationId: id }),

      loadProjectMeta: (meta) => set({
        projectName: meta.projectName || 'Untitled Project',
        folders: meta.folders.map(f => ({
          id: String(f.Id),
          path: f.path,
          suffix: f.suffix || '',
          files: [], 
          metadata: {
            height: f["image meta"].height === 'Unknown' ? 0 : Number(f["image meta"].height),
            width: f["image meta"].width === 'Unknown' ? 0 : Number(f["image meta"].width),
            bands: f["image meta"].bands === 'Unknown' ? 0 : Number(f["image meta"].bands),
            fileType: f["image meta"]["data type"],
            dataType: f["image meta"]["data type"],
            sceneGroupsLoaded: f["files in sceneGroups"],
            sceneGroupsSkipped: f["files Skipped"],
          }
        })),
        views: meta.views.map(v => ({
          id: v.id,
          folderId: String(v["folder id"]),
          bands: v.bands,
          isMain: v.isMain,
          opacity: 1,
          colormap: v.renderMode !== 'rgb' ? (v.renderMode as any) : 'gray',
          transform: v.transform,
        })),
        currentStem: null, 
        annotations: [],
        completedViews: [],
      }),
      addSavedAlignment: (newAlignment) => set((state) => {
        const filteredAlignments = state.savedAlignments.filter(a => {
          const isSameCrop = 
            a.crop.t === newAlignment.crop.t && 
            a.crop.r === newAlignment.crop.r && 
            a.crop.b === newAlignment.crop.b && 
            a.crop.l === newAlignment.crop.l;
          const isSameTransform = 
            a.transform.scaleX === newAlignment.transform.scaleX && 
            a.transform.scaleY === newAlignment.transform.scaleY && 
            a.transform.offsetX === newAlignment.transform.offsetX && 
            a.transform.offsetY === newAlignment.transform.offsetY;
          return !(isSameCrop && isSameTransform);
        });
        return { savedAlignments: [newAlignment, ...filteredAlignments] };
      }),
      removeSavedAlignment: (id) => set((state) => ({savedAlignments: state.savedAlignments.filter(a => a.id !== id)})),

      addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
      updateFolder: (id, data) => set((state) => ({folders: state.folders.map(f => f.id === id ? { ...f, ...data } : f)})),
      removeFolder: (id) => set((state) => ({ folders: state.folders.filter(f => f.id !== id) })),
      clearFolders: () => set({ folders: [] }),

      addView: (view) => set((state) => ({ views: [...state.views, view] })),
      updateView: (id, data) => set((state) => ({views: state.views.map(v => v.id === id ? { ...v, ...data } : v)})),
      removeView: (id) => set((state) => ({ views: state.views.filter(v => v.id !== id) })),
      clearViews: () => set({ views: [] }),

      addAnnotation: (annotation) => set((state) => ({ annotations: [...state.annotations, annotation] })),
      updateAnnotation: (id, data) => set((state) => ({annotations: state.annotations.map(a => a.id === id ? { ...a, ...data } : a)})),
      removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter(a => a.id !== id) })),

      // --- 🌟 体系库核心逻辑：分类管理 (带级联更新) ---
      addTaxonomyClass: (cls) => set((state) => ({ taxonomyClasses: [...state.taxonomyClasses, cls] })),
      
      updateTaxonomyClass: (id, updates) => set((state) => {
        const oldClass = state.taxonomyClasses.find(c => c.id === id);
        const newClasses = state.taxonomyClasses.map(c => c.id === id ? { ...c, ...updates } : c);
        
        // 🌟 级联更新：如果改了类别名，同步更新所有属于该类别的标注
        let newAnnotations = state.annotations;
        if (oldClass && updates.name && oldClass.name !== updates.name) {
          newAnnotations = state.annotations.map(a => 
            a.label === oldClass.name ? { ...a, label: updates.name as string } : a
          );
        }
        return { taxonomyClasses: newClasses, annotations: newAnnotations };
      }),

      deleteTaxonomyClass: (id, deleteAnnotations) => set((state) => {
        const classToDelete = state.taxonomyClasses.find(c => c.id === id);
        if (!classToDelete) return state;

        const newClasses = state.taxonomyClasses.filter(c => c.id !== id);
        let newAnnotations = state.annotations;

        if (deleteAnnotations) {
          // 硬删除：直接连带删除所有该类别的标注框
          newAnnotations = state.annotations.filter(a => a.label !== classToDelete.name);
        } else {
          // 软删除：框保留，但标记为 'Uncategorized' 并在界面飘红警告
          newAnnotations = state.annotations.map(a => 
            a.label === classToDelete.name ? { ...a, label: 'Uncategorized' } : a
          );
        }
        return { taxonomyClasses: newClasses, annotations: newAnnotations };
      }),

      mergeTaxonomyClasses: (sourceNames, targetName) => set((state) => {
        // 1. 删除源类别
        const newClasses = state.taxonomyClasses.filter(c => !sourceNames.includes(c.name));
        // 2. 将所有旧类别的标注，全部替换为新目标类别
        const newAnnotations = state.annotations.map(a => 
          sourceNames.includes(a.label) ? { ...a, label: targetName } : a
        );
        return { taxonomyClasses: newClasses, annotations: newAnnotations };
      }),

      // --- 🌟 体系库核心逻辑：属性管理 (带级联更新) ---
      addTaxonomyAttribute: (attr) => set((state) => ({ taxonomyAttributes: [...state.taxonomyAttributes, attr] })),
      updateTaxonomyAttribute: (id, updates) => set((state) => ({ 
        taxonomyAttributes: state.taxonomyAttributes.map(a => a.id === id ? { ...a, ...updates } : a) 
      })),
      deleteTaxonomyAttribute: (id) => set((state) => {
        const attrToDelete = state.taxonomyAttributes.find(a => a.id === id);
        const newAttrs = state.taxonomyAttributes.filter(a => a.id !== id);
        if (!attrToDelete) return { taxonomyAttributes: newAttrs };

        // 🌟 级联更新：遍历所有标注，把这个属性字段从中抹除
        const newAnnotations = state.annotations.map(a => {
          const newAttributes = { ...a.attributes };
          delete newAttributes[attrToDelete.name];
          return { ...a, attributes: newAttributes };
        });
        return { taxonomyAttributes: newAttrs, annotations: newAnnotations };
      }),
    }),
    {
      name: 'multiAnno_workspace_state', 
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projectName: state.projectName,
        theme: state.theme,
        language: state.language,
        projectMetadata: state.projectMetadata,
        folders: state.folders,
        views: state.views,         
        stems: state.stems,
        currentStem: state.currentStem,
        annotations: state.annotations, 
        savedAlignments: state.savedAlignments, 
        completedViews: state.completedViews,
        taxonomyClasses: state.taxonomyClasses,
        taxonomyAttributes: state.taxonomyAttributes,
      }),
    }
  )
);