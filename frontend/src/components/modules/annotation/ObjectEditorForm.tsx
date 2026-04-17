import React from 'react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tag, Type, Hash, Route, AlertTriangle, EyeOff, Crop } from 'lucide-react';

export interface ObjectEditorFormProps {
  label: string; onLabelChange: (v: string) => void;
  text: string; onTextChange: (v: string) => void;
  groupId: string | number; onGroupIdChange: (v: string) => void;
  trackId: string | number; onTrackIdChange: (v: string) => void;
  difficult: boolean; onDifficultChange: (v: boolean) => void;
  occluded: boolean; onOccludedChange: (v: boolean) => void;
  truncated: boolean; onTruncatedChange: (v: boolean) => void;
  attributes: Record<string, any>; onAttributesChange: (v: Record<string, any>) => void;
  taxonomyClasses: any[];
  taxonomyAttributes: any[];
  activeColor: string;
}

export function ObjectEditorForm({
  label, onLabelChange, text, onTextChange,
  groupId, onGroupIdChange, trackId, onTrackIdChange,
  difficult, onDifficultChange, 
  occluded, onOccludedChange,
  truncated, onTruncatedChange,
  attributes, onAttributesChange, taxonomyClasses, taxonomyAttributes, activeColor
}: ObjectEditorFormProps) {
  
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] text-neutral-500 uppercase flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> Class Label
          </Label>
          <Select value={label} onValueChange={onLabelChange}>
            <SelectTrigger className="h-7 text-xs bg-neutral-50 dark:bg-black border-neutral-200 dark:border-neutral-800 transition-colors">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: activeColor }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {taxonomyClasses.map((c: any) => (
                <SelectItem key={c.id} value={c.name} className="text-xs font-medium">
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                     {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-neutral-500 uppercase flex items-center gap-1.5">
            <Type className="w-3 h-3" /> Text
          </Label>
          <Input 
            value={text} onChange={(e) => onTextChange(e.target.value)} 
            placeholder="Description..." 
            className="h-7 text-xs bg-neutral-50 dark:bg-black border-neutral-200 dark:border-neutral-800" 
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] text-neutral-500 uppercase flex items-center gap-1.5">
            <Hash className="w-3 h-3" /> Group ID
          </Label>
          <Input 
            type="number" value={groupId || ''} onChange={(e) => onGroupIdChange(e.target.value)} 
            placeholder="-" className="h-7 text-xs bg-neutral-50 dark:bg-black font-mono" 
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-neutral-500 uppercase flex items-center gap-1.5">
            <Route className="w-3 h-3" /> Track ID
          </Label>
          <Input 
            type="number" value={trackId || ''} onChange={(e) => onTrackIdChange(e.target.value)} 
            placeholder="-" className="h-7 text-xs bg-neutral-50 dark:bg-black font-mono" 
          />
        </div>
      </div>

      {/* 🌟 修复 2：先显示文字，再显示 Switch，调整了 origin 保证缩放中心点正确 */}
        {/* 🌟 优化后的状态开关区域：字在前，开关在后，极简紧凑 */}
        {/* 🌟 优化后的状态开关区域：强制三等分 + origin-left 解决右侧粘连 */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-neutral-100 dark:border-neutral-800">
          
          {/* Difficult (强制左对齐) */}
          <div 
            className="flex flex-1 items-center justify-start gap-1 cursor-pointer group" 
            onClick={() => onDifficultChange(!difficult)}
          >
            <Label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 cursor-pointer group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
              Difficult
            </Label>
            {/* 🌟 改用 origin-left，让缩放产生的留白留在右侧，推开下一个词 */}
            <Switch checked={difficult} onCheckedChange={onDifficultChange} className="scale-[0.7] origin-left m-0 shadow-none" />
          </div>

          {/* Occluded (强制居中) */}
          <div 
            className="flex flex-1 items-center justify-center gap-1 cursor-pointer group" 
            onClick={() => onOccludedChange(!occluded)}
          >
            <Label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 cursor-pointer group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
              Occluded
            </Label>
            <Switch checked={occluded} onCheckedChange={onOccludedChange} className="scale-[0.7] origin-left m-0 shadow-none" />
          </div>

          {/* Truncated (强制右对齐) */}
          <div 
            className="flex flex-1 items-center justify-end gap-1 cursor-pointer group" 
            onClick={() => onTruncatedChange(!truncated)}
          >
            <Label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 cursor-pointer flex items-center gap-1 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
              <Crop className="w-3 h-3 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300" /> 
              Truncated
            </Label>
            <Switch checked={truncated} onCheckedChange={onTruncatedChange} className="scale-[0.7] origin-left m-0 shadow-none" />
          </div>

        </div>

      {taxonomyAttributes && taxonomyAttributes.length > 0 && (
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <Label className="text-[10px] text-neutral-400 mb-2 block uppercase tracking-wider">Attributes</Label>
          <div className="space-y-2 max-h-[100px] overflow-y-auto custom-scrollbar pr-1">
            {taxonomyAttributes.map((attr: any) => (
              <div key={attr.id} className="flex items-center justify-between gap-2 bg-neutral-50 dark:bg-black/40 px-2 py-1 rounded border border-neutral-100 dark:border-neutral-800/50">
                <span className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate flex-1">{attr.name}</span>
                {attr.options ? (
                  <Select value={attributes[attr.name] || ''} onValueChange={(val) => onAttributesChange({...attributes, [attr.name]: val})}>
                    <SelectTrigger className="h-6 w-24 text-[10px] bg-white dark:bg-neutral-900"><SelectValue placeholder="Select..."/></SelectTrigger>
                    <SelectContent>
                      {attr.options.map((opt: string) => <SelectItem key={opt} value={opt} className="text-[10px]">{opt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={attributes[attr.name] || ''} onChange={(e) => onAttributesChange({...attributes, [attr.name]: e.target.value})} className="h-6 w-24 text-[10px] bg-white dark:bg-neutral-900" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}