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
}

export interface SavedAlignment {
  id: string;
  name: string;
  crop: { t: number; r: number; b: number; l: number };
  transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number };
}

type ActiveModule = 'workspace' | 'preload' | 'extent' | 'export' | 'meta' | 'createproject' | 'loadproject';

export interface AppState {
  projectName: string;
  setProjectName: (name: string) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  projectMetadata: FolderMetadata[]; 
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
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      projectName: 'multianno project1',
      setProjectName: (name) => set({ projectName: name }),
      theme: 'dark', // 默认深色
      setTheme: (theme) => set({ theme }),
      // 🌟 核心新增：加载项目元数据
      loadProjectMeta: (meta) => set({
        projectName: meta.projectName || 'Untitled Project',
        // 注意：JSON 里没有真实的 File[] 对象，需要你在组件层重新让用户选择文件夹，或者后端提供 URL
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

      projectMetadata: [],
      setProjectMetadata: (data) => set({ projectMetadata: data }),
      folders: [],
      views: [],
      annotations: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      
      activeModule: 'workspace', 
      currentStem: null,
      stems: [],

      // 🌟 1. 新增：全局记录已 Check 的视图 ID
      completedViews: [],
      setCompletedViews: (views) => set({ completedViews: views }),
      savedAlignments: [],
      // 🌟 升级版：添加对齐参数（带自动去重功能）
      addSavedAlignment: (newAlignment) => set((state) => {
        // 1. 过滤掉参数完全一致的旧记录
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
            
          // 如果裁剪和拉伸参数都一模一样，就判定为重复，将其剔除
          return !(isSameCrop && isSameTransform);
        });

        // 2. 将最新的记录放在最前面（保证时间戳是最新的）
        return { savedAlignments: [newAlignment, ...filteredAlignments] };
      }),

      // 🌟 3. 找到最后的 partialize，确保持久化
      partialize: (state) => ({
        projectName: state.projectName, 
        theme: state.theme,
        projectMetadata: state.projectMetadata,
        folders: state.folders,
        views: state.views,         
        stems: state.stems,
        currentStem: state.currentStem,
        annotations: state.annotations, 
        savedAlignments: state.savedAlignments, 
        completedViews: state.completedViews, // 👈 确保持久化打勾状态
      }),
      // 🌟 新增：手动删除指定的对齐参数
      removeSavedAlignment: (id) => set((state) => ({
        savedAlignments: state.savedAlignments.filter(a => a.id !== id)
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
        projectName: state.projectName, // 🌟 确保持久化项目名称
        theme: state.theme,
        projectMetadata: state.projectMetadata,
        folders: state.folders,
        views: state.views,         
        stems: state.stems,
        currentStem: state.currentStem,
        annotations: state.annotations, 
        savedAlignments: state.savedAlignments, 
        completedViews: state.completedViews,
      }),
    }
  )
);