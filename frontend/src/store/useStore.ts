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
  truncated?: boolean;
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

// settings
export interface EditorSettings {
  showCrosshair: boolean; 
  showPixelValue: boolean; 
  continuousDrawing: boolean; 
  showToolLabels: boolean; 
  autoRefreshStats: boolean; 
}

export const DEFAULT_SHORTCUTS_SETTINGS = {
  bbox: {key:'r'},
  polygon: {key:'p'},
  ai_anno: {key:'i'},

  rbbox: {key:'r', shift: true},
  cuboid: {key:'d', shift: true},
  ellipse: {key:'e', shift: true},
  circle: {key:'c', shift: true},
  freemask: {key:'m', shift: true},
  point: {key:'p', shift: true},
  line: {key:'l', shift: true},
  lasso: {key:'s', shift: true},

  pan: {key:'w'},
  select: {key:'e', ctrl: true},
  cut: {key:'q', ctrl: true},
  cutout: {key:'e', ctrl: true}, 

  home: {key:'space'},
  prev: {key:'a'},
  next: {key:'d'},
  undo: {key:'z', ctrl: true},
  redo: {key:'y', ctrl: true},
  delete: {key:'delete'},
  clear: {key:'delete',ctrl: true},
  save: {key:'s', ctrl: true},
}

type ActiveModule = 'workspace' | 'preload' | 'extent' | 'export' | 'meta' | 'createproject' | 'loadproject' | 'taxonomy' | 'exchange_import' | 'exchange_export' | 'local_visualization';

export interface AppState {
  // project
  projectName: string;
  projectMetaPath: string | null;
  projectMetadata: FolderMetadata[]; 
  folders: FolderData[];
  views: ViewConfig[];
  stems: string[];
  stemMetadata: Record<string, StemMetadata>; 
  sceneGroups: Record<string, Record<string, string>>;


  // annotations
  currentStem: string | null;
  taxonomyClasses: TaxonomyClass[];
  taxonomyAttributes: TaxonomyAttribute[];
  hiddenClasses: string[];
  annotations: Annotation[];
  hiddenAnnotations: string[];
  activeAnnotationId: string | null;
  isAIPanelOpen: boolean;
  aiPrompts: { x: number, y: number, label: number }[]; 


  // setting
  theme: 'dark' | 'light';
  language: 'en' | 'zh';
  editorSettings: EditorSettings;
  shortcutsSettings: Record<string, { key: string; shift?: boolean; ctrl?: boolean }>;
  aiSettings: {
      model: string;
      modelPath: string;
      confidence: number;
      isConfigured: boolean;
      inferenceSize: number;
      outputType: 'polygon' | 'bbox',
      filterThreshold: number,
    };
  
  // view align
  completedViews: string[];
  savedAlignments: SavedAlignment[];

  // display
  viewport: {zoom: number;panX: number;panY: number;};
  activeModule: ActiveModule;
  tempViewSettings: Record<string, any>;

  // project function
  setProjectName: (name: string) => void;
  setProjectMetaPath: (path: string | null) => void;
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
  setStems: (stems: string[]) => void;
  updateStemMetadata: (stem: string, data: Partial<StemMetadata>) => void;
  setSceneGroups: (groups: Record<string, Record<string, string>>) => void;
  
  // annotation function
  setCurrentStem: (stem: string | null) => void;
  addTaxonomyClass: (cls: TaxonomyClass) => void;
  updateTaxonomyClass: (id: string, updates: Partial<TaxonomyClass>) => void;
  deleteTaxonomyClass: (id: string, deleteAnnotations: boolean) => void;
  mergeTaxonomyClasses: (sourceIds: string[], targetId: string) => void;
  addTaxonomyAttribute: (attr: TaxonomyAttribute) => void;
  updateTaxonomyAttribute: (id: string, updates: Partial<TaxonomyAttribute>) => void;
  deleteTaxonomyAttribute: (id: string) => void;
  setHiddenClasses: (classes: string[]) => void;
  toggleClassVisibility: (className: string) => void;
  // setHiddenAnnotations: (id: string[]) => void;
  toggleAnnotationVisibility: (id: string) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  setActiveAnnotationId: (id: string | null) => void;
  setAIPanelOpen: (open: boolean) => void;
  setAiPrompts: (ptspts: { x: number, y: number, label: number }[]) => void;

  // view align function
  setCompletedViews: (views: string[]) => void;
  addSavedAlignment: (preset: SavedAlignment) => void;
  removeSavedAlignment: (id: string) => void;

  // setting function
  setTheme: (theme: 'dark' | 'light') => void;
  setLanguage: (lang: 'en' | 'zh') => void;
  updateEditorSettings: (settings: Partial<EditorSettings>) => void;
  updateShortcutSettings: (tool: string, settings: { key: string; shift?: boolean; ctrl?: boolean }) => void;
  resetShortcutSettings: () => void;
  setAISettings: (settings: Partial<AppState['aiSettings']>) => void;

  // display function
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setActiveModule: (module: ActiveModule) => void;
  setTempViewSettings: (stem: string, viewId: string, settings: any) => void;
  applyViewSettingsToAll: (stem: string, viewId: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // project
      projectName: 'multianno project',
      projectMetaPath: null,
      projectMetadata: [],
      folders: [],
      views: [],
      stems: [],
      stemMetadata: {}, 
      sceneGroups: {},
      
      // annotations
      currentStem: null,
      taxonomyClasses: [],
      taxonomyAttributes: [],
      hiddenClasses: [],
      annotations: [],
      hiddenAnnotations: [],
      activeAnnotationId: null,
      isAIPanelOpen: false,
      aiPrompts: [],

      // setting
      theme: 'dark', 
      language: 'en',
      editorSettings: { showCrosshair: true, showPixelValue: true, continuousDrawing: false, showToolLabels: false, autoRefreshStats: true },
      shortcutsSettings:DEFAULT_SHORTCUTS_SETTINGS,
      aiSettings: {
        model: 'SAM-3',
        modelPath: '',
        confidence: 0.25,
        isConfigured: false,
        inferenceSize: 644,
        outputType: 'polygon',
        filterThreshold: 1
      },
      
      // view align
      completedViews: [],
      savedAlignments: [],

      // display
      viewport: { zoom: 1, panX: 0, panY: 0 },
      activeModule: 'workspace', 
      tempViewSettings: {},

      // project function
      setProjectName: (name) => set({ projectName: name }),
      setProjectMetaPath: (path) => set({ projectMetaPath: path }),
      setProjectMetadata: (data) => set({ projectMetadata: data }),
      loadProjectMeta: (meta) => {
        const loadedStems = meta.sceneGroups ? Object.keys(meta.sceneGroups).sort() : [];

        set({
          projectName: meta.projectName || 'Untitled Project',
          sceneGroups: meta.sceneGroups || {},
          taxonomyClasses: meta.taxonomyClasses || [],
          taxonomyAttributes: meta.taxonomyAttributes || [],
          
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
          
          // 🌟 2. 将计算好的 stems 放入内存，唤醒左侧文件树
          stems: loadedStems,
          
          // 🌟 3. 自动选中第一张图，唤醒主绘图区
          currentStem: loadedStems.length > 0 ? loadedStems[0] : null, 

          annotations: [],
          stemMetadata: {}, 
          completedViews: [],
        });
      },
      resetProject: () => set({
        projectMetaPath: null, // 🌟 重置时清空路径
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
      setStems: (stems) => set({ stems }),
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
      setSceneGroups: (groups) => set({ sceneGroups: groups }),

      // annotation function
      // setCurrentStem: (stem) => set({ currentStem: stem }),
      setCurrentStem: (stem) => {
        console.trace('🔴 setCurrentStem called with:', stem);
        set({ currentStem: stem });
      },
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
            a.label === classToDelete.name ? { ...a, label: 'background' } : a
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
      setHiddenClasses: (classes) => set({ hiddenClasses: classes }),
      toggleClassVisibility: (className) => set((state) => ({
        hiddenClasses: state.hiddenClasses.includes(className)
          ? state.hiddenClasses.filter(c => c !== className)
          : [...state.hiddenClasses, className]
      })),
      toggleAnnotationVisibility: (id) => set((state) => ({
        hiddenAnnotations: state.hiddenAnnotations.includes(id)
          ? state.hiddenAnnotations.filter((aId) => aId !== id)
          : [...state.hiddenAnnotations, id]
      })),
      addAnnotation: (annotation) => set((state) => ({ annotations: [...state.annotations, annotation] })),
      updateAnnotation: (id, data) => set((state) => ({annotations: state.annotations.map(a => a.id === id ? { ...a, ...data } : a)})),
      removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter(a => a.id !== id) })),
      setActiveAnnotationId: (id) => set({ activeAnnotationId: id }),
      setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),
      setAiPrompts: (ptspts) => set({ aiPrompts: ptspts }),

      // view align function
      setCompletedViews: (views) => set({ completedViews: views }),
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


      // setting function
      setTheme: (theme) => set({ theme }),
      setLanguage: (lang) => set({ language: lang }),
      updateEditorSettings: (newSettings) => set((state) => ({ 
        editorSettings: { ...state.editorSettings, ...newSettings } 
      })),
      updateShortcutSettings: (tool, settings) => set((state) => ({ 
        shortcutsSettings: { ...state.shortcutsSettings, [tool]: settings } 
      })),
      resetShortcutSettings: () => set({ shortcutsSettings: DEFAULT_SHORTCUTS_SETTINGS }),
      setAISettings: (newSettings) => set((state) => ({
        aiSettings: { ...state.aiSettings, ...newSettings }
      })),

      // display function
      setViewport: (zoom, panX, panY) => set({ viewport: { zoom, panX, panY } }),
      setActiveModule: (module) => set({ activeModule: module }),
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
    }),
    {
      name: 'multiAnno_workspace_state', 
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projectName: state.projectName,
        projectMetaPath: state.projectMetaPath,
        projectMetadata: state.projectMetadata,
        folders: state.folders,
        views: state.views,         
        stems: state.stems,
        sceneGroups: state.sceneGroups,
        
        currentStem: state.currentStem,
        taxonomyClasses: state.taxonomyClasses,
        taxonomyAttributes: state.taxonomyAttributes,
        annotations: state.annotations,
        activeAnnotationId: state.activeAnnotationId,
        isAIPanelOpen: state.isAIPanelOpen,
        aiPrompts: state.aiPrompts,

        theme: state.theme,
        language: state.language,
        editorSettings: state.editorSettings,
        shortcutsSettings: state.shortcutsSettings,
        aiSettings: state.aiSettings,
        hiddenClasses: state.hiddenClasses,
        hiddenAnnotations: state.hiddenAnnotations,
        
        completedViews: state.completedViews,
        savedAlignments: state.savedAlignments, 

        viewport: state.viewport,
        activeModule: state.activeModule,       
        tempViewSettings: state.tempViewSettings,
      }),
    }
  )
);