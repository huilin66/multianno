import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../ui/button';
import { Check, X } from 'lucide-react';
import { useStore } from '../../../store/useStore';
import { ObjectEditorForm } from './ObjectEditorForm'; // 🌟 引入刚封装的组件

export function ClassFormPopover({
  popoverPos, formLabel, setFormLabel, formText, setFormText,
  formGroupId, setFormGroupId, formTrackId, setFormTrackId,
  formDifficult, setFormDifficult, formOccluded, setFormOccluded,
  formAttributes, setFormAttributes, handleCancelDrawing, savePendingAnnotationToStore, taxonomyClasses
}: any) {
  
  const { taxonomyAttributes = [] } = useStore() as any;
  const activeClassDef = taxonomyClasses.find((c: any) => c.name === formLabel);
  const activeColor = activeClassDef?.color || '#3B82F6';
  
  const popoverRef = useRef<HTMLDivElement>(null);

  // 🌟 修复 1：恢复你的拖拽逻辑
  const [pos, setPos] = useState(popoverPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialPosX: 0, initialPosY: 0 });

  useEffect(() => { setPos(popoverPos); }, [popoverPos]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialPosX: pos.x, initialPosY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPos({ x: dragRef.current.initialPosX + e.clientX - dragRef.current.startX, y: dragRef.current.initialPosY + e.clientY - dragRef.current.startY });
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !document.querySelector('[role="listbox"]')) {
        e.preventDefault(); savePendingAnnotationToStore();
      } else if (e.key === 'Escape') {
        e.preventDefault(); handleCancelDrawing();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [savePendingAnnotationToStore, handleCancelDrawing]);

  return (
    <div 
      ref={popoverRef}
      className="absolute z-[9999] w-[300px] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden animate-in zoom-in-95 fade-in duration-200"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onPointerDown={(e) => e.stopPropagation()} 
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="h-1.5 w-full transition-colors duration-300" style={{ backgroundColor: activeColor }} />

      {/* 🌟 可拖拽的顶部把手区 */}
      <div 
        className={`px-3 py-2 bg-neutral-100/50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      >
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Object Details</span>
        <button onClick={handleCancelDrawing} className="text-neutral-400 hover:text-red-500 transition-colors p-1" onPointerDown={e => e.stopPropagation()}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3">
        {/* 🌟 复用封装好的表单组件 */}
        <ObjectEditorForm 
          label={formLabel} onLabelChange={setFormLabel}
          text={formText} onTextChange={setFormText}
          groupId={formGroupId} onGroupIdChange={setFormGroupId}
          trackId={formTrackId} onTrackIdChange={setFormTrackId}
          difficult={formDifficult} onDifficultChange={setFormDifficult}
          occluded={formOccluded} onOccludedChange={setFormOccluded}
          attributes={formAttributes} onAttributesChange={setFormAttributes}
          taxonomyClasses={taxonomyClasses} taxonomyAttributes={taxonomyAttributes} activeColor={activeColor}
        />

        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 mt-2">
          <Button onClick={savePendingAnnotationToStore} className="w-full h-8 text-xs text-white shadow-sm hover:brightness-110 transition-all" style={{ backgroundColor: activeColor }}>
            <Check className="w-3.5 h-3.5 mr-1" /> Save ↵
          </Button>
        </div>
      </div>
    </div>
  );
}