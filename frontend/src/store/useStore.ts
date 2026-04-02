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

// 🌟 1. 扩充单体标注接口 (兼容最终的 shapes 数组内元素)
export interface Annotation {
  id: string;
  type: 'bbox' | 'polygon' | 'point' | 'line' | 'ellipse' |'circle' | 'oriented_bbox' | 'keypoints';
  points: { x: number; y: number }[]; 
  label: string;
  text?: string;
  stem: string; 
  difficult: boolean;
  attributes: Record<string, string | number | boolean>;
  group_id?: string | number | null; // 🌟 新增：组合ID / 视觉定位ID
  track_id?: string | number | null; // 🌟 新增：追踪ID
  flags?: Record<string, any>;       // 🌟 新增：个体标志位
}

// 🌟 2. 新增：单张图像 (Stem) 级别的全局属性
export interface StemMetadata {
  tags: string[];                  // 对应 JSON 里的 image_tags
  text: string;                    // 对应 JSON 里的 text (全局描述)
  flags: Record<string, any>;      // 对应 JSON 里的全局 flags
}

export interface SavedAlignment {
  id: string;
  name: string;
  crop: { t: number; r: number; b: number; l: number };
  transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number };
}

export interface TaxonomyClass {
  id: string;          
  name: string;        
  color: string;       
  description?: string;
}

export interface TaxonomyAttribute {
  id: string;
  name: string;        
  type: 'boolean' | 'select' | 'text'; 
  options?: string[];  
  applyToAll: boolean; 
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
  
  // 🌟 3. 新增：状态中维护全局图像属性映射
  stemMetadata: Record<string, StemMetadata>; 
  updateStemMetadata: (stem: string, data: Partial<StemMetadata>) => void;
  sceneGroups: Record<string, Record<string, string>>;
  setSceneGroups: (groups: Record<string, Record<string, string>>) => void;
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
  loadProjectMeta: (meta: ProjectMetaContract) => void; 

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
      theme: 'dark', 
      language: 'en',
      projectMetadata: [],
      folders: [],
      views: [],
      annotations: [],
      
      // 🌟 4. 初始化空字典
      stemMetadata: {}, 

      viewport: { zoom: 1, panX: 0, panY: 0 },
      activeModule: 'workspace', 
      currentStem: null,
      stems: [],
      completedViews: [],
      savedAlignments: [],
      activeAnnotationId: null,

      taxonomyClasses: [],
      taxonomyAttributes: [],
      sceneGroups: {},

      setSceneGroups: (groups) => set({ sceneGroups: groups }),
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

      // 🌟 5. 新增方法：更新特定 stem 的全局属性
      updateStemMetadata: (stem, data) => set((state) => ({
        stemMetadata: {
          ...state.stemMetadata,
          [stem]: {
            ...({ tags: [], text: '', flags: {} }), // 默认值兜底
            ...(state.stemMetadata[stem] || {}),
            ...data
          }
        }
      })),

      loadProjectMeta: (meta) => set({
        projectName: meta.projectName || 'Untitled Project',
        sceneGroups: meta.sceneGroups || {}, // 🌟 加载时读取
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
        stemMetadata: {}, // 🌟 加载新项目时清空
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

      addTaxonomyClass: (cls) => set((state) => ({ taxonomyClasses: [...state.taxonomyClasses, cls] })),
      updateTaxonomyClass: (id, updates) => set((state) => {
        const oldClass = state.taxonomyClasses.find(c => c.id === id);
        const newClasses = state.taxonomyClasses.map(c => c.id === id ? { ...c, ...updates } : c);
        
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
          newAnnotations = state.annotations.filter(a => a.label !== classToDelete.name);
        } else {
          newAnnotations = state.annotations.map(a => 
            a.label === classToDelete.name ? { ...a, label: 'Uncategorized' } : a
          );
        }
        return { taxonomyClasses: newClasses, annotations: newAnnotations };
      }),

      mergeTaxonomyClasses: (sourceNames, targetName) => set((state) => {
        const newClasses = state.taxonomyClasses.filter(c => !sourceNames.includes(c.name));
        const newAnnotations = state.annotations.map(a => 
          sourceNames.includes(a.label) ? { ...a, label: targetName } : a
        );
        return { taxonomyClasses: newClasses, annotations: newAnnotations };
      }),

      addTaxonomyAttribute: (attr) => set((state) => ({ taxonomyAttributes: [...state.taxonomyAttributes, attr] })),
      updateTaxonomyAttribute: (id, updates) => set((state) => ({ 
        taxonomyAttributes: state.taxonomyAttributes.map(a => a.id === id ? { ...a, ...updates } : a) 
      })),
      deleteTaxonomyAttribute: (id) => set((state) => {
        const attrToDelete = state.taxonomyAttributes.find(a => a.id === id);
        const newAttrs = state.taxonomyAttributes.filter(a => a.id !== id);
        if (!attrToDelete) return { taxonomyAttributes: newAttrs };

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
        sceneGroups: state.sceneGroups,
        language: state.language,
        projectMetadata: state.projectMetadata,
        folders: state.folders,
        views: state.views,         
        stems: state.stems,
        currentStem: state.currentStem,
        
        // 🌟 6. 确保将新的全局属性字典持久化存储
        stemMetadata: state.stemMetadata, 

        annotations: state.annotations, 
        savedAlignments: state.savedAlignments, 
        completedViews: state.completedViews,
        taxonomyClasses: state.taxonomyClasses,
        taxonomyAttributes: state.taxonomyAttributes,
      }),
    }
  )
);