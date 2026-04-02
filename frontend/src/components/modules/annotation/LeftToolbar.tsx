import React from 'react';
import { Button } from '../../ui/button';
import { 
  Hand, Square, Hexagon, Circle, CircleDot, 
  Activity, Pencil, Cloud, MousePointer2, Undo2, Redo2 
} from 'lucide-react';

interface LeftToolbarProps {
  tool: string;
  setTool: (tool: any) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function LeftToolbar({ tool, setTool, handleUndo, handleRedo, canUndo, canRedo, }: LeftToolbarProps) {
  return (
    <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 flex flex-col items-center py-4 space-y-2 bg-neutral-50 dark:bg-neutral-950 shrink-0 z-10 overflow-y-auto custom-scrollbar">
      {/* 1. 默认工具 */}
      <Button variant={tool === 'pan' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('pan')} title="Pan (H)">
        <Hand className="w-5 h-5" />
      </Button>
      <div className="w-8 h-[1px] bg-neutral-300 dark:bg-neutral-700 my-2" />
      
      {/* 2. 绘制工具 */}
      <Button variant={tool === 'bbox' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('bbox')} title="Bounding Box (R)">
        <Square className="w-5 h-5" />
      </Button>
      <Button variant={tool === 'polygon' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('polygon')} title="Polygon (P)">
        <Hexagon className="w-5 h-5" />
      </Button>
      <Button variant={tool === 'ellipse' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('ellipse')} title="Ellipse (O)">
        <Circle className="w-5 h-5 scale-y-75" />
      </Button>
      <Button variant={tool === 'circle' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('circle')} title="Circle (C)">
        <Circle className="w-5 h-5" />
      </Button>
      <Button variant={tool === 'point' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('point')} title="Point (T)">
        <CircleDot className="w-5 h-5" />
      </Button>
      <Button variant={tool === 'line' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('line')} title="Polyline (L)">
        <Activity className="w-5 h-5" />
      </Button>
      {/* 🌟 拆分出的自由线 */}
      <Button variant={tool === 'lasso' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('lasso')} title="Freehand Line">
        <Pencil className="w-5 h-5" />
      </Button>
      {/* 🌟 拆分出的自由 Mask */}
      <Button variant={tool === 'freemask' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('freemask')} title="Freehand Mask">
        <Cloud className="w-5 h-5" />
      </Button>
      
      <div className="w-8 h-[1px] bg-neutral-300 dark:bg-neutral-700 my-2" />
      
      {/* 🌟 3. 编辑与撤销工具组：把 Select 移到这里 */}
      <Button variant={tool === 'select' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('select')} title="Select & Edit (V)">
        <MousePointer2 className="w-5 h-5" />
      </Button>
      {/* 🌟 撤销按钮：增加 disabled 和动态颜色 */}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleUndo} 
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={!canUndo ? "opacity-30 cursor-not-allowed" : ""}
      >
        <Undo2 className={`w-5 h-5 ${canUndo ? "text-neutral-700 dark:text-neutral-200" : "text-neutral-400"}`} />
      </Button>

      {/* 🌟 重做按钮：增加 disabled 和动态颜色 */}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleRedo} 
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className={!canRedo ? "opacity-30 cursor-not-allowed" : ""}
      >
        <Redo2 className={`w-5 h-5 ${canRedo ? "text-neutral-700 dark:text-neutral-200" : "text-neutral-400"}`} />
      </Button>

      <div className="w-8 h-[1px] bg-neutral-300 dark:bg-neutral-700 my-2" />
    </div>
  );
}