// src/components/annotation/LeftToolbar.tsx
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { 
  Hand, Square, Hexagon, Circle, CircleDot, Wand2, Scissors, Eraser, 
  MoreHorizontal, ChevronLeft, ChevronRight, Box, RotateCw, Activity, 
  Pencil, Cloud, MousePointer2, Undo2, Redo2, Columns2, Diamond, Home
} from 'lucide-react';
import { useStore } from '../../../store/useStore';

interface LeftToolbarProps {
  tool: string;
  setTool: (tool: any) => void;
  onHomeClick: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handlePrevStem: () => void;
  handleNextStem: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function LeftToolbar({ 
  tool, setTool, onHomeClick, handleUndo, handleRedo, canUndo, canRedo,
  handlePrevStem, handleNextStem, hasPrev, hasNext 
}: LeftToolbarProps) {
  
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { shortcuts, editorSettings } = useStore() as any; 

  const getLabel = (name: string, id: string) => {
    if (!shortcuts[id]) return name;
    let key = shortcuts[id].toUpperCase();
    if (key === 'ARROWLEFT') key = '←';
    if (key === 'ARROWRIGHT') key = '→';
    if (id === 'undo') return `${name} (Ctrl+${key})`;
    if (id === 'redo') return `${name} (Ctrl+${key})`;
    return `${name} (${key})`;
  };

  const navTools = [
    { id: 'pan', icon: Hand, label: getLabel('Pan', 'pan') },
    { id: 'home', icon: Home, label: getLabel('Home', 'home'), action: onHomeClick },
    { id: 'prev', icon: ChevronLeft, label: getLabel('Prev', 'prev'), action: handlePrevStem, disabled: !hasPrev },
    { id: 'next', icon: ChevronRight, label: getLabel('Next', 'next'), action: handleNextStem, disabled: !hasNext },
  ];

  // 🌟 核心修改：去掉 ai_anno 的自定义 action，让它像普通绘图工具一样
  const mainDrawTools = [
    { id: 'bbox', icon: Square, label: 'BBox (R)' },
    { id: 'polygon', icon: Hexagon, label: 'Polygon (P)' },
    { id: 'ai_anno', icon: Wand2, label: 'AI Auto' } 
  ];

  const moreTools = [
    { id: 'rbbox', icon: Diamond, label: 'Rotated Box' },
    { id: 'cuboid', icon: Box, label: '3D Cuboid' },
    { id: 'ellipse', icon: Circle, label: 'Ellipse (O)', className: "scale-y-[0.7]" },
    { id: 'circle', icon: Circle, label: 'Circle (C)' },
    { id: 'freemask', icon: Cloud, label: 'FreeMask' },
    { id: 'separator', type: 'separator' },
    { id: 'point', icon: CircleDot, label: 'Point (T)' },
    { id: 'line', icon: Activity, label: 'Line (L)' },
    { id: 'lasso', icon: Pencil, label: 'Lasso (F)' },
  ];

  const editTools = [
    { id: 'select', icon: MousePointer2, label: getLabel('Select', 'select') },
    { id: 'cut', icon: Columns2, label: getLabel('Cut', 'cut') },
    { id: 'cutout', icon: Eraser, label: getLabel('Cutout', 'cutout') },
    { id: 'undo', icon: Undo2, label: getLabel('Undo', 'undo'), action: handleUndo, disabled: !canUndo },
    { id: 'redo', icon: Redo2, label: getLabel('Redo', 'redo'), action: handleRedo, disabled: !canRedo },
  ];

  const renderToolButton = (t: any) => {
    // 🌟 isActive 判断自然生效：tool === 'ai_anno' 时就会高亮！
    const isActive = tool === t.id && !t.action; 
    
    const buttonClass = editorSettings?.showToolLabels 
      ? 'h-auto py-2 w-14 flex-col gap-1.5' 
      : 'h-9 w-9';

    return (
      <Button
        key={t.id}
        variant="ghost"
        disabled={t.disabled}
        onClick={t.action ? t.action : () => setTool(t.id)} 
        className={`transition-all duration-200 ${buttonClass} ${
          isActive 
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' 
            : t.disabled
              ? 'opacity-30 cursor-not-allowed'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
        }`}
        title={t.label} 
      >
        <t.icon className={editorSettings?.showToolLabels ? "w-4 h-4" : "w-5 h-5"} />
        {editorSettings?.showToolLabels && (
          <span className="text-[9px] font-medium leading-tight text-center break-words w-full px-0.5">
            {t.label}
          </span>
        )}
      </Button>
    );
  };

  return (
    <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex flex-col items-center py-4 space-y-2 z-10 shrink-0 shadow-sm relative h-full overflow-y-auto custom-scrollbar">
      {navTools.map(renderToolButton)}
      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
      {mainDrawTools.map(renderToolButton)}
      <div className="flex flex-col items-center w-full">
        <Button 
          variant="ghost" 
          className={`h-9 w-9 ${isMoreOpen || moreTools.some(t => t.id === tool) ? 'bg-blue-100 text-blue-600' : 'text-neutral-500'}`}
          onClick={() => setIsMoreOpen(!isMoreOpen)}
        >
          <MoreHorizontal className="w-5 h-5" />
        </Button>
        {isMoreOpen && (
          <div className="mt-2 py-2 flex flex-col items-center space-y-2 bg-neutral-100 dark:bg-black/30 rounded-lg border border-neutral-200 dark:border-neutral-800 animate-in slide-in-from-top-1 w-full px-1">
            {moreTools.map(t => t.type === 'separator' ? <div key={t.id} className="w-8 h-px bg-neutral-300 dark:bg-neutral-700 my-1" /> : renderToolButton(t))}
          </div>
        )}
      </div>
      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
      {editTools.map(renderToolButton)}
    </div>
  );
}