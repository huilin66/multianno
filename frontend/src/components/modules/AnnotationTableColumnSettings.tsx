import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Eye, EyeOff, GripVertical, RotateCcw, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

export type AnnotationTableColumnKey =
  | 'row'
  | 'id'
  | 'label'
  | 'type'
  | 'boxWidth'
  | 'boxHeight'
  | 'text'
  | 'groupId'
  | 'trackId'
  | 'points'
  | 'attributes'
  | 'stem'
  | 'imageName'
  | 'imageWidth'
  | 'imageHeight'
  | 'latitude'
  | 'longitude'
  | 'altitude'
  | 'heading'
  | 'utc'
  | 'overlap'
  | 'action';

export const DEFAULT_COLUMN_WIDTHS: Record<AnnotationTableColumnKey, number> = {
  row: 48,
  id: 64,
  label: 104,
  type: 80,
  boxWidth: 64,
  boxHeight: 64,
  text: 220,
  groupId: 128,
  trackId: 144,
  points: 80,
  attributes: 220,
  stem: 220,
  imageName: 220,
  imageWidth: 112,
  imageHeight: 112,
  latitude: 128,
  longitude: 128,
  altitude: 128,
  heading: 128,
  utc: 220,
  overlap: 160,
  action: 48,
};

export const MIN_COLUMN_WIDTHS: Record<AnnotationTableColumnKey, number> = {
  row: 40,
  id: 44,
  label: 72,
  type: 64,
  boxWidth: 48,
  boxHeight: 48,
  text: 160,
  groupId: 96,
  trackId: 96,
  points: 64,
  attributes: 160,
  stem: 160,
  imageName: 160,
  imageWidth: 88,
  imageHeight: 88,
  latitude: 96,
  longitude: 96,
  altitude: 96,
  heading: 96,
  utc: 160,
  overlap: 112,
  action: 40,
};

export const DEFAULT_COLUMN_ORDER: AnnotationTableColumnKey[] = [
  'row', 'id', 'label', 'type', 'boxWidth', 'boxHeight', 'text',
  'groupId', 'trackId', 'points', 'attributes', 'stem',
  'imageName', 'imageWidth', 'imageHeight', 'latitude', 'longitude',
  'altitude', 'heading', 'utc', 'overlap', 'action',
];

export const SCENE_GROUP_INFO_COLUMNS: AnnotationTableColumnKey[] = [
  'imageName', 'imageWidth', 'imageHeight', 'latitude', 'longitude',
  'altitude', 'heading', 'utc',
];

interface AnnotationTableColumnSettingsProps {
  isLoaded: boolean;
  columnSettingsKeys: AnnotationTableColumnKey[];
  visibleColumnKeys: AnnotationTableColumnKey[];
  columnWidths: Record<AnnotationTableColumnKey, number>;
  hiddenColumns: Set<AnnotationTableColumnKey>;
  onColumnWidthChange: (key: AnnotationTableColumnKey, width: number) => void;
  onToggleColumnVisibility: (key: AnnotationTableColumnKey) => void;
  onMoveColumn: (key: AnnotationTableColumnKey, direction: 'up' | 'down') => void;
  onMoveColumnToEdge: (key: AnnotationTableColumnKey, edge: 'first' | 'last') => void;
  onResetColumnOrder: () => void;
  onResetColumnWidths: () => void;
  onColumnDragStart: (event: React.DragEvent, key: AnnotationTableColumnKey) => void;
  onColumnDrop: (event: React.DragEvent, key: AnnotationTableColumnKey) => void;
}

export const AnnotationTableColumnSettings = React.memo(function AnnotationTableColumnSettings({
  isLoaded,
  columnSettingsKeys,
  visibleColumnKeys,
  columnWidths,
  hiddenColumns,
  onColumnWidthChange,
  onToggleColumnVisibility,
  onMoveColumn,
  onMoveColumnToEdge,
  onResetColumnOrder,
  onResetColumnWidths,
  onColumnDragStart,
  onColumnDrop,
}: AnnotationTableColumnSettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [columnWidthDrafts, setColumnWidthDrafts] = useState<Partial<Record<AnnotationTableColumnKey, string>>>(() => (
    Object.fromEntries(
      Object.entries(DEFAULT_COLUMN_WIDTHS).map(([key, value]) => [key, String(value)]),
    ) as Partial<Record<AnnotationTableColumnKey, string>>
  ));

  const getColumnWidth = (key: AnnotationTableColumnKey) => (
    key === 'row' ? DEFAULT_COLUMN_WIDTHS.row : columnWidths[key]
  );

  const getColumnLabel = (key: AnnotationTableColumnKey) => {
    switch (key) {
      case 'row': return '#';
      case 'id': return t('taxonomyDashboard.annotationIdShort', 'ID');
      case 'label': return t('taxonomyDashboard.classNameShort', 'Class');
      case 'type': return t('taxonomyDashboard.annotationTypeShort', 'Type');
      case 'boxWidth': return t('taxonomyDashboard.boxWidthShort', 'Box W');
      case 'boxHeight': return t('taxonomyDashboard.boxHeightShort', 'Box H');
      case 'text': return t('taxonomyDashboard.annotationText', 'Text');
      case 'groupId': return t('taxonomyDashboard.annotationGroupId', 'Group ID');
      case 'trackId': return t('taxonomyDashboard.annotationTrackId', 'Track ID');
      case 'points': return t('taxonomyDashboard.annotationPoints', 'Points');
      case 'attributes': return t('taxonomyDashboard.annotationAttributes', 'Attributes');
      case 'stem': return t('taxonomyDashboard.sceneGroup', 'Scene Group');
      case 'imageName': return t('sceneGroupManager.imageName', 'Image');
      case 'imageWidth': return t('sceneGroupManager.imageWidth', 'Image width');
      case 'imageHeight': return t('sceneGroupManager.imageHeight', 'Image height');
      case 'latitude': return t('sceneGroupManager.latitude', 'Latitude');
      case 'longitude': return t('sceneGroupManager.longitude', 'Longitude');
      case 'altitude': return t('sceneGroupManager.height', 'Height / Altitude');
      case 'heading': return t('sceneGroupManager.heading', 'Heading');
      case 'utc': return t('sceneGroupManager.utc', 'UTC');
      case 'overlap': return t('taxonomyDashboard.overlapGroup', 'Overlap group');
      case 'action': return t('taxonomyDashboard.openAnnotation', 'Open annotation');
      default: return key;
    }
  };

  useEffect(() => {
    if (!open) return;
    setColumnWidthDrafts(Object.fromEntries(
      DEFAULT_COLUMN_ORDER.map((key) => [key, String(getColumnWidth(key))]),
    ));
  }, [open, columnWidths]);

  const commitColumnWidth = (key: AnnotationTableColumnKey) => {
    if (key === 'row') return;
    const draft = columnWidthDrafts[key] ?? String(getColumnWidth(key));
    const parsed = Number(draft);
    const nextWidth = Number.isFinite(parsed) && parsed > 0
      ? Math.max(MIN_COLUMN_WIDTHS[key], Math.round(parsed))
      : getColumnWidth(key);
    onColumnWidthChange(key, nextWidth);
    setColumnWidthDrafts((current) => ({ ...current, [key]: String(nextWidth) }));
  };

  return (
    <>
      <Button
        type="button"
        variant={open ? 'secondary' : 'outline'}
        className="h-9 px-3 text-xs"
        onClick={() => setOpen(true)}
        disabled={!isLoaded}
        title={t('taxonomyDashboard.manageColumns', 'Manage columns')}
      >
        <Settings2 className="mr-1.5 h-3.5 w-3.5" />
        {t('taxonomyDashboard.columnSettings', 'Columns Settings')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-none"
          style={{ width: '600px', maxWidth: 'calc(100vw - 32px)' }}
          disableBackdropBlur
        >
          <DialogHeader>
            <DialogTitle>{t('taxonomyDashboard.columnOrder', 'Column order')}</DialogTitle>
          </DialogHeader>
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 text-[10px] font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <span>{t('taxonomyDashboard.column', 'Column')}</span>
            <span>{t('taxonomyDashboard.columnWidth', 'Width')}</span>
            <span>{t('taxonomyDashboard.columnVisibility', 'Visible')}</span>
            <span>{t('taxonomyDashboard.columnOrderActions', 'Order')}</span>
          </div>
          <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {columnSettingsKeys.map((key) => {
              const isFixed = key === 'row';
              const isHidden = hiddenColumns.has(key);
              const movableKeys: AnnotationTableColumnKey[] = visibleColumnKeys.filter((columnKey) => columnKey !== 'row');
              const movableIndex = movableKeys.indexOf(key);
              const canMove = !isFixed && !isHidden && movableIndex >= 0;
              const isFirst = !canMove || movableIndex === 0;
              const isLast = !canMove || movableIndex === movableKeys.length - 1;

              return (
                <div
                  key={key}
                  draggable={!isFixed && !isHidden}
                  onDragStart={isFixed || isHidden ? undefined : (event) => onColumnDragStart(event, key)}
                  onDragOver={isFixed || isHidden ? undefined : (event) => event.preventDefault()}
                  onDrop={isFixed || isHidden ? undefined : (event) => onColumnDrop(event, key)}
                  className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-lg border px-3 py-1.5 text-sm ${isFixed
                    ? 'border-neutral-200 bg-neutral-100/70 dark:border-neutral-700 dark:bg-neutral-800/60'
                    : isHidden
                      ? 'border-dashed border-neutral-200 bg-neutral-50/70 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400'
                      : 'border-neutral-200 bg-white active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-900'}`}
                >
                  <div className={`flex min-w-0 items-center gap-2 ${!isFixed && !isHidden ? 'cursor-grab' : ''}`}>
                    <GripVertical className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                    <span className="truncate">{getColumnLabel(key)}</span>
                    {isFixed && <span className="text-[10px] text-neutral-400">{t('taxonomyDashboard.fixedColumn', 'Fixed')}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={MIN_COLUMN_WIDTHS[key]}
                      step="1"
                      value={columnWidthDrafts[key] ?? String(getColumnWidth(key))}
                      onChange={(event) => setColumnWidthDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      onBlur={() => commitColumnWidth(key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitColumnWidth(key);
                        }
                      }}
                      disabled={isFixed}
                      className="h-7 w-20 text-center text-xs"
                      aria-label={`${getColumnLabel(key)} ${t('taxonomyDashboard.columnWidth', 'width')}`}
                    />
                    <span className="text-[10px] text-neutral-400">px</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={isFixed}
                    onClick={() => onToggleColumnVisibility(key)}
                    title={isHidden
                      ? t('taxonomyDashboard.showColumn', 'Show column')
                      : t('taxonomyDashboard.hideColumn', 'Hide column')}
                    aria-label={isHidden
                      ? t('taxonomyDashboard.showColumn', 'Show column')
                      : t('taxonomyDashboard.hideColumn', 'Hide column')}
                  >
                    {isHidden
                      ? <EyeOff className="h-3.5 w-3.5" />
                      : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isFirst}
                      onClick={() => onMoveColumnToEdge(key, 'first')}
                      title={t('taxonomyDashboard.moveColumnFirst', 'Move to first')}
                      aria-label={t('taxonomyDashboard.moveColumnFirst', 'Move to first')}
                    >
                      <ChevronsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isFirst}
                      onClick={() => onMoveColumn(key, 'up')}
                      title={t('taxonomyDashboard.moveColumnUp', 'Move up')}
                      aria-label={t('taxonomyDashboard.moveColumnUp', 'Move up')}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isLast}
                      onClick={() => onMoveColumn(key, 'down')}
                      title={t('taxonomyDashboard.moveColumnDown', 'Move down')}
                      aria-label={t('taxonomyDashboard.moveColumnDown', 'Move down')}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isLast}
                      onClick={() => onMoveColumnToEdge(key, 'last')}
                      title={t('taxonomyDashboard.moveColumnLast', 'Move to last')}
                      aria-label={t('taxonomyDashboard.moveColumnLast', 'Move to last')}
                    >
                      <ChevronsDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-2 pt-3">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onResetColumnOrder}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('taxonomyDashboard.resetColumnOrder', 'Reset order')}
              </Button>
              <Button type="button" variant="outline" onClick={onResetColumnWidths}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('taxonomyDashboard.resetColumnWidths', 'Reset widths')}
              </Button>
            </div>
            <Button type="button" onClick={() => setOpen(false)}>
              {t('common.confirm', 'Confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
