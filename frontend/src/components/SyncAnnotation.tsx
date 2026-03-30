import React, { useState, useRef, useEffect } from 'react';
import { useStore, Annotation } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

import { 
  Layers, Save, MousePointer2, Square, Hexagon, 
  Database, Image as ImageIcon, X, ChevronRight, Eye // 🌟 补充这些
} from 'lucide-react';
import { ProjectMetaDashboard } from './ProjectMetaDashboard'; // 🌟 确保路径正确

import type { ProjectMetaContract } from '../config/contract';


export function SyncAnnotation() {
  const { 
    projectName,
    views, 
    folders,
    annotations, 
    addAnnotation, 
    viewport, 
    setViewport,
    currentStem,
    stems,
    setCurrentStem
  } = useStore();
  
  const [tool, setTool] = useState<'select' | 'bbox' | 'polygon'>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number, y: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showMetaModal, setShowMetaModal] = useState(false);

  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [pendingAnnotation, setPendingAnnotation] = useState<any>(null);
  const [classLabel, setClassLabel] = useState('object');
  const [classText, setClassText] = useState('');

  // Grid layout calculation
  const gridCols = Math.ceil(Math.sqrt(Math.max(1, views.length)));
  const gridRows = Math.ceil(Math.max(1, views.length) / gridCols);

  // Filter annotations for current stem
  const currentAnnotations = annotations.filter(a => a.stem === currentStem);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? viewport.zoom * zoomFactor : viewport.zoom / zoomFactor;
    setViewport(newZoom, viewport.panX, viewport.panY);
  };

  const handleMouseDown = (e: React.MouseEvent, viewId: string) => {
    if (tool === 'select') return;
    if (popoverOpen) setPopoverOpen(false);

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

    const view = views.find(v => v.id === viewId);
    let mainX = x;
    let mainY = y;
    if (view && !view.isMain) {
      mainX = (x - view.transform.offsetX) / view.transform.scaleX;
      mainY = (y - view.transform.offsetY) / view.transform.scaleY;
    }

    if (tool === 'bbox') {
      setIsDrawing(true);
      setCurrentPoints([{ x: mainX, y: mainY }, { x: mainX, y: mainY }]);
    } else if (tool === 'polygon') {
      setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent, viewId: string) => {
    if (!isDrawing || tool !== 'bbox') return;

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

    const view = views.find(v => v.id === viewId);
    let mainX = x;
    let mainY = y;
    if (view && !view.isMain) {
      mainX = (x - view.transform.offsetX) / view.transform.scaleX;
      mainY = (y - view.transform.offsetY) / view.transform.scaleY;
    }

    setCurrentPoints([currentPoints[0], { x: mainX, y: mainY }]);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (tool === 'bbox' && isDrawing) {
      setIsDrawing(false);
      if (currentPoints.length === 2) {
        setPendingAnnotation({
          type: 'bbox',
          points: currentPoints,
        });
        setPopoverPos({ x: e.clientX, y: e.clientY });
        setPopoverOpen(true);
      }
      setCurrentPoints([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && tool === 'polygon' && currentPoints.length > 2) {
      setPendingAnnotation({
        type: 'polygon',
        points: currentPoints,
      });
      // Approximate position for popover (last point)
      const lastPoint = currentPoints[currentPoints.length - 1];
      const screenX = (lastPoint.x * viewport.zoom) + viewport.panX;
      const screenY = (lastPoint.y * viewport.zoom) + viewport.panY;
      
      setPopoverPos({ x: screenX + 300, y: screenY + 100 }); 
      setPopoverOpen(true);
      setCurrentPoints([]);
    } else if (e.key === 'Escape') {
      setCurrentPoints([]);
      setIsDrawing(false);
      setPopoverOpen(false);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPoints, tool, viewport]);

  const savePendingAnnotation = () => {
    if (pendingAnnotation && currentStem) {
      addAnnotation({
        id: Math.random().toString(36).substr(2, 9),
        ...pendingAnnotation,
        label: classLabel,
        text: classText,
        stem: currentStem
      });
      setPopoverOpen(false);
      setPendingAnnotation(null);
      setClassText('');
    }
  };

  // 修改内部的 generateProjectMeta 函数
  const generateProjectMeta = (): ProjectMetaContract => {
    return {
      projectName: projectName || "Untitled Project",
      folders: folders.map((f, i) => ({
        Id: i + 1,
        path: f.path,
        suffix: f.suffix || "", // 补充缺失字段
        "files in sceneGroups": f.metadata?.sceneGroupsLoaded || 0,
        "files Skipped": f.metadata?.sceneGroupsSkipped || 0,
        "files total": f.files ? f.files.length : 0,
        "image meta": {
          width: f.metadata?.width || 0,
          height: f.metadata?.height || 0,
          bands: f.metadata?.bands || 0,
          "data type": f.metadata?.dataType || 'uint8'
        }
      })),
      views: views.map((v, i) => {
        const fIndex = folders.findIndex(f => f.id === v.folderId);
        return {
          id: v.isMain ? 'main view' : `aug view ${i + 1}`, // 统一从 1 开始
          "folder id": fIndex >= 0 ? fIndex + 1 : 1,
          bands: v.bands,
          // 🌟 关键：接入 renderMode
          renderMode: v.bands.length === 3 ? 'rgb' : (v.colormap || 'gray'),
          isMain: v.isMain,
          transform: {
            crop: v.crop || { t: 0, r: 100, b: 100, l: 0 },
            scaleX: v.transform?.scaleX ?? 1,
            scaleY: v.transform?.scaleY ?? 1,
            offsetX: v.transform?.offsetX ?? 0,
            offsetY: v.transform?.offsetY ?? 0
          }
        };
      })
    };
  };
  return (
    <div className="flex h-full overflow-hidden bg-neutral-900 text-white relative">
      
      {/* Left Toolbar */}
      <div className="w-16 border-r border-neutral-800 flex flex-col items-center py-4 space-y-4 bg-neutral-950 shrink-0">
        <Button 
          variant={tool === 'select' ? 'default' : 'ghost'} 
          size="icon" 
          onClick={() => setTool('select')}
          title="Select / Pan"
        >
          <MousePointer2 className="w-5 h-5" />
        </Button>
        <Button 
          variant={tool === 'bbox' ? 'default' : 'ghost'} 
          size="icon" 
          onClick={() => setTool('bbox')}
          title="Bounding Box"
        >
          <Square className="w-5 h-5" />
        </Button>
        <Button 
          variant={tool === 'polygon' ? 'default' : 'ghost'} 
          size="icon" 
          onClick={() => setTool('polygon')}
          title="Polygon (Press Enter to finish)"
        >
          <Hexagon className="w-5 h-5" />
        </Button>
        <div className="flex-grow" />
        <Button variant="ghost" size="icon" title="Save to Disk">
          <Save className="w-5 h-5" />
        </Button>
      </div>

      {/* Grid Workspace */}
      <div 
        className="flex-grow p-4 overflow-hidden relative"
        ref={containerRef}
        onWheel={handleWheel}
      >
        {views.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-lg">
            No views configured. Please go to Data Preload to set up your project.
          </div>
        ) : (
          <div 
            className="w-full h-full grid gap-4"
            style={{ 
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`
            }}
          >
            {views.map((view, index) => (
              <div key={view.id} className="relative border border-neutral-800 bg-black rounded-lg overflow-hidden">
                <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-black/70 text-xs rounded text-neutral-300">
                  {view.isMain ? 'Main View' : `Aug View ${index}`}
                </div>
                <CanvasView 
                  view={view} 
                  annotations={currentAnnotations}
                  currentPoints={currentPoints}
                  tool={tool}
                  onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, view.id)}
                  onMouseMove={(e: React.MouseEvent) => handleMouseMove(e, view.id)}
                  onMouseUp={handleMouseUp}
                />
              </div>
            ))}
          </div>
        )}

        {/* Floating Popover for Class Selection */}
        {popoverOpen && (
          <div 
            className="absolute z-50 bg-card text-card-foreground border shadow-lg rounded-lg p-4 w-64 space-y-4"
            style={{ left: Math.min(popoverPos.x, window.innerWidth - 300), top: Math.min(popoverPos.y, window.innerHeight - 200) }}
          >
            <h4 className="font-semibold text-sm">Annotation Details</h4>
            <div className="space-y-2">
              <Label className="text-xs">Class Label</Label>
              <Input 
                value={classLabel} 
                onChange={(e) => setClassLabel(e.target.value)} 
                placeholder="e.g. car, building"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Additional Text (Optional)</Label>
              <Input 
                value={classText} 
                onChange={(e) => setClassText(e.target.value)} 
                placeholder="Notes..."
                onKeyDown={(e) => e.key === 'Enter' && savePendingAnnotation()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPopoverOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={savePendingAnnotation}>Save</Button>
            </div>
          </div>
        )}
      </div>
      
{/* Right Panel: Project Meta, Layers, Labels, Scene Groups */}
      <div className="w-80 border-l border-neutral-800 bg-neutral-950 flex flex-col shrink-0 overflow-hidden">
        
        {/* 🌟 1. 精简的 Project Meta 行 (点击打开窗口) */}
        <div 
          onClick={() => setShowMetaModal(true)}
          className="p-3 border-b border-neutral-800 hover:bg-neutral-800/50 cursor-pointer transition-all group flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 group-hover:text-blue-400">
              Project Meta
            </span>
          </div>
          
          {/* 仅显示主视图关联的数量信息 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-neutral-400 group-hover:border-blue-500/30 transition-colors">
              <span className="text-blue-400 font-bold">{folders.length}</span>
              <span className="opacity-50 text-[9px]">FOLDERS</span>
              <div className="w-[1px] h-2 bg-neutral-700 mx-0.5" />
              <span className="text-emerald-400 font-bold">{views.length}</span>
              <span className="opacity-50 text-[9px]">VIEWS</span>
            </div>
            <ChevronRight className="w-3 h-3 text-neutral-600 group-hover:text-blue-400 transition-colors" />
          </div>
        </div>

        {/* 🌟 2. View Layers (图层管理区) */}
        <div className="p-4 border-b border-neutral-800 shrink-0">
          <h3 className="font-semibold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2 mb-3">
            <Layers className="w-3.5 h-3.5" /> View Layers
          </h3>
          <div className="space-y-1.5">
            {views.map((v, idx) => (
              <div key={v.id} className="flex items-center justify-between bg-neutral-900/50 p-2 rounded border border-neutral-800/50 text-[11px] hover:bg-neutral-900 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${v.isMain ? 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]' : 'bg-emerald-500'}`} />
                  <span className={v.isMain ? "text-blue-400 font-bold" : "text-neutral-300"}>
                    {v.isMain ? "Main View" : `Aug View ${idx}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-neutral-600 uppercase">
                    {v.bands.length === 3 ? 'RGB' : v.colormap}
                  </span>
                  <button className="text-neutral-600 hover:text-blue-400 transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 🌟 3. Labels (标注对象列表) */}
        <div className="flex-grow flex flex-col border-b border-neutral-800 overflow-hidden min-h-[150px]">
          <div className="p-4 pb-2 flex items-center justify-between">
            <h3 className="font-semibold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
              <Square className="w-3.5 h-3.5" /> Objects ({currentAnnotations.length})
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 pt-0 space-y-1 custom-scrollbar">
            {currentAnnotations.length === 0 ? (
              <div className="text-[10px] text-neutral-700 text-center py-8 italic">No objects in this scene</div>
            ) : (
              currentAnnotations.map((ann) => (
                <div key={ann.id} className="group p-2 bg-neutral-900/30 rounded border border-neutral-800/50 text-[11px] flex items-center justify-between hover:border-blue-500/30 hover:bg-neutral-900 cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm bg-blue-500/50" />
                    <span className="font-medium text-neutral-300">{ann.label}</span>
                  </div>
                  <span className="text-[9px] text-neutral-600 font-mono group-hover:text-blue-400">{ann.type}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 🌟 4. Scene Groups (切片列表) */}
        <div className="h-1/3 flex flex-col overflow-hidden bg-black/20">
          <div className="p-4 pb-2">
            <h3 className="font-semibold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> Scenes
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 pt-0 space-y-1 custom-scrollbar">
            {stems.map((stem) => (
              <button
                key={stem}
                onClick={() => setCurrentStem(stem)}
                className={`w-full text-left px-3 py-1.5 text-[11px] rounded transition-all flex items-center justify-between group ${
                  currentStem === stem 
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[inset_0_0_10px_rgba(59,130,246,0.05)]' 
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 border border-transparent'
                }`}
              >
                <span className="font-mono truncate">{stem}</span>
                {currentStem === stem && <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    {/* 🌟 4. Project Meta Modal - 放在最外层容器内，确保 z-index 生效 */}
    {/* 在 SyncAnnotation.tsx 底部 */}
    {showMetaModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-10">
        {/* 🌟 这是一个干净的容器，专门承载你的 Dashboard 组件 */}
        <div className="relative w-full max-w-6xl h-full bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
          
          {/* 统一的头部，带有关闭按钮 */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950 shrink-0">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              <span className="font-bold uppercase tracking-widest text-sm">Project Metadata Control</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowMetaModal(false)} className="hover:bg-white/10">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* 🌟 直接放入组件：它会自动填充剩余空间并处理内部滚动 */}
          <div className="flex-1 overflow-hidden">
            <ProjectMetaDashboard />
          </div>
        </div>
      </div>
    )}
    </div> // 🌟 这是整个 SyncAnnotation 的最后一个闭合标签
  );
}


function CanvasView({ view, annotations, currentPoints, tool, onMouseDown, onMouseMove, onMouseUp }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport } = useStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match container
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply Viewport
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Apply View Transform (if Aug View)
    if (!view.isMain) {
      ctx.translate(view.transform.offsetX, view.transform.offsetY);
      ctx.scale(view.transform.scaleX, view.transform.scaleY);
    }

    // Draw Mock Image Data
    ctx.fillStyle = view.isMain ? '#333' : 'rgba(255,100,100,0.2)';
    ctx.fillRect(100, 100, 400, 400);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1 / viewport.zoom;
    ctx.strokeRect(100, 100, 400, 400);

    // Draw Annotations
    annotations.forEach((ann: Annotation) => {
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2 / viewport.zoom;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';

      if (ann.type === 'bbox' && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);
        
        // Draw label
        ctx.fillStyle = '#0f0';
        ctx.font = `${12 / viewport.zoom}px Arial`;
        ctx.fillText(ann.label, x, y - 4 / viewport.zoom);
      } else if (ann.type === 'polygon' && ann.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        
        // Draw label
        ctx.fillStyle = '#0f0';
        ctx.font = `${12 / viewport.zoom}px Arial`;
        ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 4 / viewport.zoom);
      }
    });

    // Draw Current Drawing
    if (currentPoints.length > 0) {
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2 / viewport.zoom;
      
      if (tool === 'bbox' && currentPoints.length === 2) {
        const [p1, p2] = currentPoints;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
      } else if (tool === 'polygon') {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.stroke();
        
        // Draw points
        ctx.fillStyle = '#ff0';
        currentPoints.forEach((p: any) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 / viewport.zoom, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    ctx.restore();
  }, [viewport, view, annotations, currentPoints, tool]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
