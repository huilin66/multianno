import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { AlertTriangle } from 'lucide-react';

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
  handleCancelDrawing: () => void;
  savePendingAnnotationToStore: () => void;
  taxonomyClasses: any[];
}

export function ClassFormPopover({
  popoverPos, formLabel, setFormLabel, formText, setFormText,
  formGroupId, setFormGroupId, formTrackId, setFormTrackId,
  formDifficult, setFormDifficult, handleCancelDrawing,
  savePendingAnnotationToStore, taxonomyClasses
}: ClassFormPopoverProps) {
  const { t } = useTranslation();

  return (
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
        {/* 👇 插入的新表单项 */}
        <div>
          <Label className="text-[10px] text-neutral-500 uppercase font-bold">Text (Description)</Label>
          <Input value={formText} onChange={(e) => setFormText(e.target.value)} className="h-7 text-xs mt-1 bg-white dark:bg-neutral-950" placeholder="e.g. 烂尾楼" />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-neutral-500 uppercase font-bold">Group ID</Label>
            <Input value={formGroupId} onChange={(e) => setFormGroupId(e.target.value)} className="h-7 text-xs mt-1 bg-white dark:bg-neutral-950" placeholder="Optional" />
          </div>
          <div>
            <Label className="text-[10px] text-neutral-500 uppercase font-bold">Track ID</Label>
            <Input type="number" value={formTrackId} onChange={(e) => setFormTrackId(e.target.value)} className="h-7 text-xs mt-1 bg-white dark:bg-neutral-950" placeholder="Optional" />
          </div>
        </div>
        {/* 👆 插入结束 */}
        <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/30">
          <Label className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1 cursor-pointer">
            <AlertTriangle className="w-3.5 h-3.5" /> {t('workspace.difficult')}
          </Label>
          <Switch checked={formDifficult} onCheckedChange={setFormDifficult} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          {/* 找到这行代码： */}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelDrawing}>{t('common.cancel')}</Button>
          <Button size="sm" className="h-7 text-xs bg-primary" onClick={savePendingAnnotationToStore}>{t('workspace.saveObject')}</Button>
        </div>
      </div>
    </div>
  );
}