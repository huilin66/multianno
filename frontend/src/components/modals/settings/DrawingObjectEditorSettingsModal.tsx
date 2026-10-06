import { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  LayoutTemplate,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DRAWING_OBJECT_EDITOR_FIELDS,
  useStore,
  type DrawingObjectEditorField,
  type DrawingObjectEditorTemplate,
} from '../../../store/useStore';
import { ObjectEditorForm } from '../../modules/annotation/ObjectEditorForm';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';

interface DrawingObjectEditorSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const TEMPLATE_OPTIONS: Array<{
  value: DrawingObjectEditorTemplate;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    value: 'standard',
    icon: LayoutTemplate,
    titleKey: 'headerSetting.drawingObjectEditorStandard',
    descriptionKey: 'headerSetting.drawingObjectEditorStandardHint',
  },
  {
    value: 'quick',
    icon: Zap,
    titleKey: 'headerSetting.drawingObjectEditorQuick',
    descriptionKey: 'headerSetting.drawingObjectEditorQuickHint',
  },
  {
    value: 'custom',
    icon: SlidersHorizontal,
    titleKey: 'headerSetting.drawingObjectEditorCustom',
    descriptionKey: 'headerSetting.drawingObjectEditorCustomHint',
  },
];

const CUSTOM_FIELD_OPTIONS: Array<{
  value: DrawingObjectEditorField;
  labelKey: string;
}> = [
  { value: 'class', labelKey: 'objectEditor.class' },
  { value: 'groupId', labelKey: 'objectEditor.groupID' },
  { value: 'trackId', labelKey: 'objectEditor.trackID' },
  { value: 'text', labelKey: 'objectEditor.text' },
  { value: 'attributes', labelKey: 'objectEditor.attributes' },
  { value: 'difficult', labelKey: 'objectEditor.difficult' },
  { value: 'occluded', labelKey: 'objectEditor.occluded' },
  { value: 'truncated', labelKey: 'objectEditor.truncated' },
];

function normalizeVisibleFields(value: unknown): DrawingObjectEditorField[] {
  if (!Array.isArray(value)) return [...DRAWING_OBJECT_EDITOR_FIELDS];
  return DRAWING_OBJECT_EDITOR_FIELDS.filter((field) => value.includes(field));
}

interface PreviewState {
  label: string;
  text: string;
  groupId: string;
  trackId: string;
  difficult: boolean;
  occluded: boolean;
  truncated: boolean;
  attributes: Record<string, any>;
}

export function DrawingObjectEditorSettingsModal({
  open,
  onClose,
}: DrawingObjectEditorSettingsModalProps) {
  const { t } = useTranslation();
  const editorSettings = useStore((state) => state.editorSettings);
  const updateEditorSettings = useStore((state) => state.updateEditorSettings);
  const taxonomyClasses = useStore((state) => state.taxonomyClasses);
  const taxonomyAttributes = useStore((state) => state.taxonomyAttributes);
  const [draftTemplate, setDraftTemplate] = useState<DrawingObjectEditorTemplate>('standard');
  const [draftVisibleFields, setDraftVisibleFields] = useState<DrawingObjectEditorField[]>([
    ...DRAWING_OBJECT_EDITOR_FIELDS,
  ]);
  const [previewState, setPreviewState] = useState<PreviewState>({
    label: '',
    text: '',
    groupId: '7',
    trackId: '12',
    difficult: false,
    occluded: true,
    truncated: false,
    attributes: {},
  });

  const previewClasses = useMemo(
    () => taxonomyClasses.length > 0
      ? taxonomyClasses
      : [{ id: 'preview-class', name: t('headerSetting.drawingObjectEditorPreviewClass'), color: '#3B82F6' }],
    [taxonomyClasses, t],
  );
  const previewAttributes = useMemo(
    () => taxonomyAttributes.length > 0
      ? taxonomyAttributes
      : [{
        id: 'preview-attribute',
        name: t('headerSetting.drawingObjectEditorPreviewAttribute'),
        type: 'select' as const,
        options: [t('headerSetting.drawingObjectEditorPreviewOption')],
        defaultValue: t('headerSetting.drawingObjectEditorPreviewOption'),
        applyToAll: false,
      }],
    [taxonomyAttributes, t],
  );

  useEffect(() => {
    if (!open) return;

    const firstClass = previewClasses[0];
    const firstAttribute = previewAttributes[0];
    const firstAttributeValue = firstAttribute?.options?.[0] || firstAttribute?.defaultValue || '';

    setDraftTemplate(editorSettings.drawingObjectEditorTemplate || 'standard');
    setDraftVisibleFields(normalizeVisibleFields(editorSettings.drawingObjectEditorVisibleFields));
    setPreviewState({
      label: firstClass?.name || '',
      text: t('headerSetting.drawingObjectEditorPreviewText'),
      groupId: '7',
      trackId: '12',
      difficult: false,
      occluded: true,
      truncated: false,
      attributes: firstAttribute ? { [firstAttribute.name]: firstAttributeValue } : {},
    });
  }, [
    editorSettings.drawingObjectEditorTemplate,
    editorSettings.drawingObjectEditorVisibleFields,
    open,
    previewAttributes,
    previewClasses,
    t,
  ]);

  const handleConfirm = () => {
    updateEditorSettings({
      drawingObjectEditorTemplate: draftTemplate,
      drawingObjectEditorVisibleFields: draftVisibleFields,
    });
    onClose();
  };

  const toggleField = (field: DrawingObjectEditorField) => {
    setDraftVisibleFields((current) => current.includes(field)
      ? current.filter((item) => item !== field)
      : [...current, field]);
  };

  const updatePreview = <K extends keyof PreviewState>(key: K, value: PreviewState[K]) => {
    setPreviewState((current) => ({ ...current, [key]: value }));
  };

  const activePreviewColor = previewClasses.find((item) => item.name === previewState.label)?.color
    || previewClasses[0]?.color
    || '#3B82F6';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-neutral-200 p-0 dark:border-neutral-800 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutTemplate className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">{t('headerSetting.drawingObjectEditor')}</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('headerSetting.drawingObjectEditorHint')}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-4 p-4 sm:p-5">
            <section className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('headerSetting.drawingObjectEditorChooseTemplate')}
                </h3>
              </div>

              <div className="space-y-2">
                {TEMPLATE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = draftTemplate === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
                        isSelected
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border/70 bg-background/70 hover:border-primary/30 hover:bg-primary/[0.02]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="drawing-object-editor-template"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => setDraftTemplate(option.value)}
                        className="sr-only"
                      />
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? 'border-primary' : 'border-neutral-300 dark:border-neutral-600'
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground">
                          {t(option.titleKey)}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                          {t(option.descriptionKey)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            {draftTemplate === 'custom' && (
              <>
                <section className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('headerSetting.drawingObjectEditorCustomFields')}
                    </h3>
                  </div>
                  <p className="mb-3 text-[10px] leading-4 text-muted-foreground">
                    {t('headerSetting.drawingObjectEditorCustomFieldsHint')}
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {CUSTOM_FIELD_OPTIONS.map((field) => {
                      const isVisible = draftVisibleFields.includes(field.value);
                      return (
                        <div
                          key={field.value}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                            isVisible
                              ? 'border-primary/25 bg-background/80'
                              : 'border-border/60 bg-muted/30 opacity-70'
                          }`}
                        >
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {t(field.labelKey)}
                          </span>
                          <Button
                            type="button"
                            variant={isVisible ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => toggleField(field.value)}
                            className="h-6 shrink-0 px-2 text-[10px]"
                            aria-pressed={isVisible}
                          >
                            {isVisible ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                            {isVisible
                              ? t('headerSetting.drawingObjectEditorCustomHide')
                              : t('headerSetting.drawingObjectEditorCustomShow')}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('headerSetting.drawingObjectEditorCustomPreview')}
                    </h3>
                  </div>
                  <p className="mb-3 text-[10px] leading-4 text-muted-foreground">
                    {t('headerSetting.drawingObjectEditorCustomPreviewHint')}
                  </p>

                  <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm">
                    <ObjectEditorForm
                      label={previewState.label}
                      onLabelChange={(value) => updatePreview('label', value)}
                      text={previewState.text}
                      onTextChange={(value) => updatePreview('text', value)}
                      groupId={previewState.groupId}
                      onGroupIdChange={(value) => updatePreview('groupId', value)}
                      trackId={previewState.trackId}
                      onTrackIdChange={(value) => updatePreview('trackId', value)}
                      difficult={previewState.difficult}
                      onDifficultChange={(value) => updatePreview('difficult', value)}
                      occluded={previewState.occluded}
                      onOccludedChange={(value) => updatePreview('occluded', value)}
                      truncated={previewState.truncated}
                      onTruncatedChange={(value) => updatePreview('truncated', value)}
                      attributes={previewState.attributes}
                      onAttributesChange={(value) => updatePreview('attributes', value)}
                      taxonomyClasses={previewClasses}
                      taxonomyAttributes={previewAttributes}
                      activeColor={activePreviewColor}
                      template="custom"
                      visibleFields={draftVisibleFields}
                    />
                  </div>
                </section>
              </>
            )}

            <section className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4">
              <p className="text-[10px] leading-4 text-muted-foreground">
                {t('headerSetting.drawingObjectEditorScopeHint')}
              </p>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleConfirm} className="text-white">
            {t('common.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
