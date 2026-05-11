import React from 'react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

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
    <div className="space-y-2.5">
      {/* Class */}
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-neutral-500 w-14 shrink-0">Class</Label>
        <Select value={label} onValueChange={onLabelChange}>
          <SelectTrigger className="h-7 text-xs flex-1 bg-neutral-50 dark:bg-black border-neutral-200 dark:border-neutral-800">
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

      {/* Group ID + Track ID 同行 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Label className="text-[11px] text-neutral-500 shrink-0">Group ID</Label>
          <Input
            type="number" value={groupId || ''} onChange={(e) => onGroupIdChange(e.target.value)}
            placeholder="-" className="h-7 text-xs flex-1 bg-neutral-50 dark:bg-black font-mono"
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Label className="text-[11px] text-neutral-500 shrink-0">Track ID</Label>
          <Input
            type="number" value={trackId || ''} onChange={(e) => onTrackIdChange(e.target.value)}
            placeholder="-" className="h-7 text-xs flex-1 bg-neutral-50 dark:bg-black font-mono"
          />
        </div>
      </div>

      {/* 状态开关 */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-1 cursor-pointer" onClick={() => onDifficultChange(!difficult)}>
          <Label className="text-[11px] text-neutral-500 cursor-pointer">Difficult</Label>
          <Switch checked={difficult} onCheckedChange={onDifficultChange} className="scale-[0.7] origin-left m-0 shadow-none" />
        </div>
        <div className="flex items-center gap-1 cursor-pointer" onClick={() => onOccludedChange(!occluded)}>
          <Label className="text-[11px] text-neutral-500 cursor-pointer">Occluded</Label>
          <Switch checked={occluded} onCheckedChange={onOccludedChange} className="scale-[0.7] origin-left m-0 shadow-none" />
        </div>
        <div className="flex items-center gap-1 cursor-pointer" onClick={() => onTruncatedChange(!truncated)}>
          <Label className="text-[11px] text-neutral-500 cursor-pointer">Truncated</Label>
          <Switch checked={truncated} onCheckedChange={onTruncatedChange} className="scale-[0.7] origin-left m-0 shadow-none" />
        </div>
      </div>

      {/* Text */}
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-neutral-500 w-14 shrink-0">Text</Label>
        <Input
          value={text} onChange={(e) => onTextChange(e.target.value)}
          placeholder="Description..."
          className="h-7 text-xs flex-1 bg-neutral-50 dark:bg-black border-neutral-200 dark:border-neutral-800"
        />
      </div>

      {/* Attributes */}
      
      <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <Label className="text-[10px] text-neutral-400 mb-2 block uppercase tracking-wider">Attributes</Label>
          {taxonomyAttributes && taxonomyAttributes.length > 0 ? (
            <div className="space-y-1.5 max-h-[100px] overflow-y-auto custom-scrollbar pr-1">
              {taxonomyAttributes.map((attr: any) => (
                <div key={attr.id} className="flex items-center gap-2 bg-neutral-50 dark:bg-black/40 px-2 py-1 rounded border border-neutral-100 dark:border-neutral-800/50">
                  <span className="text-[11px] text-neutral-500 truncate w-16 shrink-0">{attr.name}</span>
                  {attr.options ? (
                    <Select value={attributes[attr.name] || ''} onValueChange={(val) => onAttributesChange({ ...attributes, [attr.name]: val })}>
                      <SelectTrigger className="h-6 text-[10px] flex-1 bg-white dark:bg-neutral-900"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {attr.options.map((opt: string) => <SelectItem key={opt} value={opt} className="text-[10px]">{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={attributes[attr.name] || ''} onChange={(e) => onAttributesChange({ ...attributes, [attr.name]: e.target.value })} className="h-6 text-[10px] flex-1 bg-white dark:bg-neutral-900" />
                  )}
                </div>
            ))}
          </div>
          ) : (
          <div className="text-center py-2 text-[10px] text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-700 rounded">
            No attributes defined
          </div>
        )}
      </div>
      

    </div>
  );
}