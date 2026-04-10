import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Annotation } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { ClassFormPopover } from './annotation/ClassFormPopover';
import { LeftToolbar } from './annotation/LeftToolbar';
import { RightPanel } from './annotation/RightPanel';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useActionHistory } from '../../hooks/useActionHistory';
import { CanvasView } from './annotation/CanvasView';
import { X, Minimize, Frame } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { Button } from '@/components/ui/button';
import PolyBool from 'polybooljs';

// 🌟 定义自定义光标样式
// 🌟 修复版光标：空心聚焦 (Hover) 与 实心拖拽 (Drag)
const CURSOR_FOCUS = `url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI1IiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI0IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=') 12 12, pointer`;
const CURSOR_DRAG = `url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI1IiBmaWxsPSJibGFjayIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+') 12 12, crosshair`;

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

export function SyncAnnotation() {
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
  } = state as any; // 使用 as any 兼容可能还未完全写入 AppState 的新字段
  const [mouseQuad, setMouseQuad] = useState<Record<string, { tl: boolean, tr: boolean }>>({});
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
      // 安全锁 1：如果用户正在输入框里打字（例如填 Label Text），绝对不触发快捷键！
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
      
      // 安全锁 2：如果用户正在画图过程中，禁用快捷键切换工具，防止状态错乱
      if (isDrawing) return;

      const key = e.key.toLowerCase();
      const { shortcuts } = useStore.getState() as any;

      // 遍历匹配快捷键
      const matchedTool = Object.keys(shortcuts).find(tool => shortcuts[tool] === key);
      if (matchedTool) {
        e.preventDefault(); // 阻止浏览器默认行为
        handleToolChange(matchedTool); // 调用之前写的带弹窗拦截的 Tool Change 函数
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isDrawing]); // 依赖 isDrawing，防止画一半切工具

  // 计算当前可被控制的图层列表 (当前图层 + 被勾选显示的图层)
  const operableLayers = layerOrder.filter(id => id === focusedViewId || visibleLayers[id]);
  
  // 🌟 新增：单视图模式下的叠加控制状态
  const [overlayConfig, setOverlayConfig] = useState({
    active: false,
    overlayViewId: 'none',
    mode: 'opacity' as 'opacity' | 'swipeX' | 'swipeY',
    value: 0.5
  });
  // // 🌟 核心：如果开启了单图模式，就过滤出这一个 View，否则显示所有
  // const displayViews = focusedViewId ? views.filter((v: any) => v.id === focusedViewId) : views;

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
// 🌟 新增：工具栏选择拦截器
  const handleToolChange = (newTool: string) => {
    // 如果用户试图点击 Cut 或 Cutout 工具
    if (newTool === 'cut' || newTool === 'cutout') {
      // 检查当前是否有选中的标注，且必须是多边形
      const activeAnno = currentAnnotations.find((a: any) => a.id === activeAnnotationId);
      if (!activeAnno || activeAnno.type !== 'polygon') {
        const actionName = newTool === 'cut' ? "切割" : "擦除";
        alert(`请先选中一个多边形，然后再使用${actionName}工具。`);
        
        // 💡 贴心交互：自动帮用户切换到 Select (选择) 工具，引导他们去选图形
        setTool('select'); 
        return; 
      }
    }
    
    // 如果校验通过，或者切换的是其他工具，正常更新状态
    setTool(newTool);
  };
// 🌟 将这个函数完整替换，注意参数里连 viewId 都不要了
  const handleMouseDown = (e: React.MouseEvent) => {
    if (popoverOpen) {
      handleCancelDrawing();
      return; 
    }
    
    // 🌟 AI 功能暂不实现拦截
    if (tool === 'ai_anno') {
      alert("AI Auto Annotation is temporarily not implemented.");
      setTool('pan');
      return;
    }

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    // 🌟 核心：直接获取纯正的 Main View 坐标，绝对不要区分辅视图！
    const mainX = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const mainY = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

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

    // 1. Select 工具精准碰撞检测
    if (e.button === 0 && tool === 'select') {
      
      // 🌟 新增：先检测是否点中了当前激活图形的“控制顶点”
      if (activeAnnotationId) {
        const activeAnno = currentAnnotations.find((a: any) => a.id === activeAnnotationId);
        if (activeAnno) {
          const hitRadius = 8 / viewport.zoom; // 稍微扩大吸附范围，手感更好
          const ctrlPoints = getControlPoints(activeAnno); // 🌟 使用新引擎生成所有物理控制点
          
          const hit = ctrlPoints.find(p => Math.hypot(mainX - p.x, mainY - p.y) < hitRadius);

          if (hit) {
            // 🎯 命中！
            setDragVertex({ index: hit.id, type: hit.type as any });
            setCursorStyle(CURSOR_DRAG); // 🌟 立刻变为“实心”拖拽光标
            setTempActiveAnno(JSON.parse(JSON.stringify(activeAnno)));
            return;
          }
        }
      }

      // --- 以下为你原有的 Select 选中逻辑，保持不变 ---
      let clickedId = null;
      for (let i = currentAnnotations.length - 1; i >= 0; i--) {
        const ann = currentAnnotations[i];
        if (ann.type === 'bbox' || ann.type === 'ellipse' || ann.type === 'circle') {
          const [p1, p2] = ann.points;
          const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
          if (mainX >= minX && mainX <= maxX && mainY >= minY && mainY <= maxY) {
            clickedId = ann.id; break;
          }
        } else if (ann.type === 'polygon' || ann.type === 'oriented_bbox' || ann.type === 'cuboid') {
          let inside = false;
          for (let j = 0, k = ann.points.length - 1; j < ann.points.length; k = j++) {
            const xi = ann.points[j].x, yi = ann.points[j].y;
            const xj = ann.points[k].x, yj = ann.points[k].y;
            const intersect = ((yi > mainY) !== (yj > mainY)) && (mainX < (xj - xi) * (mainY - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          if (inside) { clickedId = ann.id; break; }
        } else if (ann.type === 'line') {
          let hit = false;
          for (let j = 0; j < ann.points.length - 1; j++) {
            const p1 = ann.points[j], p2 = ann.points[j+1];
            const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
            let t = l2 === 0 ? 0 : ((mainX - p1.x) * (p2.x - p1.x) + (mainY - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t)); // 限制在线段端点内
            const projX = p1.x + t * (p2.x - p1.x);
            const projY = p1.y + t * (p2.y - p1.y);
            if (Math.hypot(mainX - projX, mainY - projY) < 6 / viewport.zoom) {
              hit = true; break;
            }
          }
          if (hit) { clickedId = ann.id; break; }
        }
        // 4. 单点 (直接计算鼠标与该点的距离)
        else if (ann.type === 'point') {
          if (ann.points.length > 0 && Math.hypot(mainX - ann.points[0].x, mainY - ann.points[0].y) < 8 / viewport.zoom) {
            clickedId = ann.id; break;
          }
        }
      }
      setActiveAnnotationId(clickedId);
      if (!clickedId) {
        setIsPanning(true);
        setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      }
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

    if (tool === 'select' && activeAnnotationId && !dragVertex) {
      const activeAnno = currentAnnotations.find((a: any) => a.id === activeAnnotationId);
      if (activeAnno) {
        const hitRadius = 8 / viewport.zoom;
        const ctrlPoints = getControlPoints(activeAnno);
        const isNearVertex = ctrlPoints.some(p => Math.hypot(mainX - p.x, mainY - p.y) < hitRadius);
        setCursorStyle(isNearVertex ? CURSOR_FOCUS : 'default'); // 靠近变空心，远离恢复箭头
      }
    } else if (!dragVertex && cursorStyle !== 'default') {
      // 保证切换到别的工具时，光标能正确恢复
      setCursorStyle('default');
    }

    // 🌟 临时拖拽更新逻辑
    // 🌟 全能拖拽更新逻辑：区分普通点和 BBox 的角点
    if (tool === 'select' && dragVertex && tempActiveAnno) {
      const updatedAnno = { ...tempActiveAnno };
      
      if (dragVertex.type === 'bbox-corner') {
        // 如果是 BBox，拖动一个角，更新对应的 P1 或 P2 坐标
        const [p1, p2] = updatedAnno.points;
        if (dragVertex.index === 0) { p1.x = mainX; p1.y = mainY; }
        else if (dragVertex.index === 1) { p2.x = mainX; p1.y = mainY; }
        else if (dragVertex.index === 2) { p2.x = mainX; p2.y = mainY; }
        else if (dragVertex.index === 3) { p1.x = mainX; p2.y = mainY; }
        updatedAnno.points = [{ ...p1 }, { ...p2 }];
      } else {
        // 多边形、线段等，直接更新数组里的这个点
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
      // 1. 更新 Zustand 数据库
      updateAnnotation(tempActiveAnno.id, { points: tempActiveAnno.points });
      // 2. 压入历史记录以支持快捷键 Ctrl+Z 撤销！
      pushAction({ type: 'edit', anno: tempActiveAnno }); 
      // 3. 清空拖拽状态
      setDragVertex(null);
      setTempActiveAnno(null);
      return;
    }

    if (isPanning) { setIsPanning(false); return; }


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
    // 1. 统一初始化默认属性
    const initialAttrs: Record<string, any> = {};
    taxonomyAttributes?.forEach((attr: any) => {
      initialAttrs[attr.name] = attr.defaultValue || (attr.options?.[0] || '');
    });
    setFormAttributes(initialAttrs);

    // 2. 统一设置待确认状态
    setPendingAnnotation({ type: annoType, points });

    // 3. 智能避让坐标计算
    const popoverW = 300; 
    const popoverH = 400; 
    const padding = 20;   
    let safeX = clientX + 15; 
    let safeY = clientY + 15;

    if (safeX + popoverW > window.innerWidth) safeX = window.innerWidth - popoverW - padding;
    if (safeY + popoverH > window.innerHeight) safeY = window.innerHeight - popoverH - padding;
    if (safeX < padding) safeX = padding;
    if (safeY < padding) safeY = padding;

    setPopoverPos({ x: safeX, y: safeY });
    setPopoverOpen(true);
  }, [taxonomyAttributes]); // 🌟 注意依赖项里加了 taxonomyAttributes

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
      
      const fullAnno = {
        id: newId,
        ...pendingAnnotation,
        label: formLabel,
        text: formText, // 🌟 对象的描述
        group_id: formGroupId ? Number(formGroupId) : null, // 🌟 确保转换为数字或 null
        track_id: formTrackId ? Number(formTrackId) : null, // 🌟 确保转换为数字或 null
        stem: currentStem,
        difficult: formDifficult,
        occluded: formOccluded,
        attributes: formAttributes // 🌟 核心修正：使用弹窗中实际修改的属性，而不是 defaultAttrs
      };

      addAnnotation(fullAnno);
      pushAction({ type: 'add', anno: fullAnno });
    // 3. 安全清理草图点位 (确保你没删掉 const [undonePoints, setUndonePoints] = useState([]))
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
    }

    if (!state.editorSettings?.continuousDrawing) {
      handleToolChange('pan'); // 使用我们之前封装的拦截器切换
    }
  };

  const stemIndex = stems.indexOf(currentStem);
  const handlePrevStem = () => {
    if (stemIndex > 0) {
      setCurrentStem(stems[stemIndex - 1]);
      setActiveAnnotationId(null);
    }
  }; 
  const handleNextStem = () => {
    if (stemIndex < stems.length - 1) {
      setCurrentStem(stems[stemIndex + 1]);
      setActiveAnnotationId(null);
    }
  };

  return (
    <div 
    className="flex h-full overflow-hidden bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 relative"
    style={{ cursor: cursorStyle }}
    >
      
      {/* 👈 Left Toolbar */}
      <LeftToolbar 
      tool={tool} setTool={handleToolChange}
      handleUndo={handleUndo} handleRedo={handleRedo} 
      // 🌟 传下去，加上 currentPoints 的长度判断（用于撤销点）
      canUndo={undoCount > 0 || currentPoints.length > 0}
      canRedo={redoCount > 0 || undonePoints.length > 0}
      handlePrevStem={handlePrevStem}
      handleNextStem={handleNextStem}
      hasPrev={stemIndex > 0}
      hasNext={stemIndex < stems.length - 1}
    />
      {/* 🎯 Grid Workspace */}
      <div className="flex-grow p-4 overflow-hidden relative" ref={containerRef} onWheel={handleWheel}>
        
        {/* 🌟 升级：多图层悬浮叠加控制器 (TopBar) */}
        {focusedViewId && views.length > 0 && (
          <div 
            // 🌟 核心修复：把 z-50 改成 z-[1001]，必须大于底下的 Canvas (1000)
            className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md p-1.5 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-700 flex items-center gap-3 animate-in slide-in-from-top-4"
            onPointerDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            <div className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Single View
            </div>
            <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700" />

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
                      return `${activeControlLayer === focusedViewId ? '✨ ' : ''}${v.isMain ? 'Main View' : `Aug View ${views.indexOf(v)}`}`;
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
                  // 🌟 核心修改：如果正在拖拽，就用 tempActiveAnno 临时替换掉原来的对象，实现丝滑渲染
                  annotations={tempActiveAnno ? currentAnnotations.map((a: any) => a.id === tempActiveAnno.id ? tempActiveAnno : a) : currentAnnotations}
                  activeAnnotationId={activeAnnotationId}
                  taxonomyClasses={taxonomyClasses}
                  currentPoints={currentPoints}
                  tool={tool}
                  theme={theme}
                  folders={folders}
                  currentStem={currentStem}
                  isPanning={isPanning}
                  mainWidth={mainWidth}
                  mainHeight={mainHeight}
                  isFullExtent={!!showFullExtent[view.id]}
                  formLabel={formLabel}
                  pendingAnnotation={pendingAnnotation}
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
                />
              </div>
            ))}
          </div>
        )}

        {/* 🎈 Floating Popover for Class Selection */}
        {/* 2. 悬浮弹窗 */}
      {popoverOpen && (
        <ClassFormPopover 
          popoverPos={popoverPos} formLabel={formLabel} setFormLabel={setFormLabel}
          formText={formText} setFormText={setFormText} formGroupId={formGroupId} 
          setFormGroupId={setFormGroupId} formTrackId={formTrackId} setFormTrackId={setFormTrackId}
          formDifficult={formDifficult} setFormDifficult={setFormDifficult}
          formOccluded={formOccluded} setFormOccluded={setFormOccluded}
          formAttributes={formAttributes} 
          setFormAttributes={setFormAttributes}
          handleCancelDrawing={handleCancelDrawing} savePendingAnnotationToStore={savePendingAnnotationToStore}
          taxonomyClasses={taxonomyClasses}
        />
      )}
      </div>
      
      {/* 👉 Right Panel */}
      <RightPanel 
      tool={tool} 
      showFullExtent={showFullExtent} toggleFullExtent={toggleFullExtent} 
      pushAction={pushAction}
      /* 🌟 新增状态透传 */
      focusedViewId={focusedViewId} setFocusedViewId={setFocusedViewId}
      layerOrder={layerOrder} setLayerOrder={setLayerOrder}
      visibleLayers={visibleLayers} setVisibleLayers={setVisibleLayers}
    />
    </div>
  );
}
