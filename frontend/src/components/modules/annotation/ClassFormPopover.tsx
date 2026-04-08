import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { AlertTriangle, X, Check } from 'lucide-react';
import { useStore } from '../../../store/useStore';

interface ClassFormPopoverProps {
  popoverPos: { x: number; y: number };
  formLabel: string;
  setFormLabel: (v: string) => void;
  formText: string;
  setFormText: (v: string) => void;
  formGroupId: string;
  setFormGroupId: (v: string) => void;
  formTrackId: string;
  setFormTrackId: (v: string) => void;
  formDifficult: boolean;
  setFormDifficult: (v: boolean) => void;
  formOccluded: boolean;
  setFormOccluded: (v: boolean) => void;
  formAttributes: boolean;
  setFormAttributes: (v: boolean) => void;
  handleCancelDrawing: () => void;
  savePendingAnnotationToStore: () => void;
  taxonomyClasses: any[];
}

export function ClassFormPopover({ 
  popoverPos, formLabel, setFormLabel, 
  formText, setFormText, formGroupId, setFormGroupId, 
  formTrackId, setFormTrackId, formDifficult, setFormDifficult, 
  formOccluded, setFormOccluded,
  formAttributes, setFormAttributes, // 🌟 务必确保 SyncAnnotation 传了这两个 props 进来
  handleCancelDrawing, savePendingAnnotationToStore, taxonomyClasses 
}: any) {

  const { taxonomyAttributes = [] } = useStore() as any;

  // 拖拽逻辑 (保留你之前的拖拽代码)
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

  return (
    <div 
      // 去掉这里的 z-50
      className="absolute w-72 bg-white dark:bg-neutral-900 rounded-lg shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col"
      // 🌟 直接在 style 里赋予它超越画布的最高层级
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, zIndex: 9999 }}
    >
      {/* 头部拖拽区 */}
      <div 
        className={`px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      >
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Object Details</span>
        <button onClick={handleCancelDrawing} className="text-neutral-400 hover:text-red-500 transition-colors p-1"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* 表单内容区 */}
      <div className="p-3 space-y-3">
        {/* 1. Class Label */}
        <div className="space-y-1">
          <Label className="text-[10px] text-neutral-400 uppercase">Class Label</Label>
          <Select value={formLabel} onValueChange={setFormLabel}>
            <SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {taxonomyClasses.map((c: any) => (
                <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. Shape Description (text) */}
        <div className="space-y-1">
          <Label className="text-[10px] text-neutral-400 uppercase">Description (Text)</Label>
          <Input placeholder="e.g. 烂尾楼" value={formText} onChange={e => setFormText(e.target.value)} className="h-8 text-xs" />
        </div>

        {/* 3. IDs (Group & Track)并排 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-neutral-400 uppercase">Group ID</Label>
            <Input type="number" placeholder="Null" value={formGroupId} onChange={e => setFormGroupId(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-neutral-400 uppercase">Track ID</Label>
            <Input type="number" placeholder="Null" value={formTrackId} onChange={e => setFormTrackId(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        {/* 4. Attributes 动态属性区 */}
        {taxonomyAttributes.length > 0 && (
          <div className="space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-2">
            <Label className="text-[10px] text-neutral-400 uppercase">Attributes</Label>
            {taxonomyAttributes.map((attr: any) => (
              <div key={attr.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-600 dark:text-neutral-400">{attr.name}</span>
                <Select 
                  value={formAttributes[attr.name] || ''} 
                  onValueChange={(val) => setFormAttributes({...formAttributes, [attr.name]: val})}
                >
                  <SelectTrigger className="h-7 text-[11px] w-32"><SelectValue placeholder="Select..."/></SelectTrigger>
                  <SelectContent>
                    {attr.options?.map((opt: string) => (
                      <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}


        {/* 5. Flags (Difficult & Occluded) */}
        <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={formDifficult} onCheckedChange={setFormDifficult} />
              <Label className="text-xs text-neutral-600">Difficult</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formOccluded} onCheckedChange={setFormOccluded} />
              <Label className="text-xs text-neutral-600">Occluded</Label>
            </div>
          </div>
          
          <Button onClick={savePendingAnnotationToStore} className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white mt-2">
            <Check className="w-4 h-4 mr-1" /> Save Object
          </Button>
        </div>
      </div>
    </div>
  );
}