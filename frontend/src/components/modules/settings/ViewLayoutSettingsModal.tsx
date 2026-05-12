// src/components/modules/settings/ViewLayoutSettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { LayoutTemplate, Grid3X3, Rows, Columns } from 'lucide-react';

interface ViewLayoutSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ViewLayoutSettingsModal({ open, onClose }: ViewLayoutSettingsModalProps) {
  const { editorSettings, updateEditorSettings, views } = useStore() as any;
  const currentViewCount = views.length;

  // 🌟 本地临时状态，预览用
  const [draftMaxViews, setDraftMaxViews] = useState(editorSettings.maxViews || 9);
  const [draftRows, setDraftRows] = useState(editorSettings.gridLayout?.rows || 0);
  const [draftCols, setDraftCols] = useState(editorSettings.gridLayout?.cols || 0);

  // 每次打开弹窗时，从 Store 同步到草稿
  useEffect(() => {
    if (open) {
      setDraftMaxViews(editorSettings.maxViews || 9);
      setDraftRows(editorSettings.gridLayout?.rows || 0);
      setDraftCols(editorSettings.gridLayout?.cols || 0);
    }
  }, [open]);

  // 实时预览的网格参数
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
    // 恢复原始值（由 useEffect 在下次打开时自动同步）
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-lg sm:max-w-lg bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 p-0 overflow-hidden">
        <DialogHeader className="p-5 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-neutral-50 dark:bg-neutral-950">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="w-5 h-5 text-indigo-500" />
            View Layout Settings
          </DialogTitle>
          <p className="text-xs text-neutral-500 mt-1">
            Configure maximum views and grid arrangement for the annotation workspace.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-6">
          
          {/* ========== 1. Max Views ========== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                Maximum Views
              </Label>
              <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                Currently {currentViewCount} view{currentViewCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Input 
                type="number" 
                min={1} 
                max={99}
                value={draftMaxViews} 
                onChange={(e) => setDraftMaxViews(Math.max(1, Number(e.target.value)))}
                className="h-9 w-24 text-sm font-bold text-center"
              />
              <span className="text-xs text-neutral-400">views allowed in workspace</span>
            </div>
          </div>

          <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

          {/* ========== 2. Quick Layout Presets ========== */}
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase text-neutral-500 tracking-wider">
              Quick Layout Presets
            </Label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Auto', rows: 0, cols: 0 },
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
              ].map((preset) => {
                const isActive = draftRows === preset.rows && draftCols === preset.cols;
                return (
                  <button
                    key={preset.label}
                    onClick={() => handleApplyPreset(preset.rows, preset.cols)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      isActive 
                        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-800' 
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

          {/* ========== 3. Custom Grid ========== */}
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase text-neutral-500 tracking-wider flex items-center gap-2">
              <Grid3X3 className="w-3.5 h-3.5" />
              Custom Grid
              <span className="text-[9px] text-neutral-400 normal-case font-normal tracking-normal">
                (0 = auto)
              </span>
            </Label>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-neutral-500 flex items-center gap-1.5">
                  <Rows className="w-3 h-3" /> Rows
                </Label>
                <Input 
                  type="number" 
                  min={0} 
                  max={10}
                  value={draftRows} 
                  onChange={(e) => setDraftRows(Math.max(0, Number(e.target.value)))}
                  className="h-9 text-sm font-bold text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-neutral-500 flex items-center gap-1.5">
                  <Columns className="w-3 h-3" /> Columns
                </Label>
                <Input 
                  type="number" 
                  min={0} 
                  max={10}
                  value={draftCols} 
                  onChange={(e) => setDraftCols(Math.max(0, Number(e.target.value)))}
                  className="h-9 text-sm font-bold text-center"
                />
              </div>
            </div>
          </div>

          {/* ========== 4. Interactive Grid Preview ========== */}
          <div className="space-y-3 p-4 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                Live Preview
              </Label>
              <span className="text-[9px] font-mono text-indigo-500">
                {previewRows}×{previewCols} = {totalCells} cells
                {emptyCells > 0 && <span className="text-amber-500 ml-1">({emptyCells} empty)</span>}
              </span>
            </div>

            <div 
              className="grid gap-1.5 p-3 bg-neutral-200/50 dark:bg-black/20 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700"
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
                          ? 'bg-blue-400/60 border-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.3)] text-white'
                          : 'bg-emerald-400/40 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-transparent border-neutral-300 dark:border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {isOccupied ? (isMain ? 'M' : `V${i + 1}`) : ''}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-400/60 border border-blue-500" />
                <span className="text-[9px] text-neutral-500">Main View</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-400/40 border border-emerald-500/50" />
                <span className="text-[9px] text-neutral-500">Aug Views</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
                <span className="text-[9px] text-neutral-500">Empty</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🌟 底部按钮：Cancel + Confirm */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex justify-end gap-3">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6">
            Apply Layout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}