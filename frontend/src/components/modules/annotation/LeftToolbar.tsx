// src/components/annotation/LeftToolbar.tsx
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { 
  Hand, Square, Hexagon, Circle, CircleDot, Wand2, Eraser, Trash2,
  MoreHorizontal, ChevronLeft, ChevronRight, Box, Activity, Ban, Save,
  Pencil, Cloud, MousePointer2, Undo2, Redo2, Columns2, Diamond, Home,
  Copy, ClipboardPaste
} from 'lucide-react';
import { useStore } from '../../../store/useStore';
import { KEY_LABELS } from '../settings/ShortcutSettingsModal';
import { useTranslation } from 'react-i18next';

interface LeftToolbarProps {
  tool: string;
  hasPrev: boolean;
  hasNext: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canCopy: boolean;
  canPaste: boolean;
  setTool: (tool: any) => void;
  onHomeClick: () => void;
  handlePrevStem: () => void;
  handleNextStem: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleDelete: () => void;
  handleClear: () => void;
  handleSave: () => void;
}

export function LeftToolbar({ 
  tool, hasPrev, hasNext, canUndo, canRedo, canCopy, canPaste,
  setTool, onHomeClick, handlePrevStem, handleNextStem, 
  handleUndo, handleRedo, handleCopy, handlePaste, handleDelete, handleClear, handleSave, 
}: LeftToolbarProps) {
  const { t } = useTranslation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const shortcutsSettings = useStore((s) => s.shortcutsSettings);
  const editorSettings = useStore((s) => s.editorSettings); 


  const getToolInfo = (name: string, id: string) => {
    const setting = shortcutsSettings?.[id];
    if (!setting) return { name, shortcut: '', title: name };

    const isObject = typeof setting === 'object';
    const rawKey = isObject ? setting.key : setting;
    if (!rawKey) return { name, shortcut: '', title: name };

    const key = KEY_LABELS[rawKey.toLowerCase()] || rawKey.toUpperCase();
    const modifiers = isObject ? [
      setting.ctrl ? 'Ctrl+' : '',
      setting.shift ? 'Shift+' : '',
    ].join('') : '';
  
    const shortcutStr = `${modifiers}${key}`;
    return { 
      name, 
      shortcut: shortcutStr, 
      title: `${name} (${shortcutStr})`
    };
  };

  const mainDrawTools = [
    { id: 'bbox', icon: Square, ...getToolInfo(t('shortcuts.bbox'), 'bbox') },
    { id: 'polygon', icon: Hexagon, ...getToolInfo(t('shortcuts.polygon'), 'polygon') },
    { id: 'ai_anno', icon: Wand2, ...getToolInfo(t('shortcuts.ai_anno'), 'ai_anno') } 
  ];

  const moreTools = [
    { id: 'rbbox', icon: Diamond, ...getToolInfo(t('shortcuts.rbbox'), 'rbbox') },
    { id: 'cuboid', icon: Box, ...getToolInfo(t('shortcuts.cuboid'), 'cuboid') },
    { id: 'ellipse', icon: Circle, ...getToolInfo(t('shortcuts.ellipse'), 'ellipse'), className: "scale-y-[0.7]" },
    { id: 'circle', icon: Circle, ...getToolInfo(t('shortcuts.circle'), 'circle') },
    { id: 'freemask', icon: Cloud, ...getToolInfo(t('shortcuts.freemask'), 'freemask') },
    { id: 'separator', type: 'separator' },
    { id: 'point', icon: CircleDot, ...getToolInfo(t('shortcuts.point'), 'point') },
    { id: 'line', icon: Activity, ...getToolInfo(t('shortcuts.line'), 'line') },
    { id: 'lasso', icon: Pencil, ...getToolInfo(t('shortcuts.lasso'), 'lasso') },
  ];

  const editTools = [
    { id: 'pan', icon: Hand, ...getToolInfo(t('shortcuts.pan'), 'pan') },
    { id: 'select', icon: MousePointer2, ...getToolInfo(t('shortcuts.select'), 'select') },
    { id: 'cut', icon: Columns2, ...getToolInfo(t('shortcuts.cut'), 'cut') },
    { id: 'cutout', icon: Eraser, ...getToolInfo(t('shortcuts.cutout'), 'cutout') },
  ];

  const navTools = [
    { id: 'home', icon: Home, ...getToolInfo(t('shortcuts.home'), 'home'), action: onHomeClick },
    { id: 'prev', icon: ChevronLeft, ...getToolInfo(t('shortcuts.prev'), 'prev'), action: handlePrevStem, disabled: !hasPrev },
    { id: 'next', icon: ChevronRight, ...getToolInfo(t('shortcuts.next'), 'next'), action: handleNextStem, disabled: !hasNext },
    { id: 'separator', type: 'separator' },
    { id: 'undo', icon: Undo2, ...getToolInfo(t('shortcuts.undo'), 'undo'), action: handleUndo, disabled: !canUndo },
    { id: 'redo', icon: Redo2, ...getToolInfo(t('shortcuts.redo'), 'redo'), action: handleRedo, disabled: !canRedo },
    { id: 'copy', icon: Copy, action: handleCopy, disabled: !canCopy },
    { id: 'paste', icon: ClipboardPaste, action: handlePaste, disabled: !canPaste },
    { id: 'delete', icon: Trash2, ...getToolInfo(t('shortcuts.delete'), 'delete'), action: handleDelete },
    { id: 'clear', icon: Ban, ...getToolInfo(t('shortcuts.clear'), 'clear'), action: handleClear },
    { id: 'save', icon: Save, ...getToolInfo(t('shortcuts.save'), 'save'), action: handleSave },
  ];

  const renderToolButton = (t: any) => {
    if (t.type === 'separator') {
      return <div key={t.id} className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />;
    }

    const isActive = tool === t.id && !t.action; 
    const buttonClass = editorSettings?.showToolLabels 
      ? 'h-auto py-2 w-14 flex-col gap-1' 
      : 'h-9 w-9';
    
    return (
      <Button
        key={t.id}
        variant="ghost"
        disabled={t.disabled}
        onClick={t.action ? t.action : () => setTool(t.id)} 
        className={`transition-all duration-200 ${buttonClass} ${getButtonStyle(t)}`}
        title={t.disabled ? `${t.name} (unavailable)` : t.title}
      >
        <t.icon className={`${editorSettings?.showToolLabels ? "w-4 h-4" : "w-5 h-5"} ${t.className || ''}`} />
        
        {editorSettings?.showToolLabels && (
          <div className="flex flex-col items-center gap-0.5 mt-0.5">
            <span className="text-[9px] font-medium leading-tight text-center break-words w-full px-0.5">
              {t.name}
            </span>
            {t.shortcut && (
              <span className="text-[8px] font-mono leading-none opacity-60">
                {t.shortcut}
              </span>
            )}
          </div>
        )}
      </Button>
    );
  };

  // 🌟 提取样式逻辑
  const getButtonStyle = (t: any) => {
    const isActive = tool === t.id && !t.action;
    
    if (isActive) {
      return 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-200 dark:ring-blue-800';
    }
    
    if (t.disabled) {
      // 🌟 不可用：降低对比度但保持可见
      return 'opacity-40 text-neutral-300 dark:text-neutral-600 cursor-not-allowed';
    }
    
    return 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800';
  };

  return (
    <div className="w-16 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex flex-col items-center py-4 space-y-2 z-10 shrink-0 shadow-sm relative h-full overflow-y-auto custom-scrollbar">

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
            {moreTools.map(renderToolButton)}
          </div>
        )}
      </div>
      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
      {editTools.map(renderToolButton)}
      <div className="w-8 h-px bg-neutral-200 dark:bg-neutral-800 my-1" />
      {navTools.map(renderToolButton)}
    </div>
  );
}