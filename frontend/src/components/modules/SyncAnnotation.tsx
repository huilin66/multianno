import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Annotation } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { UI_THEMES } from '../../config/colors';
import { 
  Layers, Save, MousePointer2, Square, Hexagon, 
  Database, Image as ImageIcon, X, ChevronRight, Eye, AlertTriangle, 
  Cloud, CloudCog, CloudLightning, Trash2, Maximize, Crop,
  Hand, CircleDot, Pencil, Activity, Circle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// 🌟 尝试引入后端保存接口 (如果文件不存在，后续只需创建即可)
import { saveAnnotation, getPreviewImageUrl } from '../../api/client';

export function SyncAnnotation() {
  const { t } = useTranslation();
  
  // 🌟 安全解构：使用 default value 防止 useStore 还没有彻底更新导致报错
  const state = useStore();
  const {
    projectName, views, folders, annotations, addAnnotation, updateAnnotation, removeAnnotation,
    viewport, setViewport, currentStem, stems, setCurrentStem, theme, setActiveModule,
    taxonomyClasses = [{ id: 'default', name: 'object', color: '#3B82F6' }], // 兜底默认值
    taxonomyAttributes = [],
    activeAnnotationId = null,
    setActiveAnnotationId = () => {} // 兜底空函数
  } = state as any; // 使用 as any 兼容可能还未完全写入 AppState 的新字段
  
  type ToolType = 'select' | 'pan' | 'bbox' | 'polygon' | 'point' | 'line' | 'ellipse' |'circle' | 'lasso';
  const [tool, setTool] = useState<ToolType>('select');
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

  // 🌟 自动保存状态
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');

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
  // 🚀 1. 核心网络请求：静默防抖保存
  // ==========================================
  useEffect(() => {
    if (!currentStem || currentAnnotations.length === 0) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const mainViewFolder = folders.find((f: any) => f.id === views.find((v: any) => v.isMain)?.folderId);
        

        // 组装标准 Scene JSON 数据格式
        const payload = {
          version: "1.0.0",
          flags: {},
          stem: currentStem,
          projectName: projectName || 'Untitled Project',
          imageDescription: "",
          imageNameMain: `${currentStem}${mainViewFolder?.suffix || '.tif'}`,
          imageHeight: mainViewFolder?.metadata?.height || 1024,
          imageWidth: mainViewFolder?.metadata?.width || 1024,
          shapes: currentAnnotations.map((ann: any) => ({
            label: ann.label,
            text: ann.text || "",
            points: ann.points.map((p: any) => [p.x, p.y]), 
            group_id: null,
            shape_type: (() => {
                if (ann.type === 'bbox') return 'rectangle';
                if (ann.type === 'point') return 'point';
                if (ann.type === 'line') return 'linestrip';
                if (ann.type === 'ellipse') return 'ellipse';
                if (ann.type === 'circle') return 'circle';
                if (ann.type === 'lasso') return 'lasso';
                return 'polygon';
              })(),
            flags: {},
            attributes: ann.attributes || {},
            difficult: ann.difficult || false
          }))
        };

        const saveDir = mainViewFolder?.path || '';
        const fileName = `${currentStem}.json`;

        // 调用后端接口
        if (typeof saveAnnotation === 'function') {
           await saveAnnotation({ save_dir: saveDir, file_name: fileName, content: payload });
        }
        setSaveStatus('idle');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 1000); // 1秒防抖时间

    return () => clearTimeout(timer);
  }, [currentAnnotations, currentStem, projectName, folders, views]);


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

const handleMouseDown = (e: React.MouseEvent, viewId: string) => {
    // 1. 🌟 第一步：先把坐标算出来！(因为选择工具也要用坐标来判断有没有点中东西)
    if (popoverOpen) setPopoverOpen(false);
    
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom;
    const view = views.find((v: any) => v.id === viewId);
    let mainX = x, mainY = y;
    if (view && !view.isMain) {
      mainX = (x - view.transform.offsetX) / view.transform.scaleX;
      mainY = (y - view.transform.offsetY) / view.transform.scaleY;
    }

    // 2. 🌟 第二步：处理 Select (选择) 工具的精准碰撞检测
    if (e.button === 0 && tool === 'select') {
      let clickedId = null;
      // 倒序遍历，保证点中视觉上最上层的标注
      for (let i = currentAnnotations.length - 1; i >= 0; i--) {
        const ann = currentAnnotations[i];
        if (ann.type === 'bbox' || ann.type === 'ellipse' || ann.type === 'circle') {
          // 矩形/圆/椭圆的碰撞判断：只要在最小x和最大x之间就行
          const [p1, p2] = ann.points;
          const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
          if (mainX >= minX && mainX <= maxX && mainY >= minY && mainY <= maxY) {
            clickedId = ann.id; break;
          }
        } else if (ann.type === 'polygon') {
          // 多边形碰撞判断：射线法
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
      
      // 如果没点中任何东西，直接把鼠标当成漫游拖拽
      if (!clickedId) {
        setIsPanning(true);
        setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      }
      return; // 选择工具处理完毕，强制返回
    }

    // 3. 🌟 处理强制漫游 (按了鼠标中键 或 明确选了 Pan 工具)
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: viewport.panX, panY: viewport.panY });
      return;
    }

    // 4. 🌟 处理所有画图工具的起手式 (注意加上了 circle)
    if (tool === 'bbox' || tool === 'ellipse' || tool === 'circle') {
      setIsDrawing(true);
      setCurrentPoints([{ x: mainX, y: mainY }, { x: mainX, y: mainY }]);
    } else if (tool === 'polygon' || tool === 'line') {
      setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
    } else if (tool === 'lasso') {
      setIsDrawing(true);
      setCurrentPoints([{ x: mainX, y: mainY }]);
    } else if (tool === 'point') {
      setPendingAnnotation({ type: 'point', points: [{ x: mainX, y: mainY }] });
      setPopoverPos({ x: e.clientX, y: e.clientY });
      setPopoverOpen(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent, viewId: string) => {
    if (isPanning) {
      const dx = e.clientX - panStart.mouseX;
      const dy = e.clientY - panStart.mouseY;
      setViewport(viewport.zoom, panStart.panX + dx, panStart.panY + dy);
      return;
    }
    if (!isDrawing) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom;
    const view = views.find((v: any) => v.id === viewId);
    let mainX = x, mainY = y;
    if (view && !view.isMain) {
      mainX = (x - view.transform.offsetX) / view.transform.scaleX;
      mainY = (y - view.transform.offsetY) / view.transform.scaleY;
    }

    if (tool === 'bbox' || tool === 'ellipse'|| tool === 'circle') {
      setCurrentPoints([currentPoints[0], { x: mainX, y: mainY }]);
    } else if (tool === 'lasso') {
      const lastP = currentPoints[currentPoints.length - 1];
      const dist = Math.hypot(mainX - lastP.x, mainY - lastP.y);
      if (dist * viewport.zoom > 5) {
        setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }
    if (!isDrawing) return;

    // 🌟 修改点 1：只有“一次性拖拽”工具才在这里结束绘制状态并清空点
    if (tool === 'bbox' || tool === 'ellipse' || tool === 'circle' || tool === 'lasso') {
      setIsDrawing(false); // 结束绘制状态

      const isShape = tool === 'bbox' || tool === 'ellipse' || tool === 'circle';
      
      if (isShape) {
        const [p1, p2] = currentPoints;
        const screenW = Math.abs(p2.x - p1.x) * viewport.zoom;
        const screenH = Math.abs(p2.y - p1.y) * viewport.zoom;
        
        // 防误触：宽或高大于 5 像素才有效
        if (screenW > 5 || screenH > 5) {
          setPendingAnnotation({ type: tool, points: currentPoints });
          setPopoverPos({ x: e.clientX, y: e.clientY });
          setPopoverOpen(true);
        }
      } else if (tool === 'lasso' && currentPoints.length > 5) {
        // 套索工具
        setPendingAnnotation({ type: 'polygon', points: currentPoints });
        setPopoverPos({ x: e.clientX, y: e.clientY });
        setPopoverOpen(true);
      }
      
      setCurrentPoints([]); // 清空临时点
    }
    
    // 🌟 注意：polygon 和 line 的 setIsDrawing(false) 应该在 handleDoubleClick 中处理
    // 所以这里不做任何处理，保证连续点击有效
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
    
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeAnnotationId) {
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
      setCurrentPoints([]);
      setIsDrawing(false);
      setPopoverOpen(false);
      setActiveAnnotationId(null);
    }
  }, [currentPoints, tool, viewport, activeAnnotationId, removeAnnotation, setActiveAnnotationId]);
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
      addAnnotation({
        id: newId,
        ...pendingAnnotation,
        label: formLabel,
        text: formText,
        stem: currentStem,
        difficult: formDifficult,
        attributes: defaultAttrs
      });
      
      setPopoverOpen(false);
      setPendingAnnotation(null);
      setFormText('');
      setFormDifficult(false);
      setActiveAnnotationId(newId);
      setTool('select');
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 relative">
      
      {/* 👈 Left Toolbar */}
      {/* <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 flex flex-col items-center py-4 space-y-4 bg-neutral-50 dark:bg-neutral-950 shrink-0 z-10">
        <Button variant={tool === 'select' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('select')} title={t('workspace.toolSelect')}>
          <MousePointer2 className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'bbox' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('bbox')} title={t('workspace.toolBbox')}>
          <Square className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'polygon' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('polygon')} title={t('workspace.toolPolygon')}>
          <Hexagon className="w-5 h-5" />
        </Button>
      </div> */}
      <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 flex flex-col items-center py-4 space-y-2 bg-neutral-50 dark:bg-neutral-950 shrink-0 z-10 overflow-y-auto custom-scrollbar">
        <Button variant={tool === 'select' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('select')} title="Select (V)">
          <MousePointer2 className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'pan' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('pan')} title="Pan (H)">
          <Hand className="w-5 h-5" />
        </Button>
        <div className="w-8 h-[1px] bg-neutral-300 dark:bg-neutral-700 my-2" />
        <Button variant={tool === 'bbox' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('bbox')} title="Bounding Box (R)">
          <Square className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'polygon' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('polygon')} title="Polygon (P)">
          <Hexagon className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'ellipse' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('ellipse')} title="Ellipse (O)">
          {/* 用 CSS 压扁一个圆来表示椭圆 */}
          <Circle className="w-5 h-5 scale-y-75" />
        </Button>
        <Button variant={tool === 'circle' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('circle')} title="Circle (C)">
          <Circle className="w-5 h-5" />
        </Button>
        <div className="w-8 h-[1px] bg-neutral-300 dark:bg-neutral-700 my-2" />
        <Button variant={tool === 'point' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('point')} title="Point (T)">
          <CircleDot className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'line' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('line')} title="Polyline (L)">
          <Activity className="w-5 h-5" />
        </Button>
        <Button variant={tool === 'lasso' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('lasso')} title="Freehand Lasso (F)">
          <Pencil className="w-5 h-5" />
        </Button>
      </div>
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
                  onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, view.id)}
                  onMouseMove={(e: React.MouseEvent) => handleMouseMove(e, view.id)}
                  onMouseUp={handleMouseUp}
                />
              </div>
            ))}
          </div>
        )}

        {/* 🎈 Floating Popover for Class Selection */}
        {popoverOpen && (
          <div 
            className="absolute z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl rounded-lg p-3 w-64 animate-in zoom-in-95 duration-200"
            style={{ left: Math.min(popoverPos.x, window.innerWidth - 300), top: Math.min(popoverPos.y, window.innerHeight - 200) }}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] text-neutral-500 uppercase font-bold">{t('workspace.classLabel')}</Label>
                <Select value={formLabel} onValueChange={setFormLabel}>
                  <SelectTrigger className="h-8 mt-1 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taxonomyClasses.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/30">
                <Label className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1 cursor-pointer">
                  <AlertTriangle className="w-3.5 h-3.5" /> {t('workspace.difficult')}
                </Label>
                <Switch checked={formDifficult} onCheckedChange={setFormDifficult} />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPopoverOpen(false)}>{t('common.cancel')}</Button>
                <Button size="sm" className="h-7 text-xs bg-primary" onClick={savePendingAnnotationToStore}>{t('workspace.saveObject')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* 👉 Right Panel */}
      <div className="w-80 border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-col shrink-0 overflow-hidden shadow-xl z-10">
        
        {/* 1. Project Meta */}
        <div onClick={() => setActiveModule('meta')} className="p-3 border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 cursor-pointer transition-all group flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 group-hover:text-blue-500">
              {t('workspace.projectMeta')}
            </span>
          </div>
          
          {/* 🌟 补回你丢失的精美数据药丸标签 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[10px] font-mono text-neutral-500 dark:text-neutral-400 group-hover:border-blue-500/30 transition-colors shadow-sm">
              <span className="text-blue-500 font-bold">{folders?.length || 0}</span>
              <span className="opacity-60 text-[9px] uppercase tracking-wider">{t('workspace.folders', 'Folders')}</span>
              <div className="w-[1px] h-2.5 bg-neutral-300 dark:bg-neutral-700 mx-0.5" />
              <span className="text-emerald-500 font-bold">{views?.length || 0}</span>
              <span className="opacity-60 text-[9px] uppercase tracking-wider">{t('workspace.views', 'Views')}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </div>

        {/* 2. View Layers (图层管理区) - 极致压缩高度 */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <h3 className="font-semibold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2 mb-2">
            <Layers className="w-3.5 h-3.5" /> {t('workspace.viewLayers', 'View Layers')}
          </h3>
          <div className="space-y-1">
            {views.map((v: any, idx: number) => (
              <div key={v.id} className="flex items-center justify-between bg-white dark:bg-neutral-900/50 p-1.5 rounded border border-neutral-200 dark:border-neutral-800/50 text-[10px]">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${v.isMain ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                  <span className={v.isMain ? "text-blue-500 font-bold" : "text-neutral-500 dark:text-neutral-300"}>
                    {v.isMain ? 'Main View' : `Aug View ${idx}`}
                  </span>
                </div>
                
                {/* 🌟 新增：右侧控制按钮区 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-neutral-400 uppercase mr-1">
                    {v.bands?.length === 3 ? 'RGB' : (v.colormap || 'GRAY')}
                  </span>
                  
                  {/* 全景切换按钮 (主视图不需要该按钮，因为主视图本身就是基准) */}
                  {!v.isMain && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFullExtent(v.id); }}
                      title={showFullExtent[v.id] ? "Crop to Main View" : "Show Full Extent"}
                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                        showFullExtent[v.id] 
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' 
                          : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                      }`}
                    >
                      {showFullExtent[v.id] ? <Crop className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                    </button>
                  )}
                  
                  {/* 保留的小眼睛图标 */}
                  <button className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 🌟 3. Active Object Editor (动态属性编辑器) */}
        <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-blue-50/50 dark:bg-blue-900/10 transition-all">
          <div className="p-3 pb-2 flex items-center justify-between border-b border-neutral-200/50 dark:border-neutral-800/50">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {t('workspace.editorTitle')}
            </h3>
          </div>
          
          <div className="p-3 space-y-3 min-h-[100px]">
            {activeAnnotationId ? (() => {
              const activeAnno = annotations.find((a: any) => a.id === activeAnnotationId);
              if (!activeAnno) return <div className="text-xs text-neutral-500">{t('workspace.notFound')}</div>;
              
              return (
                <div className="space-y-3 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-neutral-500">{t('workspace.label')}</Label>
                      <Select 
                        value={activeAnno.label} 
                        onValueChange={(val) => updateAnnotation(activeAnno.id, { label: val })}
                      >
                        <SelectTrigger className="h-7 text-xs bg-white dark:bg-neutral-900"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {taxonomyClasses.map((c: any) => <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-neutral-500">{t('workspace.note')}</Label>
                      <Input 
                        value={activeAnno.text || ''} 
                        onChange={(e) => updateAnnotation(activeAnno.id, { text: e.target.value })} 
                        className="h-7 text-xs bg-white dark:bg-neutral-900" 
                        placeholder="Optional..."
                      />
                    </div>
                  </div>

                  {/* 动态 Attributes 渲染 */}
                  {taxonomyAttributes && taxonomyAttributes.length > 0 && (
                    <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800">
                      <Label className="text-[10px] text-neutral-500 mb-2 block uppercase tracking-wider">{t('workspace.attributes')}</Label>
                      <div className="space-y-2.5">
                        {taxonomyAttributes.map((attr: any) => (
                          <div key={attr.id} className="flex items-center justify-between">
                            <span className="text-xs text-neutral-700 dark:text-neutral-300">{attr.name}</span>
                            {attr.type === 'boolean' ? (
                              <Switch 
                                checked={activeAnno.attributes?.[attr.name] as boolean || false}
                                onCheckedChange={(val) => updateAnnotation(activeAnno.id, { 
                                  attributes: { ...(activeAnno.attributes || {}), [attr.name]: val } 
                                })}
                              />
                            ) : (
                              <Input 
                                value={activeAnno.attributes?.[attr.name] as string || ''}
                                onChange={(e) => updateAnnotation(activeAnno.id, { 
                                  attributes: { ...(activeAnno.attributes || {}), [attr.name]: e.target.value } 
                                })}
                                className="w-24 h-6 text-xs bg-white dark:bg-neutral-950"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="text-center py-4 text-[11px] text-neutral-400 dark:text-neutral-600 italic">
                {t('workspace.unselected')}
              </div>
            )}
          </div>
        </div>

        {/* 4. Objects List */}
        <div className="flex-grow flex flex-col border-b border-neutral-200 dark:border-neutral-800 overflow-hidden min-h-[120px]">
          <div className="p-3 pb-2 flex items-center justify-between shrink-0 bg-neutral-100 dark:bg-neutral-900/50">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
              <Square className="w-3.5 h-3.5" /> {t('workspace.objects')} ({currentAnnotations.length})
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 pt-0 space-y-1 custom-scrollbar">
            {currentAnnotations.map((ann: any) => {
              const clsDef = taxonomyClasses.find((c: any) => c.name === ann.label);
              const color = clsDef?.color || '#3B82F6';
              const isActive = ann.id === activeAnnotationId;
              
              return (
                <div 
                  key={ann.id} 
                  onClick={() => setActiveAnnotationId(ann.id)}
                  className={`group p-2 rounded border text-[11px] flex items-center justify-between cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-700 dark:text-blue-400 shadow-sm' 
                      : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="font-medium">
                      {ann.label} {ann.difficult && <AlertTriangle className="w-3 h-3 inline text-red-500"/>}
                    </span>
                  </div>

                  {/* 🌟 核心修改：删除按钮 */}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    // 使用 group-hover 实现鼠标悬放时才显示，保持界面简洁
                    className="w-6 h-6 opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    onClick={(e) => { 
                      e.stopPropagation(); // 🔴 必须阻止冒泡，否则点击删除也会触发上面的选中逻辑
                      removeAnnotation(ann.id); 
                      if(isActive) setActiveAnnotationId(null); 
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Scene Groups */}
        <div className="h-[20%] flex flex-col overflow-hidden bg-neutral-100 dark:bg-black/20 shrink-0">
          <div className="p-3 pb-2 shrink-0">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> {t('workspace.scenegroup')}
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 pt-0 space-y-1 custom-scrollbar">
            {stems.map((stem: string) => (
              <button
                key={stem}
                onClick={() => {
                  setCurrentStem(stem);
                  setActiveAnnotationId(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-[11px] rounded transition-all flex items-center justify-between group ${
                  currentStem === stem 
                    ? 'bg-blue-600 text-white shadow-md font-bold' 
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="font-mono truncate">{stem}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
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
  const { viewport } = useStore();
  
  // 🌟 1. 新增：存储当前视图加载完毕的图片对象
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // 🌟 2. 新增：异步加载真实图片逻辑
  useEffect(() => {
    if (!currentStem || !folders) return;
    const folder = folders.find((f: any) => f.id === view.folderId);
    if (!folder) return;

    // 拼接文件名 (例如: DJI_0001.tif)
    const fileName = `${currentStem}${folder.suffix || '.tif'}`;
    
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

  // 🌟 3. 主渲染逻辑
  // 2. 修改渲染主逻辑 useEffect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = UI_THEMES[theme as 'dark' | 'light'] || UI_THEMES.dark;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // =====================================
    // 🌟 画布坐标系变换与【遮罩裁剪】核心逻辑
    // =====================================
    ctx.save(); // [Save 1] 保存初始状态
    
    // 1. 应用视口平移与缩放 (进入 Main View 世界坐标系)
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);

    // 2. 执行裁剪 (如果未开启全景，且是辅视图)
    if (!isFullExtent && !view.isMain) {
      ctx.beginPath();
      ctx.rect(0, 0, mainWidth, mainHeight);
      ctx.clip(); 
    }

    // =====================================
    // 🌟 绘制真实图片 (进入 Aug View 局部坐标系)
    // =====================================
    ctx.save(); // [Save 2] 保存主视图坐标系状态

    // 应用辅助视图自身的配准偏移 (Transform)
    if (!view.isMain) {
      ctx.translate(view.transform.offsetX, view.transform.offsetY);
      ctx.scale(view.transform.scaleX, view.transform.scaleY || view.transform.scaleX);
    }

    if (imageObj) {
      ctx.drawImage(imageObj, 0, 0);

      // 图片真实的物理边界框 (跟图片走)
      ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 2 / viewport.zoom; 
      ctx.strokeRect(0, 0, imageObj.width, imageObj.height);
    } else {
      ctx.fillStyle = view.isMain ? colors.canvasMainBg : colors.canvasAugBg;
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.fillStyle = colors.annoDoneText;
      ctx.font = `${14 / viewport.zoom}px Arial`;
      ctx.fillText("Loading Image...", 20 / viewport.zoom, 30 / viewport.zoom);
    }

    ctx.restore(); // [Restore 2] 恢复到主视图世界坐标系！(关键点)

    // =====================================
    // 🌟 绘制全景模式下的“裁剪参考框” (Crop Boundary)
    // =====================================
    if (isFullExtent && !view.isMain && imageObj) {
      // 使用醒目的黄色/橙色虚线，标示主视图的有效范围
      ctx.strokeStyle = theme === 'dark' ? 'rgba(250, 204, 21, 0.8)' : 'rgba(234, 88, 12, 0.8)'; // Tailwind Yellow-400 / Orange-600
      ctx.lineWidth = 2 / viewport.zoom;
      // 开启虚线模式 (线长5px，间距5px，随缩放动态调整)
      ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
      
      // 在主坐标系下绘制参考框
      ctx.strokeRect(0, 0, mainWidth, mainHeight);
      
      // 绘制一个半透明遮罩，让主视图范围外的地方稍微变暗，突出焦点
      ctx.fillStyle = theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.rect(-99999, -99999, 199998, 199998); // 覆盖整个宇宙
      ctx.rect(0, 0, mainWidth, mainHeight);     // 挖空主视图区域 (利用奇偶填充规则)
      ctx.fill('evenodd');

      // 必须重置虚线，否则后面的标注框也会变成虚线！
      ctx.setLineDash([]); 
    }
    // =====================================
    // 绘制标注 (这部分完全保留你原来的逻辑)
    // =====================================
    annotations.forEach((ann: any) => {
      const clsDef = taxonomyClasses?.find((c: any) => c.name === ann.label);
      const baseColor = clsDef?.color || colors.annoDoneStroke;
      const isActive = ann.id === activeAnnotationId;
      
      // 选中状态颜色加深加粗
      ctx.strokeStyle = isActive ? '#FFFFFF' : baseColor;
      ctx.lineWidth = (isActive ? 4 : 2) / viewport.zoom;
      
      // 填充透明度
      ctx.fillStyle = isActive ? `${baseColor}60` : `${baseColor}30`; 

      if (ann.type === 'bbox' && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);
        
        ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
        ctx.font = `bold ${14 / viewport.zoom}px Arial`;
        ctx.fillText(ann.label, x, y - 6 / viewport.zoom);
      } else if (ann.type === 'polygon' && ann.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        
        ctx.fillStyle = isActive ? '#FFFFFF' : baseColor;
        ctx.font = `bold ${14 / viewport.zoom}px Arial`;
        ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 6 / viewport.zoom);
      } else if (ann.type === 'line' && ann.points.length > 0) {
        ctx.beginPath(); ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
        ctx.stroke();
        ctx.fillStyle = isActive ? '#FFFFFF' : baseColor; ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 6 / viewport.zoom);
      // 🌟 同时支持椭圆和正圆的正式渲染
      } else if ((ann.type === 'ellipse' || ann.type === 'circle') && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        
        ctx.beginPath();
        if (ann.type === 'circle') {
          const radius = Math.max(w, h) / 2;
          ctx.arc(x + w/2, y + h/2, radius, 0, Math.PI * 2);
        } else {
          ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
        }
        ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = isActive ? '#FFFFFF' : baseColor; 
        ctx.font = `bold ${14 / viewport.zoom}px Arial`; 
        ctx.fillText(ann.label, x, y - 6 / viewport.zoom);
      } else if (ann.type === 'point' && ann.points.length > 0) {
        const p = ann.points[0];
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 / viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#FFFFFF' : baseColor; ctx.fill(); ctx.stroke();
        ctx.font = `bold ${14 / viewport.zoom}px Arial`; ctx.fillText(ann.label, p.x + 8 / viewport.zoom, p.y - 8 / viewport.zoom);
      }
    });

// =====================================
    // 🌟 绘制中的过程状态 (带动态颜色掩膜)
    // =====================================
    // 获取当前准备打标的颜色
    const activeClassDef = taxonomyClasses?.find((c: any) => c.name === formLabel);
    const activeColor = activeClassDef?.color || '#3B82F6';

    if (currentPoints.length > 0) {
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = `${activeColor}40`; // 🌟 动态颜色的 25% 半透明掩膜
      ctx.lineWidth = 2 / viewport.zoom;
      
      if (tool === 'bbox' && currentPoints.length === 2) {
        const [p1, p2] = currentPoints;
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h); ctx.fillRect(x, y, w, h); // 🌟 加了 fillRect
      } else if (tool === 'ellipse' && currentPoints.length === 2) {
        const [p1, p2] = currentPoints;
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2); 
        ctx.fill(); ctx.stroke(); // 🌟 加了 fill
      } else if (tool === 'circle' && currentPoints.length === 2) {
        const [p1, p2] = currentPoints;
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        const radius = Math.max(w, h) / 2; // 正圆取长边的一半为半径
        ctx.beginPath(); ctx.arc(x + w/2, y + h/2, radius, 0, Math.PI * 2); 
        ctx.fill(); ctx.stroke();
      } else if (tool === 'polygon' || tool === 'line' || tool === 'lasso') {
        ctx.beginPath(); ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        if (tool === 'polygon') {
          ctx.closePath();
          ctx.fill(); // 🌟 多边形画图过程也加入掩膜
        }
        ctx.stroke();
        
        if (tool !== 'lasso') {
          ctx.fillStyle = activeColor; // 顶点原点颜色也同步
          currentPoints.forEach((p: any) => {
            ctx.beginPath(); ctx.arc(p.x, p.y, 4 / viewport.zoom, 0, Math.PI * 2); ctx.fill();
          });
        }
      }
    }

    // =====================================
    // 🌟 绘制 Pending (待确认) 虚线状态
    // =====================================
    if (pendingAnnotation) {
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = `${activeColor}40`; 
      ctx.lineWidth = 2 / viewport.zoom;
      ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]); // 🌟 开启虚线

      if (pendingAnnotation.type === 'bbox' || pendingAnnotation.type === 'ellipse' || pendingAnnotation.type === 'circle') {
        const [p1, p2] = pendingAnnotation.points;
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        
        if (pendingAnnotation.type === 'bbox') {
          ctx.strokeRect(x, y, w, h); ctx.fillRect(x, y, w, h);
        } else if (pendingAnnotation.type === 'ellipse') {
          ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (pendingAnnotation.type === 'circle') {
          const radius = Math.max(w, h) / 2;
          ctx.beginPath(); ctx.arc(x + w/2, y + h/2, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      } else if (pendingAnnotation.type === 'polygon') {
        ctx.beginPath(); ctx.moveTo(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y);
        for (let i = 1; i < pendingAnnotation.points.length; i++) ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (pendingAnnotation.type === 'line') {
        ctx.beginPath(); ctx.moveTo(pendingAnnotation.points[0].x, pendingAnnotation.points[0].y);
        for (let i = 1; i < pendingAnnotation.points.length; i++) ctx.lineTo(pendingAnnotation.points[i].x, pendingAnnotation.points[i].y);
        ctx.stroke();
      }
      ctx.setLineDash([]); // 🌟 恢复实线
    }

    ctx.restore();
  }, [viewport, view, annotations, activeAnnotationId, currentPoints, tool, taxonomyClasses, imageObj, isFullExtent, 
    mainWidth, 
    mainHeight]); // 🌟 别忘了把 imageObj 加进依赖数组

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${
        isPanning || tool === 'pan' ? 'cursor-grab' :
        tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
      onMouseLeave={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}