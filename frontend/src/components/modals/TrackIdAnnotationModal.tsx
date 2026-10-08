import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CanvasView } from '../modules/annotation/CanvasView';
import { RightPanel, type RightPanelProps } from '../modules/annotation/RightPanel';
import { LeftToolbar } from '../modules/annotation/LeftToolbar';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Lock,
  Link2,
  Plus,
  Route,
  ScanLine,
  Sparkles,
  Unlink2,
  Unlock,
} from 'lucide-react';

interface TrackIdAnnotationModalProps {
  open: boolean;
  onClose: () => void;
  rightPanelProps: RightPanelProps;
  canvasProps: Record<string, any>;
}

interface FrameSlot {
  stem: string | null;
  offset: -1 | 0 | 1;
}

interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

const getTrackIdLabel = (value: string | number | null | undefined) => String(value ?? '').trim();

const parseTrackId = (value: string | number | null | undefined) => {
  const normalized = getTrackIdLabel(value);
  const separatorIndex = normalized.indexOf('-');
  if (separatorIndex < 0) return { mainId: normalized, partId: '' };
  return {
    mainId: normalized.slice(0, separatorIndex).trim(),
    partId: normalized.slice(separatorIndex + 1).trim(),
  };
};

const composeTrackId = (mainId: string, partId: string) => {
  const main = mainId.trim();
  const part = partId.trim();
  if (!main) return '';
  return part ? `${main}-${part}` : main;
};

function TrackIdFrameCanvas({
  slot,
  index,
  editable,
  canvasProps,
  t,
  fitRef,
  syncViewport,
  syncViewportEnabled,
}: {
  slot: FrameSlot;
  index: number;
  editable: boolean;
  canvasProps: Record<string, any>;
  t: (key: string, options?: any) => string;
  fitRef?: React.MutableRefObject<(() => void) | null>;
  syncViewport?: ViewportState;
  syncViewportEnabled?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = React.useState({
    width: Number(canvasProps.mainWidth) || 1024,
    height: Number(canvasProps.mainHeight) || 1024,
  });
  const [viewportOverride, setViewportOverride] = React.useState({ panX: 0, panY: 0, zoom: 1 });
  const view = canvasProps.view;

  const fitFrame = React.useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageSize.width || !imageSize.height) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 1 || height < 1) return;

    const padding = 18;
    const zoom = Math.min(
      Math.max(0.01, (width - padding) / imageSize.width),
      Math.max(0.01, (height - padding) / imageSize.height),
    );
    const nextViewport = {
      zoom,
      panX: (width - imageSize.width * zoom) / 2,
      panY: (height - imageSize.height * zoom) / 2,
    };
    setViewportOverride(nextViewport);
    if (editable && canvasProps.setViewport) {
      canvasProps.setViewport(nextViewport.zoom, nextViewport.panX, nextViewport.panY);
    }
  }, [imageSize.height, imageSize.width]);

  React.useEffect(() => {
    fitFrame();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fitFrame);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitFrame]);

  React.useEffect(() => {
    if (!editable || !fitRef) return;
    fitRef.current = fitFrame;
    return () => {
      if (fitRef.current === fitFrame) fitRef.current = null;
    };
  }, [editable, fitFrame, fitRef]);

  const isSynchronized = !editable && syncViewportEnabled && !!syncViewport;

  React.useEffect(() => {
    if (!isSynchronized || !syncViewport) return;
    // Keep the local fallback current so turning synchronization off does not
    // make the read-only frame jump back to its original fit-to-view state.
    setViewportOverride(syncViewport);
  }, [isSynchronized, syncViewport?.panX, syncViewport?.panY, syncViewport?.zoom]);

  if (!slot.stem || !view) {
    return (
      <div ref={containerRef} className="relative flex h-[min(52vh,520px)] min-h-[260px] items-center justify-center bg-neutral-100 dark:bg-neutral-900">
        <div className="text-center text-xs text-neutral-400">
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 dark:border-neutral-700">
            <Film className="h-5 w-5" />
          </div>
          {t('trackIdWindow.frameUnavailable')}
        </div>
      </div>
    );
  }

  const frameAnnotations = (canvasProps.annotations || []).filter((annotation: any) => annotation.stem === slot.stem);
  const frameClass = editable
    ? 'border-blue-300 ring-1 ring-blue-100 dark:border-blue-700 dark:ring-blue-950'
    : 'border-neutral-200 dark:border-neutral-800';
  const renderViewport = editable
    ? (canvasProps.viewport || viewportOverride)
    : (isSynchronized ? syncViewport! : viewportOverride);
  const handleWheel = editable && canvasProps.setViewport
    ? (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const currentViewport = canvasProps.viewport || renderViewport;
        const zoomFactor = 1.1;
        const newZoom = event.deltaY < 0 ? currentViewport.zoom * zoomFactor : currentViewport.zoom / zoomFactor;
        const rect = event.currentTarget.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const panX = mouseX - (mouseX - currentViewport.panX) * (newZoom / currentViewport.zoom);
        const panY = mouseY - (mouseY - currentViewport.panY) * (newZoom / currentViewport.zoom);
        canvasProps.setViewport(newZoom, panX, panY);
      }
    : undefined;
  const handleDoubleClick = editable && canvasProps.onDoubleClick && canvasProps.tool !== 'select'
    ? canvasProps.onDoubleClick
    : editable && canvasProps.setActiveAnnotationId
    ? (event: React.MouseEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left - renderViewport.panX) / renderViewport.zoom;
        const y = (event.clientY - rect.top - renderViewport.panY) / renderViewport.zoom;
        const target = [...frameAnnotations].reverse().find((annotation: any) => {
          const points = Array.isArray(annotation.points) ? annotation.points : [];
          if (points.length === 0) return false;
          const xs = points.map((point: any) => point.x);
          const ys = points.map((point: any) => point.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          return x >= minX && x <= maxX && y >= minY && y <= maxY;
        });
        canvasProps.setActiveAnnotationId(target?.id || null);
      }
    : undefined;

  return (
    <div ref={containerRef} className={`relative h-[min(52vh,520px)] min-h-[260px] overflow-hidden border-b bg-neutral-200 dark:bg-black ${frameClass}`}>
      <CanvasView
        {...canvasProps}
        view={view}
        currentStem={slot.stem}
        annotations={frameAnnotations}
        activeAnnotationId={editable ? canvasProps.activeAnnotationId : null}
        currentPoints={editable ? (canvasProps.currentPoints || []) : []}
        pendingAnnotation={editable ? canvasProps.pendingAnnotation : null}
        hoverPos={editable ? canvasProps.hoverPos : null}
        tool={editable ? (canvasProps.tool || 'select') : 'pan'}
        onMouseDown={editable ? canvasProps.onMouseDown : undefined}
        onMouseMove={editable && canvasProps.onMouseMove ? (event: React.MouseEvent) => canvasProps.onMouseMove(event, view.id) : undefined}
        onMouseUp={editable ? canvasProps.onMouseUp : undefined}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={editable && canvasProps.onMouseLeave ? () => canvasProps.onMouseLeave(view.id) : undefined}
        layerOrder={[view.id]}
        visibleLayers={{ [view.id]: true }}
        layerConfigs={{}}
        allViews={[view]}
        isSingleViewMode={false}
        showFullExtent={{}}
        cursorStyle="default"
        aiPrompts={[]}
        onWheel={handleWheel}
        viewportOverride={renderViewport}
        onImageLoaded={undefined}
        onImageDimensions={(size: { width: number; height: number }) => {
          if (size.width > 0 && size.height > 0) setImageSize(size);
        }}
      />
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-white/20">{index + 1}</span>
        <span>{t('trackIdWindow.objects', { count: frameAnnotations.length })}</span>
      </div>
    </div>
  );
}

function TrackIdEditor({
  t,
  trackIds,
  selectedTrackId,
  mainIdDraft,
  partIdDraft,
  setMainIdDraft,
  setPartIdDraft,
  selectTrackId,
  applyTrackId,
  activeAnnotation,
  activeSequence,
  setActiveSequence,
}: {
  t: (key: string, options?: any) => string;
  trackIds: string[];
  selectedTrackId: string | null;
  mainIdDraft: string;
  partIdDraft: string;
  setMainIdDraft: (value: string) => void;
  setPartIdDraft: (value: string) => void;
  selectTrackId: (value: string) => void;
  applyTrackId: () => void;
  activeAnnotation: any;
  activeSequence: number;
  setActiveSequence: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="min-h-0 overflow-y-auto custom-scrollbar">
      <div className="border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <Label className="block text-[10px] uppercase tracking-wider text-neutral-500">{t('trackIdWindow.trackId')}</Label>
        <div className="mt-1.5 flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-neutral-400">{t('trackIdWindow.mainId')}</span>
            <Input
              value={mainIdDraft}
              onChange={(event) => setMainIdDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyTrackId();
                }
              }}
              placeholder={t('trackIdWindow.mainIdPlaceholder')}
              className="h-8 min-w-0 text-xs"
              aria-label={t('trackIdWindow.mainId')}
            />
          </div>
          <span className="mb-2 text-xs font-semibold text-neutral-400">-</span>
          <div className="min-w-0 flex-1">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-neutral-400">{t('trackIdWindow.partId')}</span>
            <Input
              value={partIdDraft}
              onChange={(event) => setPartIdDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyTrackId();
                }
              }}
              placeholder={t('trackIdWindow.partIdPlaceholder')}
              className="h-8 min-w-0 text-xs"
              aria-label={t('trackIdWindow.partId')}
            />
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={applyTrackId}
            title={t('trackIdWindow.selectTrackId')}
            aria-label={t('trackIdWindow.selectTrackId')}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-neutral-400">
          {activeAnnotation ? `Selected object: ${activeAnnotation.label || 'object'}` : t('trackIdWindow.editorDescription')}
        </p>
      </div>

      <div className="border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t('trackIdWindow.existingTrackIds')}</span>
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{trackIds.length}</span>
        </div>
        <div className="max-h-28 space-y-1 overflow-auto">
          {trackIds.map((trackId) => (
            <button
              key={trackId}
              type="button"
              onClick={() => selectTrackId(trackId)}
              className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                selectedTrackId === trackId
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-transparent bg-neutral-50 text-neutral-600 hover:border-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              <span className="truncate">{trackId}</span>
              {selectedTrackId === trackId && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          {trackIds.length === 0 && <p className="py-2 text-[10px] text-neutral-400">{t('trackIdWindow.noTrackIds')}</p>}
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">{t('trackIdWindow.sequence')}</h3>
            <p className="mt-1 text-[10px] text-neutral-500">{t('trackIdWindow.sequenceDescription')}</p>
          </div>
          <Button type="button" size="icon-xs" variant="outline" onClick={() => setActiveSequence((value) => value + 1)} title={t('trackIdWindow.addSequence')}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t('trackIdWindow.sequenceNumber', { count: activeSequence })}</span>
            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">{selectedTrackId || composeTrackId(mainIdDraft, partIdDraft) || t('trackIdWindow.unassigned')}</span>
          </div>

          <div className="mt-3 space-y-2">
            <div className="rounded-md border border-white/80 bg-white/80 p-2 dark:border-neutral-800 dark:bg-neutral-900/70">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-200">{t('trackIdWindow.startCandidate')}</span>
                <Button type="button" size="icon-xs" variant="ghost" title={t('trackIdWindow.lock')} aria-label={t('trackIdWindow.lock')}><Unlock className="h-3.5 w-3.5 text-neutral-400" /></Button>
              </div>
              <p className="mt-1 truncate text-[10px] text-neutral-500">{activeAnnotation?.stem || t('trackIdWindow.notSelected')}</p>
            </div>
            <div className="rounded-md border border-white/80 bg-white/80 p-2 dark:border-neutral-800 dark:bg-neutral-900/70">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-200">{t('trackIdWindow.endCandidate')}</span>
                <Button type="button" size="icon-xs" variant="ghost" title={t('trackIdWindow.lock')} aria-label={t('trackIdWindow.lock')}><Lock className="h-3.5 w-3.5 text-neutral-400" /></Button>
              </div>
              <p className="mt-1 truncate text-[10px] text-neutral-500">{activeAnnotation?.stem || t('trackIdWindow.notSelected')}</p>
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" className="mt-3 w-full text-[10px]" disabled>
            <Sparkles className="h-3.5 w-3.5" />
            {t('trackIdWindow.interpolateReid')}
          </Button>
        </div>

        <div className="rounded-md border border-dashed border-neutral-300 p-3 text-[10px] leading-5 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{t('trackIdWindow.scaffoldNotice')}</div>
      </div>
    </div>
  );
}

export function TrackIdAnnotationModal({ open, onClose, rightPanelProps, canvasProps }: TrackIdAnnotationModalProps) {
  const { t } = useTranslation();
  const {
    stems = [], currentStem, setCurrentStem, annotations = [], views = [], folders = [], activeAnnotationId, updateAnnotation,
    viewport, setViewport,
  } = useStore() as any;

  const [mainIdDraft, setMainIdDraft] = React.useState('');
  const [partIdDraft, setPartIdDraft] = React.useState('');
  const [selectedTrackId, setSelectedTrackId] = React.useState<string | null>(null);
  const [activeSequence, setActiveSequence] = React.useState(1);
  const [syncFrames, setSyncFrames] = React.useState(true);
  const centerFitRef = React.useRef<(() => void) | null>(null);
  const previousViewportRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!open) return;
    previousViewportRef.current = viewport;
    return () => {
      const previousViewport = previousViewportRef.current;
      if (previousViewport && setViewport) {
        setViewport(previousViewport.zoom, previousViewport.panX, previousViewport.panY);
      }
      previousViewportRef.current = null;
    };
  }, [open, setViewport]);

  const currentIndex = currentStem ? stems.indexOf(currentStem) : -1;
  const mainView = views.find((view: any) => view.isMain) || views[0];
  const mainFolder = folders.find((folder: any) => folder.id === mainView?.folderId);
  const activeAnnotation = annotations.find((annotation: any) => annotation.id === activeAnnotationId) || null;

  const trackIds = React.useMemo(() => {
    const values = (annotations as any[]).map((annotation) => getTrackIdLabel(annotation.track_id)).filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [annotations]);

  const frameSlots = React.useMemo<FrameSlot[]>(() => [-1, 0, 1].map((offset) => ({
    offset: offset as FrameSlot['offset'],
    stem: currentIndex >= 0 ? stems[currentIndex + offset] || null : null,
  })), [currentIndex, stems]);

  React.useEffect(() => {
    if (!open) return;
    const parsed = parseTrackId(getTrackIdLabel(activeAnnotation?.track_id) || selectedTrackId || trackIds[0] || '');
    setMainIdDraft(parsed.mainId);
    setPartIdDraft(parsed.partId);
  }, [activeAnnotation?.track_id, open, selectedTrackId, trackIds]);

  const selectTrackId = (value: string) => {
    setSelectedTrackId(value);
    const parsed = parseTrackId(value);
    setMainIdDraft(parsed.mainId);
    setPartIdDraft(parsed.partId);
  };

  const applyTrackId = () => {
    const value = composeTrackId(mainIdDraft, partIdDraft);
    setSelectedTrackId(value || null);
    if (activeAnnotation && value) updateAnnotation(activeAnnotation.id, { track_id: value });
  };

  const jumpToStem = (stem: string | null) => {
    if (stem) setCurrentStem(stem);
  };

  const editor = (
    <TrackIdEditor
      t={t}
      trackIds={trackIds}
      selectedTrackId={selectedTrackId}
      mainIdDraft={mainIdDraft}
      partIdDraft={partIdDraft}
      setMainIdDraft={setMainIdDraft}
      setPartIdDraft={setPartIdDraft}
      selectTrackId={selectTrackId}
      applyTrackId={applyTrackId}
      activeAnnotation={activeAnnotation}
      activeSequence={activeSequence}
      setActiveSequence={setActiveSequence}
    />
  );

  const centerToolbar = (
    <LeftToolbar
      tool={canvasProps.tool || 'select'}
      hasPrev={currentIndex > 0}
      hasNext={currentIndex >= 0 && currentIndex < stems.length - 1}
      canUndo={!!canvasProps.canUndo}
      canRedo={!!canvasProps.canRedo}
      canCopy={!!activeAnnotationId}
      canPaste={!!canvasProps.canPaste}
      setTool={canvasProps.setTool || (() => undefined)}
      onHomeClick={() => centerFitRef.current?.()}
      handlePrevStem={canvasProps.handlePrevStem || (() => undefined)}
      handleNextStem={canvasProps.handleNextStem || (() => undefined)}
      handleUndo={canvasProps.handleUndo || (() => undefined)}
      handleRedo={canvasProps.handleRedo || (() => undefined)}
      handleCopy={canvasProps.handleCopy || (() => undefined)}
      handlePaste={canvasProps.handlePaste || (() => undefined)}
      handleDelete={canvasProps.handleDelete || (() => undefined)}
      handleClear={canvasProps.handleClear || (() => undefined)}
      handleSave={canvasProps.handleSave || (() => undefined)}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex h-[min(92vh,900px)] max-h-[min(92vh,900px)] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden border-neutral-200 p-0 dark:border-neutral-800 sm:max-w-[95vw]" showCloseButton>
        <DialogHeader className="shrink-0 border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold"><Route className="h-4 w-4 text-blue-500" />{t('trackIdWindow.title')}</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('trackIdWindow.description')}</DialogDescription>
            </div>
            <div className="flex min-w-0 max-w-full shrink-0 items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              <ScanLine className="h-3.5 w-3.5" /><span>{t('trackIdWindow.singleModality')}</span><span className="text-blue-400">·</span>
              <span className="max-w-[24rem] truncate" title={mainFolder?.path || undefined}>{mainFolder?.path || t('trackIdWindow.noFolder')}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden bg-neutral-50/70 dark:bg-neutral-950/50">
          <section className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 dark:border-neutral-800">
            <div className="flex min-h-0 flex-1">
              <div className="relative shrink-0">{centerToolbar}</div>
              <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{t('trackIdWindow.mainScene')}</div><div className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100" title={currentStem || undefined}>{currentStem || t('trackIdWindow.noCurrentScene')}</div></div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={syncFrames ? 'default' : 'outline'}
                  className="h-7 gap-1.5 px-2 text-[10px]"
                  onClick={() => setSyncFrames((value) => !value)}
                  aria-pressed={syncFrames}
                  title={t(syncFrames ? 'trackIdWindow.syncViewsOn' : 'trackIdWindow.syncViewsOff')}
                >
                  {syncFrames ? <Link2 className="h-3.5 w-3.5" /> : <Unlink2 className="h-3.5 w-3.5" />}
                  {t('trackIdWindow.syncViews')}
                </Button>
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{t('trackIdWindow.frameNavigationHint')}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="grid min-w-[900px] grid-cols-3 gap-3">
                {frameSlots.map((slot, index) => {
                  const editable = slot.offset === 0;
                  return (
                    <article key={`${slot.offset}-${slot.stem || 'empty'}`} className={`overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-neutral-900 ${editable ? 'border-blue-300 ring-1 ring-blue-100 dark:border-blue-700 dark:ring-blue-950' : 'border-neutral-200 dark:border-neutral-800'}`}>
                      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800"><div className="flex min-w-0 items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-100 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{index + 1}</span><span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">{slot.offset === -1 ? t('trackIdWindow.frameOne') : slot.offset === 0 ? t('trackIdWindow.frameTwo') : t('trackIdWindow.frameThree')}</span></div><span className={`shrink-0 text-[10px] ${editable ? 'text-blue-600 dark:text-blue-300' : 'text-neutral-400'}`}>{editable ? t('trackIdWindow.editable') : t('trackIdWindow.readOnly')}</span></div>
                      <div
                        role="button"
                        tabIndex={slot.stem ? 0 : -1}
                        aria-disabled={!slot.stem}
                        onClick={() => jumpToStem(slot.stem)}
                        onKeyDown={(event) => {
                          if (slot.stem && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            jumpToStem(slot.stem);
                          }
                        }}
                        className="block w-full text-left aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                        title={slot.stem ? t('trackIdWindow.jumpToFrame') : undefined}
                      >
                        <TrackIdFrameCanvas
                          slot={slot}
                          index={index}
                          editable={editable}
                          canvasProps={canvasProps}
                          t={t}
                          fitRef={editable ? centerFitRef : undefined}
                          syncViewport={canvasProps.viewport}
                          syncViewportEnabled={syncFrames}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2 text-[10px] dark:border-neutral-800"><span className="truncate text-neutral-500" title={slot.stem || undefined}>{slot.stem || t('trackIdWindow.frameUnavailable')}</span>{slot.offset === -1 && <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}{slot.offset === 1 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}</div>
                    </article>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/50"><div className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200"><Sparkles className="h-3.5 w-3.5 text-violet-500" />{t('trackIdWindow.processingPreview')}</div><p className="mt-1 text-[10px] leading-5 text-neutral-500 dark:text-neutral-400">{t('trackIdWindow.processingPreviewDescription')}</p></div>
            </div>

            <div className="shrink-0 border-t border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950"><div className="mb-1.5 flex items-center justify-between text-[10px] text-neutral-500"><span>{t('trackIdWindow.filmstrip')}</span><span>{currentIndex >= 0 ? `${currentIndex + 1}/${stems.length}` : `0/${stems.length}`}</span></div><div className="flex gap-1.5 overflow-x-auto pb-0.5">{stems.slice(Math.max(0, currentIndex - 5), Math.max(0, currentIndex - 5) + 11).map((stem: string) => <button type="button" key={stem} onClick={() => jumpToStem(stem)} className={`h-9 min-w-16 max-w-28 shrink-0 truncate rounded border px-1.5 text-[9px] transition-colors ${stem === currentStem ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-blue-300 hover:text-blue-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400'}`} title={stem}>{stem}</button>)}{stems.length === 0 && <span className="py-2 text-[10px] text-neutral-400">{t('trackIdWindow.noFrames')}</span>}</div></div>
              </div>
            </div>
          </section>

          <aside className="w-80 min-w-80 shrink-0 overflow-hidden bg-white dark:bg-neutral-950"><RightPanel {...rightPanelProps} readOnlyViewLayers trackIdMode trackIdEditor={editor} /></aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
