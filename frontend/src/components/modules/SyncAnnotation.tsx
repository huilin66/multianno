import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Annotation } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { ClassFormPopover } from './annotation/ClassFormPopover';
import { LeftToolbar } from './annotation/LeftToolbar';
import { RightPanel } from './annotation/RightPanel';
import { useActionHistory } from '../../hooks/useActionHistory';
import { CanvasView } from './annotation/CanvasView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '@/components/ui/button';
import PolyBool from 'polybooljs';
import { AIToolPanel } from './annotation/AIToolPanel';
import { initSAM, predictSAM, checkVisionAIStatus, predictAutoSAM, SAMPoint } from '../../api/client'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAnnotationAutoSave } from '../../hooks/useAnnotationAutoSave';
import { createPortal } from 'react-dom';
import { CURSOR_FOCUS, CURSOR_DRAG } from '../../lib/cursors';


const getControlPoints = (anno: any) => {
  if ((anno.type === 'bbox' || anno.type === 'ellipse' || anno.type === 'circle') && anno.points.length === 2) {
    const [p1, p2] = anno.points;
    return [
      { x: p1.x, y: p1.y, id: 0, type: 'bbox-corner' }, // 左上
      { x: p2.x, y: p1.y, id: 1, type: 'bbox-corner' }, // 右上
      { x: p2.x, y: p2.y, id: 2, type: 'bbox-corner' }, // 右下
      { x: p1.x, y: p2.y, id: 3, type: 'bbox-corner' }  // 左下
    ];
  }
  return anno.points.map((p: any, i: number) => ({ ...p, id: i, type: 'point' }));
};
interface SyncAnnotationProps {
  autoSave: () => void;
}
export function SyncAnnotation({ autoSave }: SyncAnnotationProps) {
  const { t } = useTranslation();
  const [formAttributes, setFormAttributes] = useState<Record<string, any>>({});
  const { pushAction, performGlobalUndo, performGlobalRedo, undoCount, redoCount } = useActionHistory();
  // 🌟 安全解构：使用 default value 防止 useStore 还没有彻底更新导致报错
  const state = useStore();
  const {
    views, folders, annotations, addAnnotation, removeAnnotation,
    viewport, setViewport, currentStem,  theme,
    stems, setCurrentStem,
    taxonomyClasses = [{ id: 'default', name: 'object', color: '#3B82F6' }],
    taxonomyAttributes = [],
    activeAnnotationId = null,
    setActiveAnnotationId = () => {}, // 兜底空函数
    editorSettings = { showCrosshair: true, showPixelValue: true },
    tempViewSettings, updateAnnotation,
    setSettingsOpen, aiSettings, setAISettings
  } = state as any; // 使用 as any 兼容可能还未完全写入 AppState 的新字段
  const classOrder = useStore((s) => (s as any).classOrder || []);
  const sortedClasses = [...taxonomyClasses].sort((a: any, b: any) => 
    classOrder.indexOf(a.id) - classOrder.indexOf(b.id)
  );
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const hiddenClasses = useStore((s) => (s).hiddenClasses);
  const hiddenAnnotations = useStore((s) => (s).hiddenAnnotations);
  const toggleAnnotationVisibility = useStore((s) => s.toggleAnnotationVisibility);
  const [promptMode, setPromptMode] = useState<'positive' | 'negative' | 'box'>('positive');
  const [activeAITab, setActiveAITab] = useState<'auto' | 'semi' | 'vqa'>('auto');
  const [isAIPanelOpen, setAIPanelOpen] = useState(false);
  const [isAIReady, setIsAIReady] = useState(false);
  const [formTruncated, setFormTruncated] = useState(false);

  // 🌟 修复 2.1：新增装载 Loading 状态与 Reset 函数
  const [isInitializing, setIsInitializing] = useState(false);
  const handleAIReset = () => {
    setIsAIReady(false);
    setAiPrompts([]);
    setTempActiveAnno(null);
  };
  const [autoResultMsg, setAutoResultMsg] = useState('');
  const [sourceMode, setSourceMode] = useState<'raw' | 'view'>('view');
  const [aiPrompts, setAiPrompts] = useState<SAMPoint[]>([]);
  const [isPredicting, setIsPredicting] = useState(false);
  const [mouseQuad, setMouseQuad] = useState<Record<string, { tl: boolean, tr: boolean }>>({});
  const [selectedAIViewId, setSelectedAIViewId] = useState<string>(views[0]?.id || '');
  type ToolType = 'select' | 'pan' | 'bbox' | 'polygon' | 'point' | 'line' | 'ellipse' | 'circle' | 'lasso' | 'freemask' | 'rbbox' | 'cuboid' | 'ai_anno' | 'cut' | 'cutout';

  const [tool, setTool] = useState<ToolType>('pan');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStep, setDrawStep] = useState(0);
// 🌟 补充拖拽与光标的状态
  const [cursorStyle, setCursorStyle] = useState('default');
// 🌟 1. 新增：用于记录当前正在拖拽的顶点信息，以及拖拽时的临时图形状态
  const [dragVertex, setDragVertex] = useState<{ index: number, type: 'point' | 'edge' } | null>(null);
  const [tempActiveAnno, setTempActiveAnno] = useState<any>(null);

  const [currentPoints, setCurrentPoints] = useState<{ x: number, y: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
// 🌟 记录鼠标在主视图/全局坐标系下的位置
  const [hoverPos, setHoverPos] = useState<{ x: number, y: number } | null>(null);
// 🌟 新增：漫游 (Pan) 状态记录
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  // 🌟 新增：编辑器设置状态
  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [pendingAnnotation, setPendingAnnotation] = useState<any>(null);

  // 🌟 新增：单视图专注模式状态
  const [focusedViewId, setFocusedViewId] = useState<string | null>(null);
  
  // 🌟 史诗级升级：多图层管理引擎
  const [layerOrder, setLayerOrder] = useState<string[]>([]); // 控制渲染 Z-Index 顺序
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({}); // 控制其他图层的显示
  const [layerConfigs, setLayerConfigs] = useState<Record<string, { mode: 'opacity' | 'swipeX' | 'swipeY', value: number }>>({}); // 独立控制每个图层的特效
  const [activeControlLayer, setActiveControlLayer] = useState<string>(''); // 顶部控制条当前选中的图层

// 🌟 2. 新增：原生纯 JS 多边形折线切割算法
  const splitPolygonPureJS = (poly: {x: number, y: number}[], line: {x: number, y: number}[]) => {
    const getIntersection = (A: any, B: any, C: any, D: any) => {
        const denom = (D.y - C.y)*(B.x - A.x) - (D.x - C.x)*(B.y - A.y);
        if (denom === 0) return null;
        const ua = ((D.x - C.x)*(A.y - C.y) - (D.y - C.y)*(A.x - C.x)) / denom;
        const ub = ((B.x - A.x)*(A.y - C.y) - (B.y - A.y)*(A.x - C.x)) / denom;
        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) return { x: A.x + ua*(B.x - A.x), y: A.y + ua*(B.y - A.y) };
        return null;
    };

    let intersections = [];
    for(let i = 0; i < line.length - 1; i++) {
        for(let j = 0; j < poly.length; j++) {
            const intersect = getIntersection(line[i], line[i+1], poly[j], poly[(j+1) % poly.length]);
            if(intersect) intersections.push({ pt: intersect, polyIdx: j, lineIdx: i });
        }
    }
    
    // 必须有确切的穿入和穿出点才能分割
    if (intersections.length < 2) return null;
    
    const first = intersections[0];
    const last = intersections[intersections.length - 1];

    // 构建第一个子多边形
    let poly1 = [first.pt];
    let idx1 = (first.polyIdx + 1) % poly.length;
    while (idx1 !== (last.polyIdx + 1) % poly.length) {
        poly1.push(poly[idx1]);
        idx1 = (idx1 + 1) % poly.length;
    }
    poly1.push(last.pt);
    for (let k = last.lineIdx; k > first.lineIdx; k--) poly1.push(line[k]);

    // 构建第二个子多边形
    let poly2 = [last.pt];
    let idx2 = (last.polyIdx + 1) % poly.length;
    while (idx2 !== (first.polyIdx + 1) % poly.length) {
        poly2.push(poly[idx2]);
        idx2 = (idx2 + 1) % poly.length;
    }
    poly2.push(first.pt);
    for (let k = first.lineIdx + 1; k <= last.lineIdx; k++) poly2.push(line[k]);

    return [poly1, poly2];
  };

  // 🌟 1. 核心修复：建立 AI 状态同步监听器
  useEffect(() => {
    // 只要图片路径(currentStem) 或者 推理的目标视图(selectedAIViewId) 发生任何变化
    // 必须立刻“降级”AI 状态，直到用户再次点击 Confirm
    console.log("[AI Context] View or Image changed, resetting AI state...");
    
    setIsAIReady(false); // 状态栏会立即变回“Image Data Not Loaded”
    setAiPrompts([]);    // 清空当前的点选提示
    setTempActiveAnno(null); // 清空预览图形
    
    // 如果你希望 3 个按钮看起来是“未选中”状态
    // 我们可以在 AIToolPanel 渲染时根据 isAIReady 强制控制其样式
  }, [currentStem, selectedAIViewId]);
// 🌟 终极全局漫游引擎：彻底解决“粘滞”和“无法释放”问题
  useEffect(() => {
    if (!isPanning) return;

    // 全局移动：无论鼠标在哪，只要在漫游状态，就更新视口
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - panStart.mouseX;
      const dy = e.clientY - panStart.mouseY;
      setViewport(viewport.zoom, panStart.panX + dx, panStart.panY + dy);
    };

    // 全局抬手：无论鼠标在哪松开，强制结束漫游
    const handleGlobalMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, panStart, viewport.zoom, setViewport]);
  // 当视图列表加载完成后，默认选中第一个视图
  useEffect(() => {
    if (views.length > 0 && !selectedAIViewId) {
      setSelectedAIViewId(views[0].id);
    }
  }, [views]);

// 初始化图层数据 (🌟 修复：严密的增量初始化，确保 operableLayers 永远不为空)
  useEffect(() => {
    if (views.length > 0 && layerOrder.length !== views.length) {
      setLayerOrder(views.map((v: any) => v.id));
      setLayerConfigs(prev => {
        const newConfigs = { ...prev };
        views.forEach((v: any) => {
          if (!newConfigs[v.id]) newConfigs[v.id] = { mode: 'opacity', value: 1 };
        });
        return newConfigs;
      });
    }
  }, [views, layerOrder.length]);

  // 🌟 安全提取当前选中图层的配置，作为绝对的兜底
  const activeConfig = layerConfigs[activeControlLayer] || { mode: 'opacity', value: 1 };
  // 当进入单视图模式时，默认选中基础图层
  useEffect(() => {
    if (focusedViewId) setActiveControlLayer(focusedViewId);
  }, [focusedViewId]);


  // 🌟 全局快捷键监听引擎
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
      }
      // 安全锁 1：输入框中不触发
      const target = e.target as HTMLElement;
      if (
        target.isContentEditable ||
        (target.tagName === 'TEXTAREA') ||
        (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range')
      ) return;
      
      // 安全锁 2：绘制中不切换
      if (isDrawing) return;
      
      const state = useStore.getState();
      const { shortcutsSettings } = state as any;
      if (!shortcutsSettings) return;

      // 匹配快捷键
      let matchedTool: string | undefined;
      matchedTool = Object.keys(shortcutsSettings).find((tool) => {
        const setting = shortcutsSettings[tool];
        if (!setting) return false;
        
        const keyMatch = e.key.toLowerCase() === setting.key.toLowerCase();
        const shiftMatch = setting.shift ? e.shiftKey : !e.shiftKey;
        const ctrlMatch = setting.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        
        return keyMatch && shiftMatch && ctrlMatch;
      });

      if (!matchedTool) return;

      e.preventDefault();

      // 导航操作
      if (matchedTool === 'home') { handleHomeViewport(); return; }
      if (matchedTool === 'prev') { handlePrevStem(); return; }
      if (matchedTool === 'next') { handleNextStem(); return; }
      
      // 手动保存
      if (matchedTool === 'save') { autoSave(); return; }

      // 工具切换
      handleToolChange(matchedTool);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isDrawing]);

  // 计算当前可被控制的图层列表 (当前图层 + 被勾选显示的图层)
  const operableLayers = layerOrder.filter(id => id === focusedViewId || visibleLayers[id]);
  
  // 🌟 新增：单视图模式下的叠加控制状态
  const [overlayConfig, setOverlayConfig] = useState({
    active: false,
    overlayViewId: 'none',
    mode: 'opacity' as 'opacity' | 'swipeX' | 'swipeY',
    value: 0.5
  });

  // 🌟 核心修复：单图模式显示焦点图层；多图模式下，严格按照右侧列表的拖拽顺序 (layerOrder) 重新排列网格！
  const displayViews = focusedViewId 
    ? views.filter((v: any) => v.id === focusedViewId) 
    : [...views].sort((a: any, b: any) => layerOrder.indexOf(a.id) - layerOrder.indexOf(b.id));
  
  // 网格动态计算将自动把 1 个视图放大为 1x1 铺满
  const gridCols = Math.ceil(Math.sqrt(Math.max(1, displayViews.length)));
  const gridRows = Math.ceil(Math.max(1, displayViews.length) / gridCols);

  // 🌟 表单状态升级为绑定 Taxonomy
  const [formLabel, setFormLabel] = useState(taxonomyClasses[0]?.name || 'object');
  const [formText, setFormText] = useState('');
  const [formDifficult, setFormDifficult] = useState(false);
  const [formOccluded, setFormOccluded] = useState(false);
  const [formGroupId, setFormGroupId] = useState(''); 
  const [formTrackId, setFormTrackId] = useState('');
  const [undonePoints, setUndonePoints] = useState<{x: number, y: number}[]>([]);

  // 当切换图片(Stem)时，清空历史栈，防止跨图像撤销产生 Bug
  useEffect(() => {
    setUndonePoints([]);
  }, [currentStem]);

  // ==========================
  // 🌟 新增：全景展示 (Full Extent) 状态
  // ==========================
  const [showFullExtent, setShowFullExtent] = useState<Record<string, boolean>>({});
  const toggleFullExtent = (viewId: string) => {
      setShowFullExtent(prev => ({ ...prev, [viewId]: !prev[viewId] }));
    };

  // const gridCols = Math.ceil(Math.sqrt(Math.max(1, views.length)));
  // const gridRows = Math.ceil(Math.max(1, views.length) / gridCols);
  const currentAnnotations = annotations.filter((a: Annotation) => a.stem === currentStem);
  
  // 提取主视图的物理尺寸 (作为基准裁剪框)
  const mainViewConfig = views.find((v: any) => v.isMain);
  const mainViewFolder = folders?.find((f: any) => f.id === mainViewConfig?.folderId);
  const mainWidth = mainViewFolder?.metadata?.width || 1024;
  const mainHeight = mainViewFolder?.metadata?.height || 1024;

  // ==========================================
  // 🌟 核心引擎：坐标越界静默裁剪与截断检测
  // ==========================================
  const clampAndFlag = useCallback((points: {x: number, y: number}[]) => {
    let truncated = false;
    const clampedPoints = points.map(pt => {
      let cx = pt.x, cy = pt.y;
      if (cx < 0) { cx = 0; truncated = true; }
      if (cx > mainWidth) { cx = mainWidth; truncated = true; }
      if (cy < 0) { cy = 0; truncated = true; }
      if (cy > mainHeight) { cy = mainHeight; truncated = true; }
      return { x: cx, y: cy };
    });
    return { clampedPoints, truncated };
  }, [mainWidth, mainHeight]);

  // 🌟 1. 修复版的重置视口方法 (Home)
  const handleHomeViewport = useCallback(() => {
    if (!containerRef.current || !mainWidth || !mainHeight) return;

    // 🌟 核心修复：不能用外层大容器，必须精准获取单个画布 (Canvas) 的物理尺寸
    const firstCanvas = containerRef.current.querySelector('canvas');
    if (!firstCanvas) return;

    const containerW = firstCanvas.clientWidth;
    const containerH = firstCanvas.clientHeight;

    const padding = 40; // 留出 40px 的边距
    const availableW = Math.max(10, containerW - padding);
    const availableH = Math.max(10, containerH - padding);

    // 计算适合单格屏幕的缩放比 (取宽比和高比的最小值)
    const targetZoom = Math.min(availableW / mainWidth, availableH / mainHeight);

    // 计算居中的偏移量 (相对于单格 Canvas)
    const newPanX = (containerW - mainWidth * targetZoom) / 2;
    const newPanY = (containerH - mainHeight * targetZoom) / 2;

    // 应用新的视口状态
    setViewport(targetZoom, newPanX, newPanY);
  }, [mainWidth, mainHeight, setViewport]);
// 🌟 工具函数：将多边形点集转换为 BBox 点集 (左上角, 右下角)
  const polygonToBBox = (points: {x: number, y: number}[]) => {
    if (!points || points.length === 0) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return [
      { x: minX, y: minY },
      { x: maxX, y: maxY }
    ];
  };

  // ==========================================
  // 🖱️ 2. 画布交互逻辑 (加入平移与智能缩放)
  // ==========================================
  // 🌟 升级：以鼠标指针为中心进行缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? viewport.zoom * zoomFactor : viewport.zoom / zoomFactor;
    
    // 计算鼠标相对于容器的位置
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 调整 panX 和 panY，使得鼠标指向的图像位置在缩放后保持不动
    const newPanX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
    const newPanY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);

    setViewport(newZoom, newPanX, newPanY);
  };

// 🌟 1. 新增：专门用于清空 Semi 绘图状态的函数
  const handleResetPrompts = useCallback(() => {
    setAiPrompts([]);
    setTempActiveAnno(null); // 彻底清空画面上的蓝色预览块
  }, []);

// 🌟 新增：调用后端推理函数
const handleAIPredict = async (prompts: SAMPoint[]) => {
    const targetView = views.find((v: any) => v.id === selectedAIViewId);
    const fullPath = getFullImagePath(targetView);
    const inferSize = aiSettings.inferenceSize || 644; // 提取设置的尺寸
    
    try {
      setIsPredicting(true);

      // 🌟 1. 正向转换：将用户的 Main View 坐标转为后端所需的 Infer Size 坐标
      const mappedPrompts = prompts.map(p => ({
        ...p,
        ...mapMainToInfer({ x: p.x, y: p.y }, targetView, inferSize)
      }));

      // 注意：使用 mappedPrompts 和 inferSize
      const result = await predictSAM(
        fullPath || '', 
        mappedPrompts, 
        undefined, 
        aiSettings.confidence,
        inferSize 
      );

      if (result.polygons && result.polygons.length > 0) {
        // 🌟 核心修复 A：映射所有的 polygons，而不是只取 [0]
        const allMappedPolygons = result.polygons.map((poly: any) => 
          poly.map((pt: any) => mapInferToMain(pt, targetView, inferSize))
        );

        let finalType = 'polygon';
        let displayPolys = allMappedPolygons;
        
        if (aiSettings.outputType === 'bbox') {
           displayPolys = allMappedPolygons.map(p => polygonToBBox(p));
           finalType = 'bbox';
        }

        // 🌟 核心修复 B：使用 allPolygons 字段存储多维数组
        setTempActiveAnno({
          id: 'ai_preview',
          type: finalType,
          allPolygons: displayPolys, 
          label: formLabel,
          stem: currentStem
        });
      } else {
        // 没找到任何对象时清空预览
        setTempActiveAnno(null);
      }
    } catch (err) {
      console.error("AI Predict Error:", err);
    } finally {
      setIsPredicting(false);
    }
  };


// 🌟 将这个函数完整替换，注意参数里连 viewId 都不要了
  const handleMouseDown = (e: React.MouseEvent) => {
    if (popoverOpen) {
      handleCancelDrawing();
      return; 
    }
    
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      return;
    }

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    // 🌟 核心：直接获取纯正的 Main View 坐标，绝对不要区分辅视图！
    const mainX = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const mainY = (e.clientY - rect.top - viewport.panY) / viewport.zoom;
    // 🌟 优先拦截 2：Pan 工具，或者处于 Auto/VQA 模式下的 AI 工具，左键直接变为漫游拖拽！
    if (tool === 'pan' || (tool === 'ai_anno' && activeAITab !== 'semi')) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      return;
    }

    // 🌟 增加拦截检查：如果是切割或擦除工具，且当前不是正在绘制中（即第一笔落下时）
    if ((tool === 'cut' || tool === 'cutout') && !isDrawing) {
      const activeAnno = annotations.find((a: any) => a.id === activeAnnotationId);
      // 检查：1. 是否选中了对象 2. 选中的对象是否是多边形
      if (!activeAnno || activeAnno.type !== 'polygon') {
        const actionName = tool === 'cut' ? "切割" : "擦除";
        alert(`请先在右侧列表或画布中选中一个多边形，再执行${actionName}操作。`);
        return; // 直接返回，不执行后续的 setIsDrawing(true)
      }
    }
    // 🌟 AI Semi 模式：真正需要打正负样本点的逻辑
    if (tool === 'ai_anno' && activeAITab === 'semi') {
      if (!isAIReady) return;
      const label = promptMode === 'positive' ? 1 : 0;
      const newPoint: SAMPoint = { x: mainX, y: mainY, label };
      const updatedPrompts = [...aiPrompts, newPoint];
      setAiPrompts(updatedPrompts);
      handleAIPredict(updatedPrompts);
      return;
    }
    // 1. Select 工具精准碰撞检测
   // 1. Select 工具精准碰撞检测 (支持所有图形)
    if (e.button === 0 && tool === 'select') { 
      
      // 🌟 第一层检测：是否点中了当前激活图形的“控制点”
      if (activeAnnotationId) {
         const activeAnno = currentAnnotations.find(a => a.id === activeAnnotationId);
         if (activeAnno) {
            const hitRadius = 8 / viewport.zoom;
            const ctrlPoints = getControlPoints(activeAnno); // 🌟 使用全能解析引擎

            const hit = ctrlPoints.find(p => Math.hypot(mainX - p.x, mainY - p.y) < hitRadius);

            if (hit) {
               // 🎯 点击聚焦，变实心拖拽光标
               setCursorStyle(CURSOR_DRAG);
               setDragVertex({ index: hit.id, type: hit.type as any });
               setTempActiveAnno(JSON.parse(JSON.stringify(activeAnno))); // 深拷贝，丝滑渲染
               return; // 拦截后续，开始拖拽
            }
         }
      }
      // 🌟 过滤掉隐藏的标注
      const visibleAnnotations = currentAnnotations.filter(
        (a: any) => !hiddenClasses.includes(a.label) && !hiddenAnnotations.includes(a.id)
      );
      // 🌟 第二层检测：常规选中逻辑 (点击图形主体进行选中)
      let hitIds: string[] = [];
      for (let i = visibleAnnotations.length - 1; i >= 0; i--) {
        const ann = visibleAnnotations[i];
        
        // 1. 矩形、椭圆、圆
        if (ann.type === 'bbox' || ann.type === 'ellipse' || ann.type === 'circle') {
          const [p1, p2] = ann.points;
          const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
          if (mainX >= minX && mainX <= maxX && mainY >= minY && mainY <= maxY) {
            hitIds.push(ann.id);
          }
        } 
        // 2. 多边形、旋转框、3D立方体 (射线法)
        else if (ann.type === 'polygon' || ann.type === 'oriented_bbox' || ann.type === 'cuboid') {
          let inside = false;
          for (let j = 0, k = ann.points.length - 1; j < ann.points.length; k = j++) {
            const xi = ann.points[j].x, yi = ann.points[j].y;
            const xj = ann.points[k].x, yj = ann.points[k].y;
            const intersect = ((yi > mainY) !== (yj > mainY)) && (mainX < (xj - xi) * (mainY - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          if (inside) hitIds.push(ann.id);
        }
        // 3. 线段
        else if (ann.type === 'line') {
          let hit = false;
          for (let j = 0; j < ann.points.length - 1; j++) {
            const p1 = ann.points[j], p2 = ann.points[j+1];
            const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
            let t = l2 === 0 ? 0 : ((mainX - p1.x) * (p2.x - p1.x) + (mainY - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t)); 
            const projX = p1.x + t * (p2.x - p1.x), projY = p1.y + t * (p2.y - p1.y);
            if (Math.hypot(mainX - projX, mainY - projY) < 6 / viewport.zoom) { hit = true; break; }
          }
          if (hit) hitIds.push(ann.id);
        }
        // 4. 单点
        else if (ann.type === 'point') {
          if (ann.points.length > 0 && Math.hypot(mainX - ann.points[0].x, mainY - ann.points[0].y) < 8 / viewport.zoom) {
            hitIds.push(ann.id);
          }
        }
      }

      // 🌟 如果有命中，循环切换
      if (hitIds.length > 0) {
        const currentIdx = hitIds.indexOf(activeAnnotationId);
        // 如果当前选中的在命中列表中，切到下一个；否则选第一个
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % hitIds.length : 0;
        setActiveAnnotationId(hitIds[nextIdx]);
        return;
      }

      // 什么都没点中 → 取消选中，进入漫游
      setActiveAnnotationId(null);
      setIsPanning(true);
      setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      return;
    }
    // 2. 漫游拦截
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      return;
    }

    // 🌟 3. Rotated Box & 3D Cuboid (纯点击3次交互)
    if (tool === 'rbbox' || tool === 'cuboid') {
      if (drawStep === 0) {
        setIsDrawing(true);
        setDrawStep(1);
        setCurrentPoints([{ x: mainX, y: mainY }]); // 第 1 击
      } else if (drawStep === 1) {
        setDrawStep(2);
        setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]); // 第 2 击
      } else if (drawStep === 2) {
        const finalPoints = [...currentPoints, { x: mainX, y: mainY }]; // 第 3 击
        const finalType = tool === 'rbbox' ? 'oriented_bbox' : 'cuboid';
        openSmartPopover(e.clientX, e.clientY, finalType, finalPoints);
        setCurrentPoints([]);
        setDrawStep(0);
        setIsDrawing(false);
      }
      return;
    }

    // 3. 各种画图工具的逻辑分支
    if (tool === 'bbox' || tool === 'ellipse' || tool === 'circle') {
      if (!isDrawing) {
        setIsDrawing(true);
        setCurrentPoints([{ x: mainX, y: mainY }, { x: mainX, y: mainY }]);
      } else {
        setIsDrawing(false);
        if (currentPoints.length > 0 && currentPoints[0]) {
          const [p1] = currentPoints;
          const screenW = Math.abs(mainX - p1.x) * viewport.zoom;
          const screenH = Math.abs(mainY - p1.y) * viewport.zoom;
          if (screenW > 5 || screenH > 5) {
            openSmartPopover(e.clientX, e.clientY, tool, [p1, { x: mainX, y: mainY }]);
          }
        }
        setCurrentPoints([]); // 清空草图
      }
    } else if (tool === 'polygon' || tool === 'line' || tool === 'cut' || tool === 'cutout') {
      setIsDrawing(true); 
      setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
      setUndonePoints([]); 
    } else if (tool === 'lasso'|| tool === 'freemask') {
      setIsDrawing(true);
      setCurrentPoints([{ x: mainX, y: mainY }]);
      setUndonePoints([]); // 顺手清空重做栈
    } else if (tool === 'point') {
      openSmartPopover(e.clientX, e.clientY, 'point', [{ x: mainX, y: mainY }]);
    }
  };

// 🌟 将这个函数完整替换，同样不需要 viewId
  const handleMouseMove = (e: React.MouseEvent, viewId: string) => {
    if (isPanning) {
      const dx = e.clientX - panStart.mouseX;
      const dy = e.clientY - panStart.mouseY;
      setViewport(viewport.zoom, panStart.panX + dx, panStart.panY + dy);
      return;
    }

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // 🌟 计算鼠标是否处于危险重叠区 (TL=左上角, TR=右上角)
    setMouseQuad(prev => ({
      ...prev,
      [viewId]: {
        tl: localX < 150 && localY < 80,
        tr: localX > rect.width - 150 && localY < 100
      }
    }));
    
    // 🌟 核心：永远只获取纯正的主视图坐标系
    const mainX = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const mainY = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

    // 🌟 智能光标反馈：悬停在控制点附近变空心光标
    if (tool === 'select' && activeAnnotationId && !dragVertex) {
      const activeAnno = currentAnnotations.find(a => a.id === activeAnnotationId);
      if (activeAnno) {
        const hitRadius = 8 / viewport.zoom;
        const ctrlPoints = getControlPoints(activeAnno);
        const isNearVertex = ctrlPoints.some(p => Math.hypot(mainX - p.x, mainY - p.y) < hitRadius);
        
        setCursorStyle(isNearVertex ? CURSOR_FOCUS : 'default');
      }
    } 

    // 🌟 光标状态清理：确保切换工具或离开时恢复正常箭头
    if (cursorStyle === CURSOR_FOCUS && (tool !== 'select' || dragVertex)) {
        setCursorStyle('default');
    }

    // 🌟 临时拖拽更新逻辑
    // 🌟 全能拖拽更新逻辑：区分普通点和 BBox 的角点
    // 🌟 临时拖拽更新逻辑：智能处理角点与普通点
    if (tool === 'select' && dragVertex && tempActiveAnno) {
      const updatedAnno = { ...tempActiveAnno };
      
      if (dragVertex.type === 'bbox-corner') {
        // 如果是 BBox 或 椭圆 的包围盒角点
        const [p1, p2] = updatedAnno.points;
        if (dragVertex.index === 0) { p1.x = mainX; p1.y = mainY; }
        else if (dragVertex.index === 1) { p2.x = mainX; p1.y = mainY; }
        else if (dragVertex.index === 2) { p2.x = mainX; p2.y = mainY; }
        else if (dragVertex.index === 3) { p1.x = mainX; p2.y = mainY; }
        updatedAnno.points = [{ ...p1 }, { ...p2 }];
      } else {
        // 多边形、线段等，直接更新对应的点
        updatedAnno.points[dragVertex.index] = { x: mainX, y: mainY };
      }
      
      setTempActiveAnno(updatedAnno);
      return;
    }

    setHoverPos({ x: mainX, y: mainY, viewId });

    // 🌟 复杂三点绘制拖拽更新
    if (isDrawing && (tool === 'rbbox' || tool === 'cuboid')) {
      if (drawStep === 1) {
        // 第一步：拖动形成线 / 矩形面
        setCurrentPoints([currentPoints[0], { x: mainX, y: mainY }]);
      } else if (drawStep === 2) {
        // 第二步：拖动拉伸厚度 / 景深
        setCurrentPoints([currentPoints[0], currentPoints[1], { x: mainX, y: mainY }]);
      }
      return;
    }

    // 严密保护的预览逻辑
    if (isDrawing && (tool === 'bbox' || tool === 'ellipse' || tool === 'circle')) {
      if (currentPoints.length > 0 && currentPoints[0]) {
        setCurrentPoints([currentPoints[0], { x: mainX, y: mainY }]);
      }
    } else if (isDrawing && (tool === 'lasso' || tool === 'freemask')) {
      const lastP = currentPoints[currentPoints.length - 1];
      if (lastP && Math.hypot(mainX - lastP.x, mainY - lastP.y) * viewport.zoom > 5) {
        setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragVertex) {
      setCursorStyle('default'); // 🌟 抬手恢复
    }

    // 🌟 结束拖拽顶点并保存到全局 Store
    if (tool === 'select' && dragVertex && tempActiveAnno) {
      // 🌟 在松手保存的瞬间执行裁剪！
      const { clampedPoints, truncated } = clampAndFlag(tempActiveAnno.points);
      const clampedHoles = tempActiveAnno.holes?.map((hole: any) => clampAndFlag(hole).clampedPoints);

      const finalEditedAnno = {
        ...tempActiveAnno,
        points: clampedPoints,
        holes: clampedHoles,
        truncated // 🌟 写入截断标记
      };

      updateAnnotation(tempActiveAnno.id, { 
        points: clampedPoints, 
        holes: clampedHoles, 
        truncated 
      }); 
      pushAction({ type: 'edit', anno: finalEditedAnno }); 
      setDragVertex(null);
      setTempActiveAnno(null);
      setCursorStyle('default'); 
      return;
    }


    // 🌟 在这套体系下，只有 Lasso, freemask 是靠“松开鼠标”来结束绘制的
    if ((tool === 'lasso' || tool === 'freemask') && isDrawing) {
      setIsDrawing(false);
      if (currentPoints.length > 5) {
        // 🌟 核心修复：如果是 lasso 则保存为线(line)，freemask 存为多边形(polygon)
        const saveType = tool === 'lasso' ? 'line' : 'polygon';
        openSmartPopover(e.clientX, e.clientY, saveType, currentPoints);
      }
      setCurrentPoints([]); 
    }
    // 注意：bbox 等工具的结束移交给了 handleMouseDown 的第二次点击
    // Polygon 等工具的结束移交给了 handleDoubleClick / Enter 键
  };

  // 🌟 处理双击结束绘制
  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((tool === 'polygon' || tool === 'line' || tool === 'cut' || tool === 'cutout') && currentPoints.length > 1) {
      e.preventDefault();
      e.stopPropagation();

      if ((tool === 'polygon' || tool === 'cutout') && currentPoints.length < 3) return;

      // 🌟 新增：如果是 Cut 或 Cutout，执行几何修改逻辑
      if (tool === 'cut' || tool === 'cutout') {
        if (!activeAnnotationId) {
          alert(t('Please select a polygon first (Shortcut: V)'));
          setCurrentPoints([]); setIsDrawing(false);
          return;
        }
        
        const activeAnno = currentAnnotations.find((a: any) => a.id === activeAnnotationId);
        if (!activeAnno || activeAnno.type !== 'polygon') {
          alert(t('Cut/Cutout tools only work on Polygons.'));
          setCurrentPoints([]); setIsDrawing(false);
          return;
        }

        // 1. Cutout 挖洞逻辑 (原生支持)
// 1. Cutout 真正的几何擦除 (Boolean Difference)
        if (tool === 'cutout') {
          try {
            // 将当前目标和橡皮擦转换为 PolyBool 数据格式
            const polyA = { regions: [activeAnno.points.map((p: any) => [p.x, p.y])], inverted: false };
            const polyB = { regions: [currentPoints.map((p: any) => [p.x, p.y])], inverted: false };

            // 🌟 核心引擎：执行 A - B 的布尔差集运算
            const result = PolyBool.difference(polyA, polyB);

            if (result.regions.length === 0) {
              // 橡皮擦太大了，图形被完全擦没，直接删除
              removeAnnotation(activeAnno.id);
              pushAction({ type: 'delete', anno: activeAnno });
              setActiveAnnotationId(null);
            } else {
              // 🌟 智能判断：
              // polybooljs 会自动帮我们算出结果。
              // 如果只剩 1 个 region，说明只是削了边角（变成五边形），或者在内部挖了个纯净的洞
              // 如果有多个 region，说明一刀擦下去，把原图形拦腰截断成了两半！
              
              // 第一块区域保留给原对象更新
              const newPoints = result.regions[0].map((pt: any) => ({ x: pt[0], y: pt[1] }));
              updateAnnotation(activeAnno.id, { points: newPoints, holes: [] }); 

              // 如果断成了好几块，剩下的区域生成全新对象
              for (let i = 1; i < result.regions.length; i++) {
                 const extraPoints = result.regions[i].map((pt: any) => ({ x: pt[0], y: pt[1] }));
                 const newId = `anno_${Math.random().toString(36).substr(2, 9)}`;
                 addAnnotation({ ...activeAnno, id: newId, points: extraPoints, holes: [] });
              }
              pushAction({ type: 'edit', anno: activeAnno });
            }
          } catch (err) {
            // 兜底：如果奇异几何情况计算失败，回退到存 holes
            const newHoles = activeAnno.holes ? [...activeAnno.holes, currentPoints] : [currentPoints];
            updateAnnotation(activeAnno.id, { holes: newHoles });
          }
        }
        // 2. Cut 分割逻辑
        else if (tool === 'cut') {
          const splitResult = splitPolygonPureJS(activeAnno.points, currentPoints);
          if (splitResult && splitResult.length === 2) {
             updateAnnotation(activeAnno.id, { points: splitResult[0] });
             const newId = `anno_${Math.random().toString(36).substr(2, 9)}`;
             addAnnotation({ ...activeAnno, id: newId, points: splitResult[1], holes: [] });
             pushAction({ type: 'edit', anno: activeAnno }); 
          } else {
             alert("切割失败：折线必须从多边形外部穿入并穿出（有且仅有两个交点）。");
          }
        }

      } else {
        // 常规的新建 Polygon / Line 逻辑
        openSmartPopover(e.clientX, e.clientY, tool, currentPoints);
      }

      // 清空状态
      setCurrentPoints([]);
      setIsDrawing(false);
    }
  };

  const handleMouseLeave = (viewId: string) => {
    setHoverPos(null);
    setMouseQuad(prev => {
      const n = { ...prev };
      delete n[viewId];
      return n;
    });
  };

  // 🌟 核心 1：彻底清理当前正在绘制/待确认的所有状态
  const handleCancelDrawing = useCallback(() => {
    setPopoverOpen(false);
    setPendingAnnotation(null);
    setCurrentPoints([]);
    setIsDrawing(false);
    setDrawStep(0);
    setFormText('');
    setFormGroupId('');
    setFormTrackId('');
    setFormDifficult(false);
    setFormOccluded(false);
    setFormAttributes({});
    setUndonePoints([]); // 取消绘制时清空点的重做栈
    setTool('pan');
    setDrawStep(0);
    const { editorSettings } = useStore.getState() as any;
    if (!editorSettings?.continuousDrawing) {
      setTool('pan'); 
    }
  }, []);

// 🌟 升级版：统一处理属性初始化、保存草稿、以及智能计算坐标
  const openSmartPopover = useCallback((
    clientX: number, 
    clientY: number, 
    annoType: string, 
    points: {x: number, y: number}[]
  ) => {
    const { truncated: isMathTruncated } = clampAndFlag(points);
    setFormTruncated(isMathTruncated);

    const initialAttrs: Record<string, any> = {};
    taxonomyAttributes?.forEach((attr: any) => {
      initialAttrs[attr.name] = attr.defaultValue || (attr.options?.[0] || '');
    });
    setFormAttributes(initialAttrs);

    setPendingAnnotation({ type: annoType, points });

    const popoverW = 300;
    const popoverH = 400;
    const padding = 20;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // 🌟 直接用鼠标屏幕坐标
    let safeX = clientX + 15;
    let safeY = clientY + 15;

    if (safeX + popoverW > winW - padding) safeX = winW - popoverW - padding;
    if (safeY + popoverH > winH - padding) safeY = winH - popoverH - padding;
    if (safeX < padding) safeX = padding;
    if (safeY < padding) safeY = padding;

    setPopoverPos({ x: safeX, y: safeY });
    setPopoverOpen(true);
  }, [taxonomyAttributes]);

  const handleUndo = useCallback(() => {
    // 场景 A：精确撤销多边形/线段/Lasso 的单个点
    if (currentPoints.length > 0 && (tool === 'polygon' || tool === 'line' || tool === 'lasso' || tool === 'freemask')) {
      const lastPoint = currentPoints[currentPoints.length - 1];
      setUndonePoints(prev => [...prev, lastPoint]); 
      
      if (currentPoints.length === 1) {
        setCurrentPoints([]); setIsDrawing(false); 
      } else {
        setCurrentPoints(prev => prev.slice(0, -1));
      }
      return;
    }
    // 场景 B：撤销正在拖拽的框、或者取消待确认的蓝色弹窗
    if (isDrawing || pendingAnnotation || popoverOpen) {
      handleCancelDrawing();
      return;
    }
    // 场景 C：交给 Hook 执行全局级撤销
    performGlobalUndo();
  }, [currentPoints, tool, isDrawing, pendingAnnotation, popoverOpen, handleCancelDrawing, performGlobalUndo]);

  const handleRedo = useCallback(() => {
    // 场景 A：重做多边形/线段的点
    if ((tool === 'polygon' || tool === 'line' || tool === 'lasso' || tool === 'freemask') && undonePoints.length > 0) {
      const pointToRestore = undonePoints[undonePoints.length - 1];
      setUndonePoints(prev => prev.slice(0, -1));
      setCurrentPoints(prev => [...prev, pointToRestore]);
      setIsDrawing(true);
      return;
    }
    // 场景 B：交给 Hook 执行全局级重做
    performGlobalRedo();
  }, [tool, undonePoints, performGlobalRedo]);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
  const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault();
      handleRedo();
      return;
    }
    
    if (isCtrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      handleUndo();
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && activeAnnotationId) {
      const targetAnno = currentAnnotations.find(a => a.id === activeAnnotationId);
      if (targetAnno) {
        pushAction({ type: 'delete', anno: targetAnno }); 
      }
      removeAnnotation(activeAnnotationId);
      setActiveAnnotationId(null);
    }
    
    if (e.key === 'Enter' && (tool === 'polygon' || tool === 'line') && currentPoints.length > 1) {
      if (tool === 'polygon' && currentPoints.length < 3) return;
      const lastPoint = currentPoints[currentPoints.length - 1];
      const screenX = (lastPoint.x * viewport.zoom) + viewport.panX;
      const screenY = (lastPoint.y * viewport.zoom) + viewport.panY;
      openSmartPopover(screenX, screenY, tool, currentPoints);
      setCurrentPoints([]);
    } else if (e.key === 'Escape') {
      handleCancelDrawing();
      setActiveAnnotationId(null);
    }
  }, [currentPoints, tool, viewport, activeAnnotationId, 
    removeAnnotation, setActiveAnnotationId, 
    currentAnnotations, pushAction, handleUndo, handleRedo, handleCancelDrawing]);
  
    useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const savePendingAnnotationToStore = () => {
    if (pendingAnnotation && currentStem) {
      const newId = `anno_${Math.random().toString(36).substr(2, 9)}`;
      
      // 🌟 1. 对主图形执行裁剪与越界检测
      const { clampedPoints } = clampAndFlag(pendingAnnotation.points);

      // 🌟 2. 对可能存在的孔洞执行裁剪
      let holesTruncated = false;
      const clampedHoles = pendingAnnotation.holes?.map((hole: any) => {
        const res = clampAndFlag(hole);
        if (res.truncated) holesTruncated = true;
        return res.clampedPoints;
      });
      
      const fullAnno = {
        id: newId,
        ...pendingAnnotation,
        points: clampedPoints,       // 🌟 写入裁剪后的点
        holes: clampedHoles,         // 🌟 写入裁剪后的孔洞
        label: formLabel,
        text: formText, // 🌟 对象的描述
        group_id: formGroupId ? Number(formGroupId) : null, // 🌟 确保转换为数字或 null
        track_id: formTrackId ? Number(formTrackId) : null, // 🌟 确保转换为数字或 null
        stem: currentStem,
        difficult: formDifficult,
        occluded: formOccluded,
        truncated: formTruncated,
        attributes: formAttributes // 🌟 核心修正：使用弹窗中实际修改的属性，而不是 defaultAttrs
      };

      addAnnotation(fullAnno);
      pushAction({ type: 'add', anno: fullAnno });

      if (typeof setUndonePoints === 'function') {
        setUndonePoints([]);
      }
  
      setPopoverOpen(false);
      setPendingAnnotation(null);
      setFormText('');
      setFormDifficult(false);
      setFormOccluded(false);
      setFormGroupId('');
      setFormTrackId('');
      setFormAttributes({});
      setActiveAnnotationId(newId);
      setFormTruncated(false);
    }

    if (!state.editorSettings?.continuousDrawing) {
      handleToolChange('pan'); // 使用我们之前封装的拦截器切换
    }
  };

  const stemIndex = stems.indexOf(currentStem);
  const handlePrevStem = () => {
    const state = useStore.getState();
    const { stems, currentStem, setCurrentStem } = state;
    const idx = stems.indexOf(currentStem);
    
    console.log('BEFORE — currentStem:', currentStem, 'stemIndex:', idx);
    
    if (idx > 0) {
      const newStem = stems[idx - 1];
      console.log('SETTING currentStem to:', newStem);
      setCurrentStem(newStem);
      setActiveAnnotationId(null);
    } else {
      console.log('Already at first stem');
    }
  };

  const handleNextStem = () => {
    const state = useStore.getState();
    const { stems, currentStem, setCurrentStem } = state;
    const idx = stems.indexOf(currentStem);
    
    console.log('BEFORE — currentStem:', currentStem, 'stemIndex:', idx);
    
    if (idx < stems.length - 1) {
      const newStem = stems[idx + 1];
      console.log('SETTING currentStem to:', newStem);
      setCurrentStem(newStem);
      setActiveAnnotationId(null);
    } else {
      console.log('Already at last stem');
    }
  };


// 🌟 辅助：根据视图计算磁盘物理路径
const getFullImagePath = (view: any) => {
  const folder = folders.find((f: any) => f.id === view.folderId);
  if (!folder) return null;
  // 按照你的 filesystem 逻辑拼接
  const fileName = `${currentStem}${folder.suffix || '.tif'}`;
  return `${folder.path}/${fileName}`;
};

// 🌟 引擎 1：解析当前视图的真实物理尺寸与可能存在的裁剪框 (Crop)
// 🌟 引擎 1：解析当前视图的真实物理尺寸与百分比裁剪框 (Crop)
  const getViewDimensions = (view: any) => {
    const folder = folders?.find((f: any) => f.id === view.folderId);
    // 提取原图尺寸，如果没有则给兜底值
    const rawWidth = folder?.metadata?.width || 1024;
    const rawHeight = folder?.metadata?.height || 1024;
    
    // 🌟 核心修复：正确读取 transform 中的百分比 Crop 参数
    const crop = view.transform?.crop;

    if (!crop) {
      // 如果没有裁剪，返回整图尺寸
      return { rawWidth, rawHeight, cropX: 0, cropY: 0, cropW: rawWidth, cropH: rawHeight };
    }

    // t(Top), r(Right), b(Bottom), l(Left) 是 0-100 的百分比
    // 根据百分比换算出实际的物理像素坐标和宽高
    const cropX = (crop.l / 100) * rawWidth;
    const cropY = (crop.t / 100) * rawHeight;
    const cropW = ((crop.r - crop.l) / 100) * rawWidth;
    const cropH = ((crop.b - crop.t) / 100) * rawHeight;
    
    return { rawWidth, rawHeight, cropX, cropY, cropW, cropH };
  };

  // 🌟 引擎 2：【正向投影】 发送给 AI 前：主坐标系 -> AI 推理坐标系
  const mapMainToInfer = (pt: {x: number, y: number}, targetView: any, inferSize: number) => {
    // 1. 解除矩阵变换：Main -> Aug Raw
    const { offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1 } = targetView.transform || {};
    const targetRawX = (pt.x - offsetX) / scaleX;
    const targetRawY = (pt.y - offsetY) / (scaleY || scaleX);

    // 2. 解除裁剪偏移：Aug Raw -> Aug Crop
    const { cropX, cropY, cropW, cropH } = getViewDimensions(targetView);
    const targetCropX = targetRawX - cropX;
    const targetCropY = targetRawY - cropY;

    // 3. 计算缩放比并映射：Aug Crop -> Infer Size
    const scaleToInfer = inferSize / Math.max(cropW, cropH);
    return {
      x: targetCropX * scaleToInfer,
      y: targetCropY * scaleToInfer
    };
  };

  // 🌟 引擎 3：【逆向投影】 接收 AI 结果入库前：AI 推理坐标系 -> 主坐标系
  const mapInferToMain = (pt: {x: number, y: number}, targetView: any, inferSize: number) => {
    const { offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1 } = targetView.transform || {};
    const { cropX, cropY, cropW, cropH } = getViewDimensions(targetView);

    // 1. 解除缩放：Infer Size -> Aug Crop
    const scaleToInfer = inferSize / Math.max(cropW, cropH);
    const targetCropX = pt.x / scaleToInfer;
    const targetCropY = pt.y / scaleToInfer;

    // 2. 加上裁剪偏移：Aug Crop -> Aug Raw
    const targetRawX = targetCropX + cropX;
    const targetRawY = targetCropY + cropY;

    // 3. 加上矩阵变换重回主坐标系：Aug Raw -> Main View
    return {
      x: targetRawX * scaleX + offsetX,
      y: targetRawY * (scaleY || scaleX) + offsetY
    };
  };

// 🌟 修改工具栏点击拦截
// 🌟 修复关键：在参数列表前加上 async 关键字
const handleToolChange = async (newTool: string) => { 
  if (newTool === 'ai_anno') {
    // 🌟 核心探针逻辑：点开前先 ping 一下后端
    // 现在这里可以使用 await 了
    const status = await checkVisionAIStatus();
    
    if (!status.is_loaded) {
      setAISettings({ isConfigured: false });
      alert("Vision Engine 处于离线状态。请在设置中配置并装载模型！");
      setSettingsOpen?.(true);
      return;
    } else {
      setAISettings({ isConfigured: true });
    }

    if (tool === 'ai_anno') {
      setAIPanelOpen(!isAIPanelOpen); 
      return; 
    } else {
      setAIPanelOpen(true); 
    }
  } else {
    setAIPanelOpen(false); 
  }
    
  if (newTool === 'cut' || newTool === 'cutout') {
    const activeAnno = currentAnnotations.find((a: any) => a.id === activeAnnotationId);
    if (!activeAnno || activeAnno.type !== 'polygon') {
      const actionName = newTool === 'cut' ? "切割" : "擦除";
      alert(`请先选中一个多边形，然后再使用${actionName}工具。`);
      setTool('select'); 
      return; 
    }
  }
  
  setTool(newTool as any);
};


// 🌟 核心：AI 初始化函数（带参数修复）
// src/components/SyncAnnotation.tsx 内部修改
const handleAIInit = async () => {
    const targetView = views.find((v: any) => v.id === selectedAIViewId);
    if (!targetView) return;

    const fullPath = getFullImagePath(targetView);
    // 🌟 直接调用我们写好的强力引擎获取真实裁剪框
    const { cropX, cropY, cropW, cropH } = getViewDimensions(targetView);

    try {
      setIsInitializing(true); 
      
      const renderedData = sourceMode === 'view' 
        ? document.querySelector('img[alt="Base Layer"]')?.getAttribute('src') 
        : null;

      await initSAM({ 
        image_path: fullPath || '', 
        image_data: renderedData || undefined,
        image_size: aiSettings.inferenceSize,
        // 🌟 修复：把裁剪框传给后端
        crop_x: Math.round(cropX),
        crop_y: Math.round(cropY),
        crop_w: Math.round(cropW),
        crop_h: Math.round(cropH)
      });
      
      setIsAIReady(true); 
    } catch (err: any) {
    console.error("AI Init Error:", err);
    setIsAIReady(false);
    
    // 🌟 核心修复：智能捕捉“模型丢失”错误，自动纠正前端状态
    if (err.message && err.message.includes("模型尚未装载")) {
      // 强制把前端状态改回未配置
      setAISettings({ isConfigured: false });
      alert("检测到后端服务重启，模型显存已清空。请点击右上角【设置 -> AI Engine Settings】重新装载模型！");
    } else {
      alert(`初始化失败: ${err.message}`);
    }
  } finally {
    setIsInitializing(false); 
  }
};
// 🌟 处理 Auto Tab 下的推理点击事件
// 🌟 替换 1：彻底对齐手工工具的默认属性提取逻辑 (Auto 模式)
const handleAutoPredict = async (tags: string[], mappingDict: Record<string, string>) => {
    if (!isAIReady) return;
    const targetView = views.find((v: any) => v.id === selectedAIViewId);
    const fullPath = getFullImagePath(targetView);
    const inferSize = aiSettings.inferenceSize || 644;

    // 🎯 核心：直接使用组件顶层解构出的 taxonomyAttributes，和手工工具 100% 一致
    const defaultAttrs: Record<string, any> = {};
    taxonomyAttributes?.forEach((attr: any) => {
      defaultAttrs[attr.name] = attr.defaultValue || (attr.options?.[0] || '');
    });

    try {
      setIsPredicting(true);
      setAutoResultMsg(''); 
      
      const result = await predictAutoSAM(
        fullPath || '',
        tags,
        aiSettings.confidence,
        inferSize
      );
      
      const groupedResults = result.results || [];
      let totalFound = 0;
      
      if (groupedResults.length > 0) {
        groupedResults.forEach((group: { prompt: string, polygons: any[] }) => {
          const { prompt, polygons } = group;
          const finalClassName = mappingDict[prompt] || 'Uncategorized'; 

          polygons.forEach((poly: any, index: number) => {
            const { rawWidth, rawHeight } = getViewDimensions(targetView);
            const { scaleX = 1, scaleY = 1 } = targetView.transform || {};
            const trueMainWidth = rawWidth * scaleX;
            const trueMainHeight = rawHeight * (scaleY || scaleX);

            let mappedPoly = poly.map((pt: any) => mapInferToMain(pt, targetView, inferSize));

            const filterVal = Number(aiSettings.filterThreshold || 0);
            if (filterVal > 0) {
              const bbox = polygonToBBox(mappedPoly);
              const w = bbox[1].x - bbox[0].x;
              const h = bbox[1].y - bbox[0].y;
              if (w < trueMainWidth * (filterVal / 100) || h < trueMainHeight * (filterVal / 100)) {
                return; 
              }
            }

            totalFound++;

            let finalType = 'polygon';
            if (aiSettings.outputType === 'bbox') {
              mappedPoly = polygonToBBox(mappedPoly);
              finalType = 'bbox';
            }
            
            const { clampedPoints, truncated } = clampAndFlag(mappedPoly);
            const newId = `anno_auto_${Math.random().toString(36).substr(2, 9)}_${totalFound}`;
            const finalAnno = {
              id: newId,
              type: finalType, 
              points: clampedPoints, 
              label: finalClassName,
              stem: currentStem,
              attributes: { ...defaultAttrs }, // 🎯 注入计算好的默认属性
              difficult: false,
              occluded: false,
              truncated: truncated
            };
            addAnnotation(finalAnno);
            pushAction({ type: 'add', anno: finalAnno });
          });
        });
        
        setAutoResultMsg(`Found ${totalFound} Objects!`);
      } else {
        setAutoResultMsg(`Found 0 Objects.`);
      }

    } catch (e: any) {
      console.error(e);
      alert(`推理失败: ${e.message}`);
    } finally {
      setIsPredicting(false); 
    }
};

// 🌟 替换 2：彻底对齐手工工具的默认属性提取逻辑 (Semi 模式)
  const handleAIConfirm = useCallback(() => {
    if (!tempActiveAnno) return;

    // 🎯 核心：直接使用组件顶层解构出的 taxonomyAttributes
    const defaultAttrs: Record<string, any> = {};
    taxonomyAttributes?.forEach((attr: any) => {
      defaultAttrs[attr.name] = attr.defaultValue || (attr.options?.[0] || '');
    });

    const targetLabel = (aiSettings.semiClass && aiSettings.semiClass !== 'None') 
      ? aiSettings.semiClass 
      : formLabel;

    tempActiveAnno.allPolygons.forEach((polyPoints: any) => {
      const { clampedPoints, truncated } = clampAndFlag(polyPoints);
      const newId = `anno_${Math.random().toString(36).substr(2, 9)}`;
      const finalAnno = {
        id: newId,
        type: tempActiveAnno.type, 
        points: clampedPoints,
        label: targetLabel,
        stem: currentStem,
        attributes: { ...defaultAttrs }, // 🎯 注入计算好的默认属性
        difficult: false,
        occluded: false,
        truncated: truncated,        // 🌟 截断标志
      };
      addAnnotation(finalAnno);
      pushAction({ type: 'add', anno: finalAnno });
    });

    setTempActiveAnno(null);
    setAiPrompts([]);
    
    if (!state.editorSettings?.continuousDrawing) {
      setTool('pan');
      setAIPanelOpen(false);
    }
  }, [tempActiveAnno, formLabel, aiSettings.semiClass, currentStem, addAnnotation, pushAction, state.editorSettings, taxonomyAttributes]); 
  // 🎯 极度关键：必须把 taxonomyAttributes 放在依赖数组里！否则 React 会永远记住你刚刷新页面时空的属性列表。

  const handleDelete = () => {
    if (activeAnnotationId) {
      removeAnnotation(activeAnnotationId);
    }
  };
  const handleClear = () => {
    if (!currentStem) return;
    const currentAnnos = annotations.filter(a => a.stem === currentStem);
    currentAnnos.forEach(a => removeAnnotation(a.id));
  };

  const [toolbarPos, setToolbarPos] = useState({ x: -9999, y: 32 });
  const [isToolbarDragging, setIsToolbarDragging] = useState(false);
  const toolbarDragRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0 });
  useEffect(() => {
    if (focusedViewId) {
      setToolbarPos({ x:60, y: 2 });
    }
  }, [focusedViewId]);
  useEffect(() => {
    if (!isToolbarDragging) return;
    
    const handleMove = (e: PointerEvent) => {
      setToolbarPos({
        x: toolbarDragRef.current.origX + e.clientX - toolbarDragRef.current.startX,
        y: toolbarDragRef.current.origY + e.clientY - toolbarDragRef.current.startY,
      });
    };
    const handleUp = () => setIsToolbarDragging(false);
    
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isToolbarDragging]);
  return (
    <div 
    className="flex h-full overflow-hidden bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 relative"
    style={{ cursor: cursorStyle }}
    >
      
      {/* 👈 Left Toolbar */}
      <div className="relative">
        {leftPanelOpen ? (
          <LeftToolbar 
            tool={tool} 
            setTool={handleToolChange}
            onHomeClick={handleHomeViewport}
            handleUndo={handleUndo} handleRedo={handleRedo} 
            canUndo={undoCount > 0 || currentPoints.length > 0}
            canRedo={redoCount > 0 || undonePoints.length > 0}
            handlePrevStem={handlePrevStem}
            handleNextStem={handleNextStem}
            hasPrev={stemIndex > 0}
            hasNext={stemIndex < stems.length - 1}
            handleDelete={handleDelete}
            handleClear={handleClear}
            handleSave={autoSave}
          />
        ) : (
          <button
            onClick={() => setLeftPanelOpen(true)}
            className="h-full w-6 bg-neutral-100 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            title="Expand Left Panel"
          >
            <ChevronRight className="w-4 h-4 text-neutral-500" />
          </button>
        )}
        
        {/* 🌟 折叠按钮（面板展开时显示） */}
        {leftPanelOpen && (
          <button
            onClick={() => setLeftPanelOpen(false)}
            className="absolute top-2 -right-3 w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors z-20 shadow-sm"
            title="Collapse Left Panel"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-neutral-500" />
          </button>
        )}
      </div>

    {/* 🤖 🌟 新增：左侧 AI 二级悬浮面板 */}
     {/* 🤖 窄版 AI 面板 */}
      <AIToolPanel 
        isOpen={isAIPanelOpen}
        onClose={() => setAIPanelOpen(false)}
        views={views}
        selectedViewId={selectedAIViewId}
        onViewChange={setSelectedAIViewId}
        taxonomyClasses={sortedClasses}
        aiPrompts={aiPrompts}
        setAiPrompts={setAiPrompts}
        isPredicting={isPredicting}
        onConfirmPreview={handleAIConfirm}
        sourceMode={sourceMode}
        setSourceMode={setSourceMode}
        isAIReady={isAIReady}        
        promptMode={promptMode}       
        setPromptMode={setPromptMode}
        activeTab={activeAITab}
        setActiveTab={setActiveAITab}
        isInitializing={isInitializing} 
        onConfirmInit={handleAIInit}
        onResetInit={handleAIReset}
        onAutoPredict={handleAutoPredict}
        autoResultMsg={autoResultMsg}
        onResetPrompts={handleResetPrompts}
      />

      {/* 🎯 Grid Workspace */}
      <div className="flex-grow p-4 overflow-hidden relative" ref={containerRef} onWheel={handleWheel}>
        
        {/* 🌟 升级：多图层悬浮叠加控制器 (TopBar) */}
        {focusedViewId && views.length > 0 && (
          <div 
            className="fixed z-50 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md p-1.5 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-700 flex items-center gap-3 animate-in slide-in-from-top-4 cursor-grab active:cursor-grabbing select-none"
            style={{ left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px`, transform: 'translate(0, 0)' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsToolbarDragging(true);
              toolbarDragRef.current = { 
                startX: e.clientX, startY: e.clientY, 
                origX: toolbarPos.x, origY: toolbarPos.y 
              };
            }}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Single View
            </div>
            <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

            {/* 🌟 终极修复 2：彻底放弃坑人的 Radix 自动回显，直接手动硬编码匹配文字！ */}
            <Select value={activeControlLayer || 'none'} onValueChange={setActiveControlLayer}>
              <SelectTrigger className="h-7 w-36 text-xs bg-transparent border-none focus:ring-0 font-bold">
                <SelectValue>
                  {/* 强制要求它渲染我们手写的逻辑，再也不会出现乱码或 ID 暴露 */}
                  {(!activeControlLayer || activeControlLayer === 'none') ? (
                    <span className="text-neutral-500">None (Disable FX)</span>
                  ) : (
                    (() => {
                      const v = views.find((v:any) => v.id === activeControlLayer);
                      if (!v) return "None (Disable FX)";
                      return `${activeControlLayer === focusedViewId ? '✨' : ''}${v.isMain ? 'Main View' : `Aug View ${views.indexOf(v)}`}`;
                    })()
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs text-neutral-500">None (Disable FX)</SelectItem>
                {operableLayers.map((layerId) => {
                  const v = views.find((v:any) => v.id === layerId);
                  if (!v) return null;
                  return (
                    <SelectItem key={layerId} value={layerId} className="text-xs">
                      {layerId === focusedViewId ? '✨ ' : ''}
                      {v.isMain ? 'Main View' : `Aug View ${views.indexOf(v)}`}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            {/* 图层特效控制器 */}
            {activeControlLayer && activeControlLayer !== 'none' && (
              <>
                <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700" />
                <Select 
                  value={activeConfig.mode} 
                  onValueChange={(val: any) => setLayerConfigs(p => ({ ...p, [activeControlLayer]: { mode: val, value: val === 'opacity' ? 0.5 : 50 } }))}
                >
                  <SelectTrigger className="h-7 w-24 text-xs bg-transparent border-none focus:ring-0">
                    {/* 🌟 终极修复：放弃自动匹配，直接根据状态写死屏幕上该显示的文字 */}
                    <SelectValue>
                      {activeConfig.mode === 'opacity' && 'Opacity'}
                      {activeConfig.mode === 'swipeX' && 'H-Swipe'}
                      {activeConfig.mode === 'swipeY' && 'V-Swipe'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opacity" className="text-xs">Opacity</SelectItem>
                    <SelectItem value="swipeX" className="text-xs">H-Swipe</SelectItem>
                    <SelectItem value="swipeY" className="text-xs">V-Swipe</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* 调整了父级宽度，留出文字空间，并设置 gap-2 */}
                <div className="w-44 px-2 flex items-center gap-2">
                  <input 
                    type="range"
                    onPointerDown={(e) => e.stopPropagation()}
                    min={0}
                    max={activeConfig.mode === 'opacity' ? 1 : 100}
                    step={activeConfig.mode === 'opacity' ? 0.01 : 1}
                    value={activeConfig.value}
                    onChange={(e) => setLayerConfigs(p => ({ 
                      ...p, 
                      [activeControlLayer]: { 
                        ...(p[activeControlLayer] || { mode: 'opacity', value: 1 }), 
                        value: parseFloat(e.target.value) 
                      } 
                    }))}
                    // flex-1 让滑块占据剩下的所有空间
                    className="flex-1 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  {/* 🌟 修复 1：新增动态数字回显 */}
                  <span className="text-[10px] text-neutral-500 font-mono w-9 text-right shrink-0 select-none">
                    {activeConfig.mode === 'opacity' 
                      ? `${Math.round(activeConfig.value * 100)}%` 
                      : `${Math.round(activeConfig.value)}%`
                    }
                  </span>
                </div>
              </>
            )}

            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30" onClick={() => setFocusedViewId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {views.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
            {t('workspace.noViews')}
          </div>
        ) : (
          <div className="w-full h-full grid gap-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))` }}>
            {displayViews.map((view: any, index: number) => (
              <div key={view.id} className="relative border border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-black rounded-lg overflow-hidden transition-colors duration-300">
                <div className={`absolute z-40 px-2 py-1 bg-black/70 text-xs rounded text-neutral-300 transition-all duration-300 ${mouseQuad[view.id]?.tl ? 'top-2 right-2' : 'top-2 left-2'}`}>
                  {view.isMain ? t('workspace.mainView') : `${t('workspace.augView')} ${index}`}
                </div>
                
                <CanvasView 
                  view={view} 
                  annotations={(tempActiveAnno && tempActiveAnno.id !== 'ai_preview' 
                    ? currentAnnotations.map((a: any) => a.id === tempActiveAnno.id ? tempActiveAnno : a) 
                    : currentAnnotations)
                    .filter((a: any) => !hiddenClasses.includes(a.label))
                    .filter((a: any) => !hiddenAnnotations.includes(a.id))
                  }
                  activeAnnotationId={activeAnnotationId}
                  taxonomyClasses={sortedClasses}
                  currentPoints={currentPoints}
                  tool={(tool === 'ai_anno' && activeAITab !== 'semi') ? 'pan' : tool}
                  theme={theme}
                  folders={folders}
                  currentStem={currentStem}
                  isPanning={isPanning}
                  mainWidth={mainWidth}
                  mainHeight={mainHeight}
                  isFullExtent={!!showFullExtent[view.id]}
                  formLabel={formLabel}
                  pendingAnnotation={tool === 'ai_anno' && tempActiveAnno ? tempActiveAnno : pendingAnnotation}
                  onDoubleClick={handleDoubleClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={(e: any) => handleMouseMove(e, view.id)}
                  onMouseUp={handleMouseUp}
                  hoverPos={hoverPos}
                  onMouseLeave={handleMouseLeave}
                  editorSettings={editorSettings}
                  mouseQuad={mouseQuad[view.id]}
                  /* 🌟 传递图层引擎数据 */
                  layerOrder={layerOrder}
                  visibleLayers={visibleLayers}
                  layerConfigs={layerConfigs}
                  allViews={views}
                  isSingleViewMode={!!focusedViewId}
                  showFullExtent={showFullExtent} // 🌟 修复 2：把裁剪范围控制权传给覆盖层引擎
                  tempViewSettings={tempViewSettings}
                  cursorStyle={cursorStyle}
                  aiPrompts={aiPrompts}
                />
              </div>
            ))}
          </div>
        )}

        {/* 🎈 Floating Popover for Class Selection */}
        {/* 2. 悬浮弹窗 */}
      {popoverOpen && createPortal(
        <ClassFormPopover 
          popoverPos={popoverPos} formLabel={formLabel} setFormLabel={setFormLabel}
          formText={formText} setFormText={setFormText} formGroupId={formGroupId} 
          setFormGroupId={setFormGroupId} formTrackId={formTrackId} setFormTrackId={setFormTrackId}
          formDifficult={formDifficult} setFormDifficult={setFormDifficult}
          formOccluded={formOccluded} setFormOccluded={setFormOccluded}
          formTruncated={formTruncated} setFormTruncated={setFormTruncated}
          formAttributes={formAttributes} 
          setFormAttributes={setFormAttributes}
          handleCancelDrawing={handleCancelDrawing} savePendingAnnotationToStore={savePendingAnnotationToStore}
          taxonomyClasses={sortedClasses}
        />,
        document.body
      )}
      </div>
      
      {/* 👉 Right Panel */}
      <div className="relative">
        {rightPanelOpen ? (
          <RightPanel 
            tool={tool} 
            showFullExtent={showFullExtent} toggleFullExtent={toggleFullExtent} 
            pushAction={pushAction}
            focusedViewId={focusedViewId} setFocusedViewId={setFocusedViewId}
            layerOrder={layerOrder} setLayerOrder={setLayerOrder}
            visibleLayers={visibleLayers} setVisibleLayers={setVisibleLayers}
            hiddenAnnotations={hiddenAnnotations}
            toggleAnnotationVisibility={toggleAnnotationVisibility}
          />
        ) : (
          <button
            onClick={() => setRightPanelOpen(true)}
            className="h-full w-6 bg-neutral-100 dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            title="Expand Right Panel"
          >
            <ChevronLeft className="w-4 h-4 text-neutral-500" />
          </button>
        )}
        
        {/* 🌟 折叠按钮（面板展开时显示） */}
        {rightPanelOpen && (
          <button
            onClick={() => setRightPanelOpen(false)}
            className="absolute top-2 -left-3 w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors z-20 shadow-sm"
            title="Collapse Right Panel"
          >
            <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
          </button>
        )}
      </div>
    </div>
  );
}
