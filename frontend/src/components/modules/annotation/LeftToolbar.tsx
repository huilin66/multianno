// src/components/annotation/LeftToolbar.tsx
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { 
  Hand, Square, Hexagon, Circle, CircleDot, Wand2, Scissors, Eraser, 
  MoreHorizontal, ChevronLeft, ChevronRight, Box, RotateCw, Activity, 
  Pencil, Cloud, MousePointer2, Undo2, Redo2, Columns2, Diamond
} from 'lucide-react';
import { useStore } from '../../../store/useStore';

interface LeftToolbarProps {
  tool: string;
  setTool: (tool: any) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // 🌟 新增导航 Props
  handlePrevStem: () => void;
  handleNextStem: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function LeftToolbar({ 
  tool, setTool, handleUndo, handleRedo, canUndo, canRedo,
  handlePrevStem, handleNextStem, hasPrev, hasNext 
}: LeftToolbarProps) {
  
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { shortcuts } = useStore() as any; // 🌟 引入快捷键字典

  // 🌟 辅助函数：动态生成提示文字
  const getLabel = (name: string, id: string) => {
    return shortcuts[id] ? `${name} (${shortcuts[id].toUpperCase()})` : name;
  };
  
  // === 1. 核心展示的 4 个绘图按钮 ===
  const mainDrawTools = [
    { id: 'bbox', icon: Square, label: 'BBox (R)' },
    { id: 'polygon', icon: Hexagon, label: 'Polygon (P)' },
    { id: 'ai_anno', icon: Wand2, label: 'AI Auto' }
  ];

  // === 2. 收纳进抽屉的“更多”绘图工具 ===
  const moreTools = [
    { id: 'rbbox', icon: Diamond, label: 'Rotated Box' },
    { id: 'cuboid', icon: Box, label: '3D Cuboid' },
    // 🌟 修正：椭圆图标使用 Circle + 缩放，避免使用“三个点”
    { id: 'ellipse', icon: Circle, label: 'Ellipse (O)', className: "scale-y-[0.7]" },
    { id: 'circle', icon: Circle, label: 'Circle (C)' },
    { id: 'freemask', icon: Cloud, label: 'FreeMask' },
    { id: 'point', icon: CircleDot, label: 'Point (T)' },
    { id: 'line', icon: Activity, label: 'Line (L)' },
    { id: 'lasso', icon: Pencil, label: 'Lasso (F)' },
  ];

  // === 3. 编辑工具 (含修正后的 Cut) ===
  const editTools = [
    { id: 'select', icon: MousePointer2, label: 'Select & Edit (V)' },
    // 🌟 修正：Cut 图标使用 Columns2，符合“长方形中间竖线”的描述
    { id: 'cut', icon: Columns2, label: 'Cut (Split)' },
    { id: 'cutout', icon: Eraser, label: 'Cutout (Erase)' },
  ];

  const renderToolButton = (t: any) => (
    <Button 
      key={t.id}
      variant={tool === t.id ? 'default' : 'ghost'} 
      size="icon" 
      onClick={() => setTool(t.id)} 
      title={t.label}
      className={`${tool === t.id ? 'bg-blue-600 text-white' : 'text-neutral-500'} h-9 w-9`}
    >
      <t.icon className={`w-5 h-5 ${t.className || ''}`} />
    </Button>
  );

  return (
    <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 flex flex-col items-center py-4 space-y-2 bg-neutral-50 dark:bg-neutral-950 shrink-0 z-10 overflow-y-auto custom-scrollbar">
            {/* ✋ 漫游工具 */}
      <Button variant={tool === 'pan' ? 'default' : 'ghost'} size="icon" onClick={() => setTool('pan')} className={tool === 'pan' ? 'bg-blue-600 text-white' : 'text-neutral-500'}>
        <Hand className="w-5 h-5" />
      </Button>

      {/* 🚀 第一组：数据翻页导航 (上一组/下一组) */}
      <div className="flex flex-col gap-1 items-center justify-center w-full mb-1 mt-1">
        <Button 
          variant="ghost" 
          size="icon" 
          disabled={!hasPrev} 
          onClick={handlePrevStem}
          title="Previous Image Group"
          // 🌟 高亮逻辑：不可用时透明，可用时呈现蓝色
          className={`h-7 w-7 transition-colors ${
            !hasPrev 
              ? 'opacity-20 cursor-not-allowed' 
              : 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
          }`}
        >
          <ChevronLeft className="w-5 h-5 -ml-0.5" /> {/* -ml-0.5 稍微修正一下视觉居中 */}
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon" 
          disabled={!hasNext} 
          onClick={handleNextStem}
          title="Next Image Group"
          className={`h-7 w-7 transition-colors ${
            !hasNext 
              ? 'opacity-20 cursor-not-allowed' 
              : 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
          }`}
        >
          <ChevronRight className="w-5 h-5 -mr-0.5" /> {/* -mr-0.5 稍微修正一下视觉居中 */}
        </Button>
      </div>

      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />

      
      {/* 🎨 核心绘图 4 按钮 (3个核心 + 1个抽屉开关) */}
      {mainDrawTools.map(renderToolButton)}

      <div className="flex flex-col items-center w-full">
        <Button 
          variant="ghost" size="icon" 
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`h-9 w-9 transition-colors ${isMoreOpen || moreTools.some(t => t.id === tool) ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600' : 'text-neutral-500'}`}
        >
          <MoreHorizontal className="w-5 h-5" />
        </Button>

        {/* 🌟 更多工具抽屉 (Drawer) */}
        {isMoreOpen && (
          <div className="mt-2 py-2 flex flex-col items-center space-y-2 bg-neutral-200/50 dark:bg-black/30 rounded-lg border border-neutral-200 dark:border-neutral-800 animate-in slide-in-from-top-1 fade-in duration-200 shadow-inner">
            {moreTools.map(renderToolButton)}
          </div>
        )}
      </div>

      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
      
      {/* 🛠️ 编辑工具 */}
      {editTools.map(renderToolButton)}

      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />

      {/* ↩️ 撤销/重做 */}
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="icon" onClick={handleUndo} disabled={!canUndo} className={!canUndo ? "opacity-20" : "text-neutral-500"}>
          <Undo2 className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRedo} disabled={!canRedo} className={!canRedo ? "opacity-20" : "text-neutral-500"}>
          <Redo2 className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}