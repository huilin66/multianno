import React, { useState, useRef, useEffect } from 'react';
import { useStore, Annotation } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';


import { 
  Layers, Save, MousePointer2, Square, Hexagon, Database, Image as ImageIcon,
} from 'lucide-react';


export function SyncAnnotation() {
  const { 
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

  // 【必须确保这个函数在这里：在 SyncAnnotation 的大括号内部，return 的上方】
  // 这样它才能读取到上面的 folders 和 views 变量！
  const generateProjectMeta = () => {
    return {
      folders: folders.map((f, i) => {
        return {
          Id: i + 1,
          path: f.path,
          "files in sceneGroups": f.metadata?.sceneGroupsLoaded || 0,
          "files Skipped": f.metadata?.sceneGroupsSkipped || 0,
          "files total": f.files ? f.files.length : 0,
          "image meta": {
            width: f.metadata?.width || 'Unknown',
            height: f.metadata?.height || 'Unknown',
            bands: f.metadata?.bands || 'Unknown',
            "data type": f.metadata?.fileType || 'uint8'
          }
        };
      }),
      views: views.map((v, i) => {
        const fIndex = folders.findIndex(f => f.id === v.folderId);
        return {
          id: v.isMain ? 'main view' : `aug view ${i}`, 
          "folder id": fIndex >= 0 ? fIndex + 1 : 'Unknown',
          bands: v.bands,
          isMain: v.isMain,
          transform: v.transform || { crop: { t: 0, r: 100, b: 100, l: 0 }, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
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
      
      {/* Right Panel: Project Meta, Labels, Scene Groups */}
      <div className="w-72 border-l border-neutral-800 bg-neutral-950 flex flex-col shrink-0">
        
      {/* Top: Project Meta */}
        <div className="p-4 border-b border-neutral-800 space-y-3">
          
          {/* 重点修复：使用 flex 和 justify-between 将标题和 View JSON 按钮并排显示 */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-neutral-300 flex items-center gap-2">
              <Database className="w-4 h-4" /> Project Meta
            </h3>

          <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <span className="block text-neutral-500 mb-1">Folders</span>
              <span className="font-mono text-neutral-200">{folders.length}</span>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <span className="block text-neutral-500 mb-1">Views</span>
              <span className="font-mono text-neutral-200">{views.length}</span>
            </div>
          </div>
        </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <span className="block text-neutral-500 mb-1">Folders</span>
              <span className="font-mono text-neutral-200">{folders.length}</span>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <span className="block text-neutral-500 mb-1">Views</span>
              <span className="font-mono text-neutral-200">{views.length}</span>
            </div>
          </div>
        </div>

        {/* Middle: Label Info */}
        <div className="flex-grow flex flex-col border-b border-neutral-800 overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="font-semibold text-sm text-neutral-300 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Labels ({currentAnnotations.length})
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 space-y-2">
            {currentAnnotations.length === 0 ? (
              <div className="text-xs text-neutral-600 text-center py-4">No labels in this scene</div>
            ) : (
              currentAnnotations.map((ann, i) => (
                <div key={ann.id} className="p-2 bg-neutral-900 rounded border border-neutral-800 text-sm flex flex-col gap-1 hover:border-primary/50 cursor-pointer transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-neutral-200">{ann.label}</span>
                    <span className="text-[10px] text-neutral-500 uppercase bg-neutral-950 px-1.5 py-0.5 rounded">{ann.type}</span>
                  </div>
                  {ann.text && <span className="text-xs text-neutral-400 truncate">{ann.text}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom: Scene Group Stem List */}
        <div className="h-1/3 flex flex-col overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="font-semibold text-sm text-neutral-300 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Scene Groups
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 space-y-1">
            {stems.length === 0 ? (
              <div className="text-xs text-neutral-600 text-center py-4">No scenes loaded</div>
            ) : (
              stems.map((stem) => (
                <button
                  key={stem}
                  onClick={() => setCurrentStem(stem)}
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    currentStem === stem 
                      ? 'bg-primary/20 text-primary border border-primary/30' 
                      : 'text-neutral-400 hover:bg-neutral-900 border border-transparent'
                  }`}
                >
                  <span className="font-mono">{stem}</span>
                </button>
              ))
            )}
          </div>
        </div>

      </div>
    // </div>
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
