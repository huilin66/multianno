import { create } from 'zustand';

export interface FolderData {
  id: string;
  path: string;
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
  bands: number[]; // 1 or 3 bands
  isMain: boolean;
  opacity: number;
  transform: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
  };
}

export interface Annotation {
  id: string;
  type: 'bbox' | 'polygon';
  points: { x: number; y: number }[]; // Coordinates relative to Main View
  label: string;
  text?: string;
  stem: string; // The scene group this annotation belongs to
}

export type ActiveModule = 'workspace' | 'preload' | 'extent' | 'export';

export interface AppState {
  projectMetadata: FolderMetadata[]; // 存储从后端拿到的分析结果
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
  
  addFolder: (folder: FolderData) => void;
  updateFolder: (id: string, data: Partial<FolderData>) => void;
  removeFolder: (id: string) => void;
  
  addView: (view: ViewConfig) => void;
  updateView: (id: string, data: Partial<ViewConfig>) => void;
  removeView: (id: string) => void;
  
  setViewport: (zoom: number, panX: number, panY: number) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  
  setActiveModule: (module: ActiveModule) => void;
  setCurrentStem: (stem: string | null) => void;
  setStems: (stems: string[]) => void;
}

export const useStore = create<AppState>((set) => ({
  projectMetadata: [],
  setProjectMetadata: (data) => set({ projectMetadata: data }),
  folders: [],
  views: [],
  annotations: [],
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  
  activeModule: 'workspace', // Start with workspace
  currentStem: null,
  stems: [],
  
  addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
  updateFolder: (id, data) => set((state) => ({
    folders: state.folders.map(f => f.id === id ? { ...f, ...data } : f)
  })),
  removeFolder: (id) => set((state) => ({ folders: state.folders.filter(f => f.id !== id) })),
  
  addView: (view) => set((state) => ({ views: [...state.views, view] })),
  updateView: (id, data) => set((state) => ({
    views: state.views.map(v => v.id === id ? { ...v, ...data } : v)
  })),
  removeView: (id) => set((state) => ({ views: state.views.filter(v => v.id !== id) })),
  
  setViewport: (zoom, panX, panY) => set({ viewport: { zoom, panX, panY } }),
  
  addAnnotation: (annotation) => set((state) => ({ annotations: [...state.annotations, annotation] })),
  updateAnnotation: (id, data) => set((state) => ({
    annotations: state.annotations.map(a => a.id === id ? { ...a, ...data } : a)
  })),
  removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter(a => a.id !== id) })),
  
  setActiveModule: (module) => set({ activeModule: module }),
  setCurrentStem: (stem) => set({ currentStem: stem }),
  setStems: (stems) => set({ stems }),
}));
