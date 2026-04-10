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
  const { shortcuts, editorSettings } = useStore() as any; // 🌟 引入快捷键字典

  // 🌟 辅助函数：动态生成提示文字
  const getLabel = (name: string, id: string) => {
  if (!shortcuts[id]) return name;
  let key = shortcuts[id].toUpperCase();
  
  // 特殊处理特殊按键的显示名称
  if (key === 'ARROWLEFT') key = '←';
  if (key === 'ARROWRIGHT') key = '→';
  if (id === 'undo') return `${name} (Ctrl+${key})`;
  if (id === 'redo') return `${name} (Ctrl+${key})`;
  
  return `${name} (${key})`;
};
  const navTools = [
    { id: 'pan', icon: Hand, label: getLabel('Pan', 'pan') },
    { id: 'prev', icon: ChevronLeft, label: getLabel('Prev', 'prev'), action: handlePrevStem, disabled: !hasPrev },
    { id: 'next', icon: ChevronRight, label: getLabel('Next', 'next'), action: handleNextStem, disabled: !hasNext },
  ];
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
    { id: 'ellipse', icon: Circle, label: 'Ellipse (O)', className: "scale-y-[0.7]" },
    { id: 'circle', icon: Circle, label: 'Circle (C)' },
    { id: 'freemask', icon: Cloud, label: 'FreeMask' },
    { id: 'separator', type: 'separator' },
    { id: 'point', icon: CircleDot, label: 'Point (T)' },
    { id: 'line', icon: Activity, label: 'Line (L)' },
    { id: 'lasso', icon: Pencil, label: 'Lasso (F)' },
  ];

  // === 3. 编辑工具 (含修正后的 Cut) ===
  const editTools = [
    { id: 'select', icon: MousePointer2, label: getLabel('Select', 'select') },
    { id: 'cut', icon: Columns2, label: getLabel('Cut', 'cut') },
    { id: 'cutout', icon: Eraser, label: getLabel('Cutout', 'cutout') },
    { id: 'undo', icon: Undo2, label: getLabel('Undo', 'undo'), action: handleUndo, disabled: !canUndo },
    { id: 'redo', icon: Redo2, label: getLabel('Redo', 'redo'), action: handleRedo, disabled: !canRedo },
  ];

// 🌟 升级：支持普通工具与动作按钮 (action) 的统一渲染
  const renderToolButton = (t: any) => {
    // 如果是点击触发动作的按钮（如撤销/重做/翻页），不应该有 isActive 的高亮状态
    const isActive = tool === t.id && !t.action; 
    
    // 如果开启了显示文字，加宽按钮并改变排列方式
    const buttonClass = editorSettings?.showToolLabels 
      ? 'h-auto py-2 w-14 flex-col gap-1.5' 
      : 'h-9 w-9';

    return (
      <Button
        key={t.id}
        variant="ghost"
        disabled={t.disabled} // 支持禁用状态
        onClick={t.action ? t.action : () => setTool(t.id)} // 自动区分是设工具还是执行动作
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
    <div className="w-16 border-r ... flex flex-col items-center py-4 space-y-2 ...">
      
      {/* 🧭 分组 1: 导航与漫游 */}
      {navTools.map(renderToolButton)}

      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />

      {/* 🎨 分组 2: 核心绘图 */}
      {mainDrawTools.map(renderToolButton)}

      {/* 📦 分组 3: 更多工具抽屉 */}
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
            {moreTools.map(t => t.type === 'separator' ? (
              <div key={t.id} className="w-8 h-px bg-neutral-300 dark:bg-neutral-700 my-1" />
            ) : renderToolButton(t))}
          </div>
        )}
      </div>

      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />

      {/* 🛠️ 分组 4: 编辑工具与历史记录 */}
      {editTools.map(renderToolButton)}
    </div>
  );
}