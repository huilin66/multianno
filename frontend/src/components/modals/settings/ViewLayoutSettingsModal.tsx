import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Eye, Grid2X2, LayoutGrid, Pencil, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useStore } from '../../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';

interface ViewLayoutSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function SectionHeading({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span>{children}</span>
    </div>
  );
}

function FieldLabel({ children, className = '' }: { children: string; className?: string }) {
  return <Label className={`text-[11px] font-medium text-muted-foreground ${className}`}>{children}</Label>;
}

export function ViewLayoutSettingsModal({ open, onClose }: ViewLayoutSettingsModalProps) {
  const { t } = useTranslation();
  const { editorSettings, updateEditorSettings, views } = useStore() as any;
  const currentViewCount = views.length;

  const [draftMaxViews, setDraftMaxViews] = useState(editorSettings.maxViews || 9);
  const [draftRows, setDraftRows] = useState(editorSettings.gridLayout?.rows || 0);
  const [draftCols, setDraftCols] = useState(editorSettings.gridLayout?.cols || 0);

  useEffect(() => {
    if (open) {
      setDraftMaxViews(editorSettings.maxViews || 9);
      setDraftRows(editorSettings.gridLayout?.rows || 0);
      setDraftCols(editorSettings.gridLayout?.cols || 0);
    }
  }, [open]);

  const previewCols = draftCols > 0 ? draftCols : Math.ceil(Math.sqrt(Math.max(1, currentViewCount)));
  const previewRows = draftRows > 0 ? draftRows : Math.ceil(currentViewCount / previewCols);
  const totalCells = previewRows * previewCols;
  const emptyCells = Math.max(0, totalCells - currentViewCount);

  const handleApplyPreset = (rows: number, cols: number) => {
    setDraftRows(rows);
    setDraftCols(cols);
    if (rows > 0 && cols > 0) {
      setDraftMaxViews(Math.max(rows * cols, 4));
    }
  };

  const handleConfirm = () => {
    updateEditorSettings({
      maxViews: draftMaxViews,
      gridLayout: { rows: draftRows, cols: draftCols },
    });
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const presets = [
    { label: t('viewLayout.presets_auto'), rows: 0, cols: 0 },
    { label: '1×1', rows: 1, cols: 1 },
    { label: '1×2', rows: 1, cols: 2 },
    { label: '2×2', rows: 2, cols: 2 },
    { label: '2×3', rows: 2, cols: 3 },
    { label: '3×3', rows: 3, cols: 3 },
    { label: '2×4', rows: 2, cols: 4 },
    { label: '3×4', rows: 3, cols: 4 },
    { label: '4×4', rows: 4, cols: 4 },
    { label: '3×5', rows: 3, cols: 5 },
    { label: '5×5', rows: 5, cols: 5 },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-neutral-200 p-0 dark:border-neutral-800 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-base">{t('viewLayout.title')}</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('viewLayout.currentViews')} {currentViewCount}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-4 p-4 sm:p-5">
            <section className="rounded-xl border border-border bg-muted/20 p-4">
              <SectionHeading icon={SlidersHorizontal}>{t('viewLayout.views')}</SectionHeading>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex min-h-[76px] flex-col justify-center rounded-lg border border-border bg-background/70 px-3 py-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('viewLayout.currentViews')}
                  </div>
                  <div className="mt-1 font-mono text-xl font-semibold leading-none text-foreground">
                    {currentViewCount}
                  </div>
                </div>
                <div
                  className="flex min-h-[76px] items-center justify-between gap-3 rounded-lg border border-primary/35 bg-primary/[0.03] px-3 py-2.5 shadow-sm shadow-primary/5"
                  title={t('viewLayout.maxViewsHint')}
                >
                  <div className="flex items-center gap-1.5">
                    <FieldLabel className="text-primary">{t('viewLayout.maxViews')}</FieldLabel>
                    <Pencil className="h-3 w-3 text-primary/70" aria-hidden="true" />
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={draftMaxViews}
                    onChange={(e) => setDraftMaxViews(Math.max(1, Number(e.target.value)))}
                    aria-label={t('viewLayout.maxViews')}
                    className="view-layout-number-input h-8 w-20 cursor-text border-primary/40 bg-background text-center text-xs font-bold hover:border-primary focus-visible:border-primary focus-visible:ring-primary/30"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading icon={Grid2X2}>{t('viewLayout.quickPresets')}</SectionHeading>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {previewRows}×{previewCols}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {presets.map((preset) => {
                  const isActive = draftRows === preset.rows && draftCols === preset.cols;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleApplyPreset(preset.rows, preset.cols)}
                      className={`flex h-8 items-center justify-center rounded-lg border text-[10px] font-semibold transition-colors ${
                        isActive
                          ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                          : 'border-transparent bg-muted text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-background p-4">
              <SectionHeading icon={SlidersHorizontal}>{t('viewLayout.customGrid')}</SectionHeading>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <FieldLabel>{t('viewLayout.rows')}</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={draftRows}
                    onChange={(e) => setDraftRows(Math.max(0, Number(e.target.value)))}
                    className="view-layout-number-input h-8 w-20 text-center text-xs font-bold"
                    placeholder="0"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <FieldLabel>{t('viewLayout.columns')}</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={draftCols}
                    onChange={(e) => setDraftCols(Math.max(0, Number(e.target.value)))}
                    className="view-layout-number-input h-8 w-20 text-center text-xs font-bold"
                    placeholder="0"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading icon={Eye}>{t('viewLayout.livePreview')}</SectionHeading>
                <span className="text-right font-mono text-[10px] text-primary">
                  {previewRows}×{previewCols} = {totalCells} {t('viewLayout.cells')}
                  {emptyCells > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">({emptyCells} {t('viewLayout.empty')})</span>}
                </span>
              </div>

              <div
                className="mt-3 grid gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 p-3"
                style={{
                  gridTemplateColumns: `repeat(${previewCols}, 1fr)`,
                  gridTemplateRows: `repeat(${previewRows}, 1fr)`,
                  minHeight: '136px',
                }}
              >
                {Array.from({ length: totalCells }).map((_, index) => {
                  const isOccupied = index < currentViewCount;
                  const isMain = index === 0;
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-center rounded-md border text-[9px] font-bold transition-colors ${
                        isOccupied
                          ? isMain
                            ? 'border-primary bg-primary/40 text-primary-foreground shadow-sm'
                            : 'border-emerald-500/50 bg-emerald-400/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-border bg-transparent text-muted-foreground'
                      }`}
                    >
                      {isOccupied ? `V${index + 1}` : ''}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded border border-primary bg-primary/40" />
                  <span className="text-[9px] text-muted-foreground">{t('view.mainView')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded border border-emerald-500/50 bg-emerald-400/40" />
                  <span className="text-[9px] text-muted-foreground">{t('view.augViews')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded border border-border bg-transparent" />
                  <span className="text-[9px] text-muted-foreground">{t('viewLayout.empty')}</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" size="sm" onClick={handleCancel}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleConfirm} className="text-white">{t('common.confirm')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
