import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutTemplate, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useStore, type DrawingObjectEditorTemplate } from '../../../store/useStore';
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
];

export function DrawingObjectEditorSettingsModal({
  open,
  onClose,
}: DrawingObjectEditorSettingsModalProps) {
  const { t } = useTranslation();
  const editorSettings = useStore((state) => state.editorSettings);
  const updateEditorSettings = useStore((state) => state.updateEditorSettings);
  const [draftTemplate, setDraftTemplate] = useState<DrawingObjectEditorTemplate>('standard');

  useEffect(() => {
    if (open) {
      setDraftTemplate(editorSettings.drawingObjectEditorTemplate || 'standard');
    }
  }, [open, editorSettings.drawingObjectEditorTemplate]);

  const handleConfirm = () => {
    updateEditorSettings({ drawingObjectEditorTemplate: draftTemplate });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden border-neutral-200 p-0 dark:border-neutral-800 sm:max-w-lg">
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
