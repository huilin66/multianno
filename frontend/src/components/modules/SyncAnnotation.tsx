import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Annotation } from '../../store/useStore';

import {  Image as ImageIcon,
  Cloud, CloudCog, CloudLightning, 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClassFormPopover } from './annotation/ClassFormPopover';
import { LeftToolbar } from './annotation/LeftToolbar';
import { RightPanel } from './annotation/RightPanel';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useActionHistory } from '../../hooks/useActionHistory';
import { renderCanvasScene } from '../../lib/canvasRenderer'; // 注意相对路径
// 🌟 尝试引入后端保存接口 (如果文件不存在，后续只需创建即可)
import { getPreviewImageUrl } from '../../api/client';




export function SyncAnnotation() {
  const { t } = useTranslation();
  const { saveStatus } = useAutoSave();
  const { pushAction, performGlobalUndo, performGlobalRedo, undoCount, redoCount } = useActionHistory();
  // 🌟 安全解构：使用 default value 防止 useStore 还没有彻底更新导致报错
  const state = useStore();
  const {
    views, folders, annotations, addAnnotation, removeAnnotation,
    viewport, setViewport, currentStem,  theme,
    taxonomyClasses = [{ id: 'default', name: 'object', color: '#3B82F6' }], // 兜底默认值
    taxonomyAttributes = [],
    activeAnnotationId = null,
    setActiveAnnotationId = () => {} // 兜底空函数
  } = state as any; // 使用 as any 兼容可能还未完全写入 AppState 的新字段
  
  type ToolType = 'select' | 'pan' | 'bbox' | 'polygon' | 'point' | 'line' | 'ellipse' | 'circle' | 'lasso' | 'freemask';
  const [tool, setTool] = useState<ToolType>('pan');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number, y: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

// 🌟 新增：漫游 (Pan) 状态记录
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [pendingAnnotation, setPendingAnnotation] = useState<any>(null);
  
  // 🌟 表单状态升级为绑定 Taxonomy
  const [formLabel, setFormLabel] = useState(taxonomyClasses[0]?.name || 'object');
  const [formText, setFormText] = useState('');
  const [formDifficult, setFormDifficult] = useState(false);
  const [formGroupId, setFormGroupId] = useState(''); 
  const [formTrackId, setFormTrackId] = useState('');
  // 🌟 自动保存状态
  // const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  // ==========================
  // 🌟 新增：全局撤销与重做历史栈 (Action History)
  // ==========================
  type Action = { type: 'add' | 'delete', anno: any };
  // const [actionHistory, setActionHistory] = useState<Action[]>([]);
  // const [redoHistory, setRedoHistory] = useState<Action[]>([]);
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

  const gridCols = Math.ceil(Math.sqrt(Math.max(1, views.length)));
  const gridRows = Math.ceil(Math.max(1, views.length) / gridCols);
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

// 🌟 将这个函数完整替换，注意参数里连 viewId 都不要了
  const handleMouseDown = (e: React.MouseEvent) => {
    if (popoverOpen) setPopoverOpen(false);
    
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    // 🌟 核心：直接获取纯正的 Main View 坐标，绝对不要区分辅视图！
    const mainX = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const mainY = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

    // 1. Select 工具精准碰撞检测
    if (e.button === 0 && tool === 'select') {
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
        } else if (ann.type === 'polygon') {
          let inside = false;
          for (let j = 0, k = ann.points.length - 1; j < ann.points.length; k = j++) {
            const xi = ann.points[j].x, yi = ann.points[j].y;
            const xj = ann.points[k].x, yj = ann.points[k].y;
            const intersect = ((yi > mainY) !== (yj > mainY)) && (mainX < (xj - xi) * (mainY - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          if (inside) { clickedId = ann.id; break; }
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
            setPendingAnnotation({ type: tool, points: [p1, { x: mainX, y: mainY }] });
            setPopoverPos({ x: e.clientX, y: e.clientY });
            setPopoverOpen(true);
          }
        }
        setCurrentPoints([]); // 清空草图
      }
    } else if (tool === 'polygon' || tool === 'line') {
      setIsDrawing(true); // 🌟 极其关键：激活绘制状态，否则撤销逻辑无法捕获
      setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
      setUndonePoints([]); // 只要点下了新点，就清空重做栈，断开之前的未来
    } else if (tool === 'lasso'|| tool === 'freemask') {
      setIsDrawing(true);
      setCurrentPoints([{ x: mainX, y: mainY }]);
      setUndonePoints([]); // 顺手清空重做栈
    } else if (tool === 'point') {
      setPendingAnnotation({ type: 'point', points: [{ x: mainX, y: mainY }] });
      setPopoverPos({ x: e.clientX, y: e.clientY });
      setPopoverOpen(true);
    }
  };

// 🌟 将这个函数完整替换，同样不需要 viewId
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.mouseX;
      const dy = e.clientY - panStart.mouseY;
      setViewport(viewport.zoom, panStart.panX + dx, panStart.panY + dy);
      return;
    }

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    // 🌟 核心：永远只获取纯正的主视图坐标系
    const mainX = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const mainY = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

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
    if (isPanning) { setIsPanning(false); return; }
    
    // 🌟 在这套体系下，只有 Lasso, freemask 是靠“松开鼠标”来结束绘制的
    if ((tool === 'lasso' || tool === 'freemask') && isDrawing) {
      setIsDrawing(false);
      if (currentPoints.length > 5) {
        // 🌟 核心修复：如果是 lasso 则保存为线(line)，freemask 存为多边形(polygon)
        const saveType = tool === 'lasso' ? 'line' : 'polygon';
        setPendingAnnotation({ type: saveType, points: currentPoints });
        setPopoverPos({ x: e.clientX, y: e.clientY });
        setPopoverOpen(true);
      }
      setCurrentPoints([]); 
    }
    // 注意：bbox 等工具的结束移交给了 handleMouseDown 的第二次点击
    // Polygon 等工具的结束移交给了 handleDoubleClick / Enter 键
  };

// 🌟 新增：双击完成多边形/多段线
  const handleDoubleClick = (e: React.MouseEvent) => {
    // 只有在绘制多边形或线段，且有点的情况下才触发
    if ((tool === 'polygon' || tool === 'line') && currentPoints.length > 1) {
      e.preventDefault();
      e.stopPropagation();

      // 如果点数太少（比如多边形少于3个点），则不触发保存
      if (tool === 'polygon' && currentPoints.length < 3) return;

      setPendingAnnotation({ type: tool, points: currentPoints });
      setPopoverPos({ x: e.clientX, y: e.clientY });
      setPopoverOpen(true);
      
      // 清空状态
      setCurrentPoints([]);
      setIsDrawing(false);
    }
  };

// 🌟 核心 1：彻底清理当前正在绘制/待确认的所有状态
const handleCancelDrawing = useCallback(() => {
    setPopoverOpen(false);
    setPendingAnnotation(null);
    setCurrentPoints([]);
    setIsDrawing(false);
    setFormText('');
    setFormGroupId('');
    setFormTrackId('');
    setFormDifficult(false);
    setUndonePoints([]); // 取消绘制时清空点的重做栈
    setTool('pan');
  }, []);

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
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'h' || e.key === 'H') setTool('pan');
    if (e.key === 'r' || e.key === 'R') setTool('bbox');
    if (e.key === 'p' || e.key === 'P') setTool('polygon');
    if (e.key === 'o' || e.key === 'O') setTool('ellipse');
    if (e.key === 'c' || e.key === 'C') setTool('circle');
    if (e.key === 't' || e.key === 'T') setTool('point');
    if (e.key === 'l' || e.key === 'L') setTool('line');
    if (e.key === 'f' || e.key === 'F') setTool('lasso');
    
    // 🌟 新增：Ctrl+Z 或 Cmd+Z 触发撤销
    // 🌟 全新重做快捷键 (支持 Ctrl+Y 或 Ctrl+Shift+Z)
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault();
      handleRedo();
      return;
    }
    
    // 🌟 全新撤销快捷键 (Ctrl+Z，屏蔽 Shift 防止冲突)
    if (isCtrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // 🌟 拦截删除键：将被删除的对象压入历史栈，从而支持“撤销删除”！
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeAnnotationId) {
      const targetAnno = currentAnnotations.find(a => a.id === activeAnnotationId);
      if (targetAnno) {
        pushAction({ type: 'delete', anno: targetAnno }); // 🌟 使用 Hook 提供的方法
      }
      removeAnnotation(activeAnnotationId);
      setActiveAnnotationId(null);
    }
    if (e.key === 'Enter' && (tool === 'polygon' || tool === 'line') && currentPoints.length > 1) {
      if (tool === 'polygon' && currentPoints.length < 3) return;
      setPendingAnnotation({ type: tool, points: currentPoints });
      const lastPoint = currentPoints[currentPoints.length - 1];
      const screenX = (lastPoint.x * viewport.zoom) + viewport.panX;
      const screenY = (lastPoint.y * viewport.zoom) + viewport.panY;
      setPopoverPos({ x: screenX + 100, y: screenY + 50 }); 
      setPopoverOpen(true);
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
      const defaultAttrs: Record<string, any> = {};
      taxonomyAttributes?.forEach((attr: any) => {
        if (attr.applyToAll) defaultAttrs[attr.name] = attr.type === 'boolean' ? false : '';
      });

      const newId = `anno_${Math.random().toString(36).substr(2, 9)}`;
      const fullAnno = {
      id: newId,
      ...pendingAnnotation,
      label: formLabel,
      text: formText,
      group_id: formGroupId || null,
      track_id: formTrackId ? Number(formTrackId) : null,
      stem: currentStem,
      difficult: formDifficult,
      attributes: defaultAttrs
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
      setFormGroupId('');
      setFormTrackId('');
      setActiveAnnotationId(newId);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 relative">
      
      {/* 👈 Left Toolbar */}
      <LeftToolbar 
      tool={tool} setTool={setTool} 
      handleUndo={handleUndo} handleRedo={handleRedo} 
      // 🌟 传下去，加上 currentPoints 的长度判断（用于撤销点）
      canUndo={undoCount > 0 || currentPoints.length > 0}
      canRedo={redoCount > 0 || undonePoints.length > 0}
    />
      {/* 🎯 Grid Workspace */}
      <div className="flex-grow p-4 overflow-hidden relative" ref={containerRef} onWheel={handleWheel}>
        
        {/* 🌟 顶部状态云图标 */}
        <div className="absolute top-6 right-6 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-black/90 backdrop-blur border border-neutral-200 dark:border-neutral-800 shadow-sm text-xs font-medium transition-colors">
          {saveStatus === 'idle' && <><Cloud className="w-4 h-4 text-green-500" /> {t('workspace.autoSaved')}</>}
          {saveStatus === 'saving' && <><CloudCog className="w-4 h-4 text-blue-500 animate-spin" /> {t('workspace.saving')}</>}
          {saveStatus === 'error' && <><CloudLightning className="w-4 h-4 text-red-500" /> {t('workspace.saveError')}</>}
        </div>

        {views.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg">
            {t('workspace.noViews')}
          </div>
        ) : (
          <div className="w-full h-full grid gap-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))` }}>
            {views.map((view: any, index: number) => (
              <div key={view.id} className="relative border border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-black rounded-lg overflow-hidden transition-colors duration-300">
                <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-black/70 text-xs rounded text-neutral-300">
                  {view.isMain ? t('workspace.mainView') : `${t('workspace.augView')} ${index}`}
                </div>
                <CanvasView 
                  view={view} 
                  annotations={currentAnnotations}
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
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
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
    />
    </div>
  );
}

// ---------------------------------------------------------
// 🌟 Canvas 渲染组件 (无损升级高亮和颜色)
// ---------------------------------------------------------
function CanvasView({ 
  view, annotations, activeAnnotationId, taxonomyClasses, currentPoints, 
  tool, theme, folders, currentStem, isPanning,// 🌟 确保父组件传了 folders 和 currentStem 进来
  mainWidth, mainHeight, isFullExtent,
  onMouseDown, onMouseMove, onMouseUp,
  formLabel, pendingAnnotation, onDoubleClick,
}: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport, sceneGroups } = useStore();
  
  // 🌟 1. 新增：存储当前视图加载完毕的图片对象
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // 🌟 2. 新增：异步加载真实图片逻辑
  useEffect(() => {
    if (!currentStem || !folders) return;
    const folder = folders.find((f: any) => f.id === view.folderId);
    if (!folder) return;

    // 🌟 2. 核心大换血：直接去字典里拿真实文件名，绝不猜测！
    // 如果万一没拿到（兜底），才退化为拼接
    const exactFileName = sceneGroups?.[currentStem]?.[folder.path];
    const fileName = exactFileName || `${currentStem}${folder.suffix || '.tif'}`;
    
    // 拼接后端请求 URL
    const url = getPreviewImageUrl(folder.path, fileName, view.bands, view.colormap);

    const img = new Image();
    img.crossOrigin = 'anonymous'; // 必须加，防止 Canvas 跨域污染报错
    img.src = url;
    
    img.onload = () => {
      setImageObj(img);
    };
    
    img.onerror = () => {
      console.warn(`Failed to load image for view ${view.id}: ${url}`);
      setImageObj(null);
    };
  }, [view.folderId, view.bands, view.colormap, currentStem, folders, view.id]);

// 🌟 现在的 Canvas 渲染主逻辑：极致精简！
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 直接调用渲染引擎
    renderCanvasScene({
      canvas, ctx, view, viewport, isFullExtent, mainWidth, mainHeight, 
      imageObj, theme, annotations, activeAnnotationId, taxonomyClasses, 
      currentPoints, tool, formLabel, pendingAnnotation
    });
    
  }, [
    viewport, view, annotations, activeAnnotationId, currentPoints, 
    tool, taxonomyClasses, imageObj, isFullExtent, mainWidth, mainHeight, 
    theme, formLabel, pendingAnnotation
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${
        isPanning ? 'cursor-grabbing' : 
        tool === 'pan' ? 'cursor-default' :
        tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
      }`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
      onMouseLeave={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}