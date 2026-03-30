import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  // colormap?: 'gray' | 'jet' | 'viridis' | 'plasma' | 'inferno'; // 🌟 新增
  transform: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
  };
  crop?: { t: number, r: number, b: number, l: number }; // 修复: 增加 crop 类型
}

export interface Annotation {
  id: string;
  type: 'bbox' | 'polygon';
  points: { x: number; y: number }[]; 
  label: string;
  text?: string;
  stem: string; 
}

// 🌟 新增：对齐参数快照的类型定义
export interface SavedAlignment {
  id: string;
  name: string;
  crop: { t: number; r: number; b: number; l: number };
  transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number };
}

type ActiveModule = 'workspace' | 'preload' | 'extent' | 'export' | 'meta';

export interface AppState {
  projectMetadata: FolderMetadata[]; 
  setProjectMetadata: (data: FolderMetadata[]) => void;
  folders: FolderData[];
  views: ViewConfig[];
  annotations: Annotation[];
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  
  activeModule: ActiveModule;
  currentStem: string | null;
  stems: string[];

  // 🌟 修复：在接口中声明这俩变量
  savedAlignments: SavedAlignment[];
  addSavedAlignment: (preset: SavedAlignment) => void;
  
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
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      projectMetadata: [],
      setProjectMetadata: (data) => set({ projectMetadata: data }),
      folders: [],
      views: [],
      annotations: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      
      activeModule: 'workspace', 
      currentStem: null,
      stems: [],
      
      savedAlignments: [],
      
      // 🌟 修复：新增防重复的同名覆盖逻辑，最多保留 10 个
      addSavedAlignment: (preset) => set((state) => ({ 
        savedAlignments: [
          preset, 
          ...state.savedAlignments.filter(p => p.name !== preset.name)
        ].slice(0, 10) 
      })),

      addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
      updateFolder: (id, data) => set((state) => ({
        folders: state.folders.map(f => f.id === id ? { ...f, ...data } : f)
      })),
      removeFolder: (id) => set((state) => ({ folders: state.folders.filter(f => f.id !== id) })),
      clearFolders: () => set({ folders: [] }),
      
      addView: (view) => set((state) => ({ views: [...state.views, view] })),
      updateView: (id, data) => set((state) => ({
        views: state.views.map(v => v.id === id ? { ...v, ...data } : v)
      })),
      removeView: (id) => set((state) => ({ views: state.views.filter(v => v.id !== id) })),
      clearViews: () => set({ views: [] }),
      setViewport: (zoom, panX, panY) => set({ viewport: { zoom, panX, panY } }),
      
      addAnnotation: (annotation) => set((state) => ({ annotations: [...state.annotations, annotation] })),
      updateAnnotation: (id, data) => set((state) => ({
        annotations: state.annotations.map(a => a.id === id ? { ...a, ...data } : a)
      })),
      removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter(a => a.id !== id) })),
      
      setActiveModule: (module) => set({ activeModule: module }),
      setCurrentStem: (stem) => set({ currentStem: stem }),
      setStems: (stems) => set({ stems }),
    }),
    {
      name: 'multiAnno_workspace_state', 
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projectMetadata: state.projectMetadata,
        folders: state.folders,
        views: state.views,         
        stems: state.stems,
        currentStem: state.currentStem,
        annotations: state.annotations, 
        savedAlignments: state.savedAlignments, // 🌟 确保持久化
      }),
    }
  )
);