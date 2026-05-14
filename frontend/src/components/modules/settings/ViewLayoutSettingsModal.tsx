// src/components/modules/settings/ViewLayoutSettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Grid3X3, Rows, Columns } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ViewLayoutSettingsModalProps {
  open: boolean;
  onClose: () => void;
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
    <Dialog open={open} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-lg sm:max-w-lg p-0 border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <DialogTitle>{t('viewLayout.title')}</DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-5">
          
          {/* ========== 1. Max Views ========== */}
          <div className="flex items-center gap-2 text-xs">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
              {t('viewLayout.views')}
            </Label>
            <span className="text-muted-foreground">
              {t('viewLayout.currentViews')} <span className="font-semibold">{currentViewCount}</span>
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{t('viewLayout.maxViews')}</span>
            <Input 
              type="number" 
              min={1} 
              max={99}
              value={draftMaxViews} 
              onChange={(e) => setDraftMaxViews(Math.max(1, Number(e.target.value)))}
              className="h-7 w-16 text-xs font-bold text-center"
            />
          </div>

          <div className="h-px bg-border" />

          {/* ========== 2. Quick Layout Presets ========== */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('viewLayout.quickPresets')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => {
                const isActive = draftRows === preset.rows && draftCols === preset.cols;
                return (
                  <button
                    key={preset.label}
                    onClick={() => handleApplyPreset(preset.rows, preset.cols)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      isActive 
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/20' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* ========== 3. Custom Grid ========== */}
          <div className="flex items-center gap-2 text-xs">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
              {t('viewLayout.customGrid')}
            </Label>
            <span className="text-muted-foreground">
              {t('viewLayout.rows')} <span className="font-semibold"></span>
            </span>
            <Input 
              type="number" 
              min={0} 
              max={10}
              value={draftRows} 
              onChange={(e) => setDraftRows(Math.max(0, Number(e.target.value)))}
              className="h-7 w-16 text-xs font-bold text-center"
              placeholder="0"
            />
            <span className="text-muted-foreground">×</span>
            <span className="text-muted-foreground">
              {t('viewLayout.columns')} <span className="font-semibold"></span>
            </span>
            <Input 
              type="number" 
              min={0} 
              max={10}
              value={draftCols} 
              onChange={(e) => setDraftCols(Math.max(0, Number(e.target.value)))}
              className="h-7 w-16 text-xs font-bold text-center"
              placeholder="0"
            />
          </div>

          {/* ========== 4. Live Preview ========== */}
          <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-border">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('viewLayout.livePreview')}
              </Label>
              <span className="text-[9px] font-mono text-primary">
                {previewRows}×{previewCols} = {totalCells} {t('viewLayout.cells')}
                {emptyCells > 0 && (
                  <span className="text-amber-500 ml-1">
                    ({emptyCells} {t('viewLayout.empty')})
                  </span>
                )}
              </span>
            </div>

            <div 
              className="grid gap-1.5 p-3 bg-muted/50 rounded-lg border border-dashed border-border"
              style={{ 
                gridTemplateColumns: `repeat(${previewCols}, 1fr)`,
                gridTemplateRows: `repeat(${previewRows}, 1fr)`,
                minHeight: '120px'
              }}
            >
              {Array.from({ length: totalCells }).map((_, i) => {
                const isOccupied = i < currentViewCount;
                const isMain = i === 0;
                return (
                  <div 
                    key={i} 
                    className={`rounded-md border transition-all duration-300 flex items-center justify-center text-[9px] font-bold ${
                      isOccupied 
                        ? isMain 
                          ? 'bg-primary/40 border-primary shadow-sm text-primary-foreground'
                          : 'bg-emerald-400/40 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-transparent border-border text-muted-foreground'
                    }`}
                  >
                    {isOccupied ? (`V${i + 1}`) : ''}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-primary/40 border border-primary" />
                <span className="text-[9px] text-muted-foreground">{t('viewLayout.mainView')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-400/40 border border-emerald-500/50" />
                <span className="text-[9px] text-muted-foreground">{t('viewLayout.augViews')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border border-border bg-transparent" />
                <span className="text-[9px] text-muted-foreground">{t('viewLayout.empty')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} className="text-white">
            {t('common.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}