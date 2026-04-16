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
  settings?: {
    brightness?: number; // 0.5 - 2.0 (默认 1)
    contrast?: number;   // 0.5 - 2.0 (默认 1)
    saturation?: number; // 0 - 2 (默认 1)
    minMax?: [number, number]; // [min, max] 百分比拉伸，如 [0, 100]
  };
}

// 🌟 1. 扩充单体标注接口 (兼容最终的 shapes 数组内元素)
export interface Annotation {
  id: string;
  type: 'bbox' | 'polygon' | 'point' | 'line' | 'ellipse' |'circle' | 'oriented_bbox' | 'cuboid' | 'keypoints';
  points: { x: number; y: number }[]; 
  holes?: { x: number; y: number }[][];
  label: string;
  text?: string;
  stem: string; 
  difficult: boolean;
  occluded: boolean;
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

export interface EditorSettings {
  showCrosshair: boolean;
  continuousDrawing: boolean; // 🌟 新增：连续绘制开关
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

  editorSettings: { showCrosshair: boolean; showPixelValue: boolean; continuousDrawing: boolean; showToolLabels: boolean; autoRefreshStats: boolean; };
  updateEditorSettings: (settings: Partial<{ showCrosshair: boolean; showPixelValue: boolean; continuousDrawing: boolean; showToolLabels: boolean; autoRefreshStats: boolean }>) => void;

  shortcuts: Record<string, string>;
  updateShortcut: (tool: string, key: string) => void;

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
  resetProject: () => void;

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

  // 🌟 新增：色彩调节暂态存储 (Stem 级)
  tempViewSettings: Record<string, any>;
  setTempViewSettings: (stem: string, viewId: string, settings: any) => void;
  applyViewSettingsToAll: (stem: string, viewId: string) => void;

  // 🌟 新增：AI 面板开关与状态
  isAIPanelOpen: boolean;
  setAIPanelOpen: (open: boolean) => void;
  aiPrompts: { x: number, y: number, label: number }[]; // 存鼠标点的正负样本
  aiSettings: {
      model: string;
      modelPath: string;
      confidence: number;
      isConfigured: boolean; // 关键：是否已设置
      inferenceSize: number;
      outputType: 'polygon' | 'bbox',
      filterThreshold: number,
    };
  setAISettings: (settings: Partial<AppState['aiSettings']>) => void;
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

      // 🌟 新增：暂态初始化与方法
      tempViewSettings: {},
      setTempViewSettings: (stem, viewId, settings) => set((state) => ({
        tempViewSettings: { ...state.tempViewSettings, [`${stem}_${viewId}`]: settings }
      })),
      applyViewSettingsToAll: (stem, viewId) => set((state) => {
        const temp = state.tempViewSettings[`${stem}_${viewId}`];
        if (!temp) return state;
        return {
          views: state.views.map(v => v.id === viewId ? { ...v, settings: { ...(v.settings || {}), ...temp } } : v),
          // 应用后可以选择清理暂态，也可以保留，这里保留让 UI 不会闪烁
        };
      }),
      // 🌟 修复后的重置逻辑 (清空所有当前项目残留)
      resetProject: () => set({
        projectName: 'Untitled Project',
        folders: [],
        views: [],              // 必须清空视图
        stems: [],
        currentStem: null,      // 类型必须是 null 而不是 ''
        annotations: [],
        taxonomyClasses: [],    
        taxonomyAttributes: [],
        stemMetadata: {},
        projectMetadata: [],    // 类型必须是 []
        sceneGroups: {},        // 类型必须是 {}
        completedViews: [],
        activeAnnotationId: null
      }),
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

      editorSettings: { showCrosshair: true, showPixelValue: true, continuousDrawing: false, showToolLabels: false, autoRefreshStats: false },
      updateEditorSettings: (newSettings) => set((state) => ({ 
        editorSettings: { ...state.editorSettings, ...newSettings } 
      })),
      
      isAIPanelOpen: false,
      setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),
      aiPrompts: [],
      aiSettings: {
        model: 'SAM-3',
        modelPath: '',
        confidence: 0.25,
        isConfigured: false,
        inferenceSize: 644,
        outputType: 'polygon',
        filterThreshold: 1
      },
      setAISettings: (newSettings) => set((state) => ({
        aiSettings: { ...state.aiSettings, ...newSettings }
      })),

      shortcuts: {
        pan: 'h',
        select: 'v',
        bbox: 'r',
        polygon: 'p',
        ai_anno: 'a',
        rbbox: 'd',
        cuboid: 'b',
        ellipse: 'o',
        circle: 'c',
        freemask: 'm',
        point: 't',
        line: 'l',
        lasso: 'f',
        cut: 'x',   // 避免和 Circle(c) 冲突，使用 x 作为切割
        cutout: 'e', 

        undo: 'z',     // 配合 Ctrl 使用，显示为 Z
        redo: 'y',     // 配合 Ctrl 使用，显示为 Y
        prev: 'arrowleft',  // 上一组
        next: 'arrowright', // 下一组
      },
      updateShortcut: (tool: string, key: string) => set((state) => ({ 
        shortcuts: { ...state.shortcuts, [tool]: key.toLowerCase() } 
      })),
    setEditorSettings: (settings: Partial<EditorSettings>) => set((state) => ({ 
      editorSettings: { ...state.editorSettings, ...settings } 
    })),

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
        
        // 🌟 终极防线：无论 JSON 里有多少个视图，强制只截取前 9 个！
        views: meta.views.slice(0, 9).map(v => ({
          id: v.id,
          folderId: String(v["folder id"]),
          bands: v.bands,
          isMain: v.isMain,
          opacity: 1,
          colormap: (v.bands.length === 1 && v.renderMode !== 'rgb' ? (v.renderMode || 'gray') : 'gray') as any,
          transform: v.transform,
          settings: v.settings || { brightness: 1, contrast: 1, saturation: 1, minMax: [0, 100],
            gamma: 1.0, enhancementMode: 'manual', spatialFilter: 'none', invert: false,
            binarize: { enabled: false, threshold: 128 }
           },
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


      addView: (newView) => set((state) => {
        // 🌟 终极防线：在数据层彻底锁死
        if (state.views.length >= 9) {
          console.warn("View limit reached: Cannot exceed 9 views.");
          // 触发一个全局 Toast 提示用户（如果你有集成 sonner 或 react-hot-toast）
          // toast.error("Maximum of 9 views allows!");
          
          return state; // 拒绝修改，直接返回当前状态
        }

        return {
          views: [...state.views, { 
            ...newView, 
            // 🌟 确保新视图有默认调节参数
            settings: { brightness: 1, contrast: 1, saturation: 1, minMax: [0, 100] } 
          }]
        };
      }),
      setViews: (importedViews) => set((state) => {
        if (importedViews.length > 9) {
          console.warn("Imported project has too many views, truncating to 9.");
          return { views: importedViews.slice(0, 9) }; // 强行截断只保留前 9 个
        }
        return { views: importedViews };
      }),
      updateView: (id, data) => set((state) => ({views: state.views.map(v => v.id === id ? { ...v, ...data } : v)})),
      removeView: (id) => set((state) => ({ views: state.views.filter(v => v.id !== id) })),
      clearViews: () => set({ views: [] }),

      addAnnotation: (annotation) => set((state) => ({ annotations: [...state.annotations, annotation] })),
      updateAnnotation: (id, data) => set((state) => ({annotations: state.annotations.map(a => a.id === id ? { ...a, ...data } : a)})),
      removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter(a => a.id !== id) })),

      // 🌟 终极防御：在 Store 数据写入层彻底拦截重复类别
      addTaxonomyClass: (cls) => set((state) => {
        // 检查是否已经存在相同 ID 或者相同名字（忽略大小写）的类别
        const isExist = state.taxonomyClasses.some(
          (c) => c.id === cls.id || c.name.trim().toLowerCase() === cls.name.trim().toLowerCase()
        );
        
        // 如果已经存在，直接返回原状态，坚决不重复添加！
        if (isExist) {
          return state; 
        }

        // 只有不存在时，才允许写入
        return { taxonomyClasses: [...state.taxonomyClasses, cls] };
      }),
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
        editorSettings: state.editorSettings,
        aiSettings: state.aiSettings,
      }),
    }
  )
);