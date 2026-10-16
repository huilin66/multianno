import React from 'react';
import { X } from 'lucide-react';
import { ObjectEditorForm } from './ObjectEditorForm';
import { Button } from '../../ui/button';
import type { DrawingObjectEditorField, DrawingObjectEditorTemplate } from '../../../store/useStore';

interface ObjectEditorPopoverProps {
  annotation: any;
  position: { x: number; y: number };
  taxonomyClasses: any[];
  taxonomyAttributes: any[];
  onUpdate: (updates: Record<string, any>) => void;
  onClose: () => void;
  onSave?: () => void;
  mode?: 'edit' | 'create';
  template?: DrawingObjectEditorTemplate;
  visibleFields?: DrawingObjectEditorField[];
}

/** Floating editor for an existing annotation selected from the main canvas. */
export function ObjectEditorPopover({
  annotation,
  position,
  taxonomyClasses,
  taxonomyAttributes,
  onUpdate,
  onClose,
  onSave,
  mode = 'edit',
  template = 'standard',
  visibleFields,
}: ObjectEditorPopoverProps) {
  const activeClass = taxonomyClasses.find((item: any) => item.name === annotation.label);
  const activeColor = activeClass?.color || '#3B82F6';
  const isCreateMode = mode === 'create';

  return (
    <div
      className="fixed z-[80] w-[340px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto rounded-xl border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-neutral-700 dark:bg-neutral-900/95 custom-scrollbar"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/70">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Object Editor
          </div>
          <div className="mt-0.5 truncate text-[10px] text-neutral-400" title={annotation.id || 'new'}>
            {annotation.label || 'New object'} · {annotation.id || 'new'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          title="Close"
          aria-label="Close object editor"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3">
        <ObjectEditorForm
          label={annotation.label}
          onLabelChange={(value) => onUpdate({ label: value })}
          text={annotation.text || ''}
          onTextChange={(value) => onUpdate({ text: value })}
          groupId={annotation.group_id || ''}
          onGroupIdChange={(value) => onUpdate({ group_id: value ? Number(value) : null })}
          trackId={annotation.track_id || ''}
          onTrackIdChange={(value) => onUpdate({ track_id: value || null })}
          difficult={!!annotation.difficult}
          onDifficultChange={(value) => onUpdate({ difficult: value })}
          occluded={!!annotation.occluded}
          onOccludedChange={(value) => onUpdate({ occluded: value })}
          truncated={!!annotation.truncated}
          onTruncatedChange={(value) => onUpdate({ truncated: value })}
          attributes={annotation.attributes || {}}
          onAttributesChange={(value) => onUpdate({ attributes: value })}
          taxonomyClasses={taxonomyClasses}
          taxonomyAttributes={taxonomyAttributes}
          activeColor={activeColor}
          template={template}
          visibleFields={visibleFields}
        />
      </div>

      {isCreateMode && onSave && (
        <div className="flex items-center gap-2 border-t border-neutral-200 px-3 py-3 dark:border-neutral-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-8 flex-1 text-xs font-bold text-neutral-600 dark:text-neutral-400"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            className="h-8 flex-1 text-xs font-bold text-white shadow-sm hover:brightness-110"
            style={{ backgroundColor: activeColor }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
