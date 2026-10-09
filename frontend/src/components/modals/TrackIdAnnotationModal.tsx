import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import {
  configureTrackIdReID,
  checkTrackIdReIDStatus,
  cancelTrackIdReID,
  getPreviewImageUrl,
  getTrackIdReIDJob,
  startTrackIdReID,
  type TrackIdReIDCandidate,
  type TrackIdReIDJob,
  type TrackIdReIDStatus,
} from '../../api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { OperationProgress } from '../ui/OperationProgress';
import { CanvasView } from '../modules/annotation/CanvasView';
import { RightPanel, type RightPanelProps } from '../modules/annotation/RightPanel';
import { LeftToolbar } from '../modules/annotation/LeftToolbar';
import { findTopmostAnnotationAtPoint } from '../../lib/annotationHitTest';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Film,
  Loader2,
  Link2,
  Link2Off,
  Plus,
  Settings2,
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
  role: 'previous' | 'current' | 'next' | 'start' | 'end';
}

interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

interface TrackIdViewPacket {
  view: Record<string, any> | null | undefined;
  interaction: {
    editable: boolean;
    synchronized: boolean;
    browsable: boolean;
  };
}

interface TrackCandidate {
  stem: string;
  annotationId: string;
  label?: string;
}

interface TrackIdReIDSettings {
  modelPath: string;
  minSimilarity: number;
  locationWeight: number;
  sameLabelOnly: boolean;
  batchSize: number;
}

interface TrackSequence {
  id: number;
  startCandidate: TrackCandidate | null;
  endCandidate: TrackCandidate | null;
  startLocked: boolean;
  endLocked: boolean;
}

interface PersistedTrackIdDraft {
  sequences: TrackSequence[];
  activeSequence: number;
  updatedAt: number;
}

type TrackIdDraftCache = Record<string, PersistedTrackIdDraft>;

const TRACK_ID_DRAFT_STORAGE_KEY = 'multianno.track-id-drafts.v1';
const TRACK_ID_DRAFT_MAX_ENTRIES = 200;
const TRACK_ID_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90;

const getTrackIdDraftProjectKey = (state: any) => JSON.stringify({
  meta: String(state.projectMetaPath || '').trim(),
  workspace: String(state.workspacePath || '').trim(),
  name: String(state.projectName || '').trim(),
});

const getTrackIdDraftKey = (projectKey: string, trackId: string) => `${projectKey}::${trackId || '__new__'}`;

const readTrackIdDraft = (projectKey: string, trackId: string): PersistedTrackIdDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TRACK_ID_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as TrackIdDraftCache;
    const draft = cache[getTrackIdDraftKey(projectKey, trackId)];
    if (!draft || !Array.isArray(draft.sequences)) return null;
    return draft;
  } catch {
    return null;
  }
};

const writeTrackIdDraft = (projectKey: string, trackId: string, draft: PersistedTrackIdDraft) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(TRACK_ID_DRAFT_STORAGE_KEY);
    const cache = raw ? (JSON.parse(raw) as TrackIdDraftCache) : {};
    const currentKey = getTrackIdDraftKey(projectKey, trackId);
    cache[currentKey] = draft;
    const cutoff = Date.now() - TRACK_ID_DRAFT_MAX_AGE_MS;
    const retainedEntries = Object.entries(cache)
      .filter(([key, value]) => (
        key === currentKey
        || (Number.isFinite(value?.updatedAt) && value.updatedAt >= cutoff)
      ))
      .sort(([, left], [, right]) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
      .slice(0, TRACK_ID_DRAFT_MAX_ENTRIES);
    window.localStorage.setItem(
      TRACK_ID_DRAFT_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(retainedEntries)),
    );
  } catch {
    // Local storage is an optional convenience; annotation edits must still work
    // when the browser blocks storage or the cache becomes unavailable.
  }
};

const validateTrackId = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return { value: '', error: 'required' as const };
  if (/\s/.test(normalized)) return { value: '', error: 'whitespace' as const };
  if (normalized.length > 128) return { value: '', error: 'tooLong' as const };
  return { value: normalized, error: null };
};

const createTrackSequence = (id: number): TrackSequence => ({
  id,
  startCandidate: null,
  endCandidate: null,
  startLocked: false,
  endLocked: false,
});

const createLocalReidProgress = (
  current: number,
  total: number,
  stageName: string,
  message: string,
): TrackIdReIDJob => ({
  job_id: 'local-collection',
  status: 'running',
  stage_index: 1,
  stage_count: 4,
  stage_name: stageName,
  current,
  total,
  percent: total > 0 ? Math.round((current / total) * 100) : 0,
  message,
  result: null,
  error: null,
});

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

const getFrameImagePath = (stem: string, canvasProps: Record<string, any>) => {
  const view = canvasProps.view;
  const folder = (canvasProps.folders || []).find((item: any) => item.id === view?.folderId);
  if (!folder?.path) return '';

  const exactFileName = canvasProps.sceneGroups?.[stem]?.[folder.path];
  const extension = folder.extension || '.tif';
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const fileName = exactFileName || `${stem}${folder.suffix || normalizedExtension}`;
  return `${String(folder.path).replace(/[\\/]+$/, '')}\\${fileName}`;
};

function TrackIdFrameCanvasInner({
  slot,
  index,
  viewPacket,
  canvasProps,
  t,
  fitRef,
  syncViewport,
  showTrackId,
  annotationsByStem,
  onTrackObjectDoubleClick,
}: {
  slot: FrameSlot;
  index: number;
  viewPacket: TrackIdViewPacket;
  canvasProps: Record<string, any>;
  t: (key: string, options?: any) => string;
  fitRef?: React.MutableRefObject<(() => void) | null>;
  syncViewport?: ViewportState;
  showTrackId: boolean;
  annotationsByStem: Map<string, any[]>;
  onTrackObjectDoubleClick?: (annotation: any, stem: string) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = React.useState({
    width: Number(canvasProps.mainWidth) || 1024,
    height: Number(canvasProps.mainHeight) || 1024,
  });
  const [viewportOverride, setViewportOverride] = React.useState({ panX: 0, panY: 0, zoom: 1 });
  const { view, interaction } = viewPacket;
  const { editable, synchronized } = interaction;
  const frameEditorSettings = React.useMemo(() => ({
    ...(canvasProps.editorSettings || {}),
    showTrackId,
  }), [canvasProps.editorSettings, showTrackId]);
  const frameTool = canvasProps.tool === 'ai_anno' && canvasProps.activeAITab !== 'semi'
    ? 'pan'
    : (canvasProps.tool || 'select');

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

  const isSynchronized = !editable && synchronized && !!syncViewport;

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

  const frameAnnotations = annotationsByStem.get(slot.stem) || [];
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
        const target = findTopmostAnnotationAtPoint(
          frameAnnotations,
          x,
          y,
          { tolerance: 8 / Math.max(renderViewport.zoom, 0.01) },
        );
        canvasProps.setActiveAnnotationId(target?.id || null);
        if (target) onTrackObjectDoubleClick?.(target, slot.stem);
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
        tool={editable ? frameTool : 'pan'}
        isPanning={editable ? !!canvasProps.isPanning : false}
        editorSettings={frameEditorSettings}
        mouseQuad={editable ? canvasProps.mouseQuad?.[view.id] : undefined}
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
        cursorStyle={editable ? (canvasProps.cursorStyle || 'default') : 'default'}
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

const TrackIdFrameCanvas = React.memo(TrackIdFrameCanvasInner, (previous, next) => {
  const previousCanvas = previous.canvasProps;
  const nextCanvas = next.canvasProps;
  const commonPropsEqual = (
    previous.slot.stem === next.slot.stem
    && previous.slot.role === next.slot.role
    && previous.showTrackId === next.showTrackId
    && previous.syncViewport === next.syncViewport
    && previous.viewPacket.view?.id === next.viewPacket.view?.id
    && previous.viewPacket.view === next.viewPacket.view
    && previous.annotationsByStem === next.annotationsByStem
    && previousCanvas.folders === nextCanvas.folders
    && previousCanvas.sceneGroups === nextCanvas.sceneGroups
    && previousCanvas.theme === nextCanvas.theme
    && previousCanvas.editorSettings === nextCanvas.editorSettings
    && previousCanvas.tempViewSettings === nextCanvas.tempViewSettings
    && previousCanvas.onMouseDown === nextCanvas.onMouseDown
    && previousCanvas.onMouseMove === nextCanvas.onMouseMove
    && previousCanvas.onMouseUp === nextCanvas.onMouseUp
    && previousCanvas.onDoubleClick === nextCanvas.onDoubleClick
    && previousCanvas.onMouseLeave === nextCanvas.onMouseLeave
  );
  if (!commonPropsEqual) return false;
  if (!previous.viewPacket.interaction.editable && !next.viewPacket.interaction.editable) return true;

  return (
    previousCanvas.viewport === nextCanvas.viewport
    && previousCanvas.activeAnnotationId === nextCanvas.activeAnnotationId
    && previousCanvas.currentPoints === nextCanvas.currentPoints
    && previousCanvas.pendingAnnotation === nextCanvas.pendingAnnotation
    && previousCanvas.hoverPos === nextCanvas.hoverPos
    && previousCanvas.isPanning === nextCanvas.isPanning
    && previousCanvas.mouseQuad === nextCanvas.mouseQuad
    && previousCanvas.cursorStyle === nextCanvas.cursorStyle
    && previousCanvas.tool === nextCanvas.tool
  );
});

const TrackFrameThumbnail = React.memo(function TrackFrameThumbnail({
  stem,
  current,
  canvasProps,
  onClick,
}: {
  key?: React.Key;
  stem: string;
  current: boolean;
  canvasProps: Record<string, any>;
  onClick: () => void;
}) {
  const view = canvasProps.view;
  const folder = (canvasProps.folders || []).find((item: any) => item.id === view?.folderId);
  const imageUrl = React.useMemo(() => {
    if (!view || !folder?.path) return '';
    const exactFileName = canvasProps.sceneGroups?.[stem]?.[folder.path];
    const extension = folder.extension || '.tif';
    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    const fileName = exactFileName || `${stem}${folder.suffix || normalizedExtension}`;
    return getPreviewImageUrl(
      folder.path,
      fileName,
      view.bands || [],
      view.colormap || 'gray',
      view.settings,
      folder.rawProfile,
    );
  }, [canvasProps.sceneGroups, folder, stem, view]);

  return (
    <button
      type="button"
      data-stem={stem}
      onClick={onClick}
      aria-current={current ? 'true' : undefined}
      className={`group relative h-14 min-w-24 max-w-32 shrink-0 overflow-hidden rounded border-2 text-left transition-colors ${
        current
          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/80 shadow-md shadow-blue-500/20 dark:border-blue-400 dark:bg-blue-950/70 dark:ring-blue-400/90 dark:shadow-blue-950'
          : 'border-neutral-300 hover:border-blue-400 dark:border-neutral-700 dark:hover:border-blue-500'
      }`}
      title={stem}
      aria-label={stem}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center bg-neutral-100 text-[9px] text-neutral-400 dark:bg-neutral-900">—</span>
      )}
      {current && <span className="pointer-events-none absolute left-1 top-1 z-10 h-2.5 w-2.5 rounded-full bg-blue-600 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] dark:bg-blue-300 dark:shadow-[0_0_0_2px_rgba(15,23,42,0.9)]" />}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[9px] text-white">{stem}</span>
    </button>
  );
}, (previous, next) => (
  previous.stem === next.stem
  && previous.current === next.current
  && previous.canvasProps.view === next.canvasProps.view
  && previous.canvasProps.folders === next.canvasProps.folders
  && previous.canvasProps.sceneGroups === next.canvasProps.sceneGroups
));

function TrackIdEditor({
  t,
  trackIds,
  selectedTrackId,
  mainIdDraft,
  partIdDraft,
  trackIdValidationError,
  setMainIdDraft,
  setPartIdDraft,
  selectTrackId,
  applyTrackId,
  activeAnnotation,
  activeSequence,
  sequences,
  setActiveSequence,
  onAddSequence,
  onToggleCandidateLock,
  reidStatus,
  reidRunning,
  reidProgress,
  reidMessage,
  reidSettings,
  onUpdateReidSettings,
  reidSettingsOpen,
  setReidSettingsOpen,
  reidPathDraft,
  setReidPathDraft,
  reidPathSaving,
  reidSettingsMessage,
  onConfirmReidPath,
  onRunReid,
}: {
  t: (key: string, options?: any) => string;
  trackIds: string[];
  selectedTrackId: string | null;
  mainIdDraft: string;
  partIdDraft: string;
  trackIdValidationError: string | null;
  setMainIdDraft: (value: string) => void;
  setPartIdDraft: (value: string) => void;
  selectTrackId: (value: string) => void;
  applyTrackId: (value?: string) => void;
  activeAnnotation: any;
  activeSequence: number;
  sequences: TrackSequence[];
  setActiveSequence: React.Dispatch<React.SetStateAction<number>>;
  onAddSequence: () => void;
  onToggleCandidateLock: (kind: 'start' | 'end', sequenceId?: number) => void;
  reidStatus: TrackIdReIDStatus | null;
  reidRunning: boolean;
  reidProgress: TrackIdReIDJob | null;
  reidMessage: string;
  reidSettings: TrackIdReIDSettings;
  onUpdateReidSettings: (settings: Partial<TrackIdReIDSettings>) => void;
  reidSettingsOpen: boolean;
  setReidSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  reidPathDraft: string;
  setReidPathDraft: (value: string) => void;
  reidPathSaving: boolean;
  reidSettingsMessage: string;
  onConfirmReidPath: () => void;
  onRunReid: () => void;
}) {
  const renderCandidate = (candidate: TrackCandidate | null) => candidate
    ? `${candidate.stem}${candidate.label ? ` · ${candidate.label}` : ''}`
    : t('trackIdWindow.none');
  const activeSequenceData = sequences.find((sequence) => sequence.id === activeSequence);
  const activeStartLocked = activeSequenceData?.startLocked ?? false;
  const activeEndLocked = activeSequenceData?.endLocked ?? false;
  const currentTrackId = selectedTrackId || composeTrackId(mainIdDraft, partIdDraft);

  return (
    <div className="min-h-0 overflow-y-auto custom-scrollbar">
      <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] uppercase tracking-wider text-neutral-500">{t('trackIdWindow.trackId')}</Label>
          <span className="min-w-0 truncate text-[10px] text-neutral-400" title={activeAnnotation?.label || undefined}>
            {activeAnnotation ? `${activeAnnotation.label || 'object'} · ${t('trackIdWindow.selected')}` : t('trackIdWindow.selectObject')}
          </span>
        </div>
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
              className="h-7 min-w-0 text-[11px]"
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
              className="h-7 min-w-0 text-[11px]"
              aria-label={t('trackIdWindow.partId')}
            />
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => applyTrackId()}
            title={t('trackIdWindow.selectTrackId')}
            aria-label={t('trackIdWindow.selectTrackId')}
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
        {trackIdValidationError && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-red-500" role="alert">
            {trackIdValidationError}
          </p>
        )}
      </div>

      <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{t('trackIdWindow.existingTrackIdsShort')}</span>
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{trackIds.length}</span>
        </div>
        <div className="max-h-28 space-y-1 overflow-auto">
          {trackIds.map((trackId) => (
            <button
              key={trackId}
              type="button"
              onClick={() => selectTrackId(trackId)}
              onDoubleClick={() => applyTrackId(trackId)}
              title={t('trackIdWindow.assignTrackId')}
              className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-[10px] transition-colors ${
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

      <div className="space-y-2.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-200">{t('trackIdWindow.sequence')}</h3>
            <span className="min-w-0 max-w-36 truncate rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" title={selectedTrackId || composeTrackId(mainIdDraft, partIdDraft) || undefined}>
              {selectedTrackId || composeTrackId(mainIdDraft, partIdDraft) || t('trackIdWindow.none')}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50/60 p-2 dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="space-y-1">
            {sequences.map((sequence) => {
              const isActive = sequence.id === activeSequence;
              const canUseCurrentObject = isActive && !!activeAnnotation;
              return (
                <div
                  key={sequence.id}
                  className={`flex min-w-0 items-center gap-1 rounded-md border px-1 py-1 ${
                    isActive
                      ? 'border-blue-300 bg-white/90 dark:border-blue-700 dark:bg-neutral-900/90'
                      : 'border-transparent bg-white/50 dark:bg-neutral-900/40'
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                    onClick={() => setActiveSequence(sequence.id)}
                    title={t('trackIdWindow.selectSequence')}
                    aria-pressed={isActive}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10px] font-semibold text-white dark:bg-blue-500">{sequence.id}</span>
                    <ArrowLeftToLine className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-600 dark:text-neutral-300" title={sequence.startCandidate?.stem}>
                      {renderCandidate(sequence.startCandidate)}
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0"
                    disabled={!sequence.startCandidate && !canUseCurrentObject}
                    onClick={() => onToggleCandidateLock('start', sequence.id)}
                    title={t(sequence.startLocked ? 'trackIdWindow.unlock' : 'trackIdWindow.lock')}
                    aria-label={t(sequence.startLocked ? 'trackIdWindow.unlock' : 'trackIdWindow.lock')}
                    aria-pressed={sequence.startLocked}
                  >
                    {sequence.startLocked ? <Link2 className="h-3.5 w-3.5 text-blue-500" /> : <Link2Off className="h-3.5 w-3.5 text-neutral-400" />}
                  </Button>
                  <span className="shrink-0 text-[10px] text-neutral-300 dark:text-neutral-600" aria-hidden="true">|</span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0"
                    disabled={!sequence.endCandidate && !canUseCurrentObject}
                    onClick={() => onToggleCandidateLock('end', sequence.id)}
                    title={t(sequence.endLocked ? 'trackIdWindow.unlock' : 'trackIdWindow.lock')}
                    aria-label={t(sequence.endLocked ? 'trackIdWindow.unlock' : 'trackIdWindow.lock')}
                    aria-pressed={sequence.endLocked}
                  >
                    {sequence.endLocked ? <Link2 className="h-3.5 w-3.5 text-blue-500" /> : <Link2Off className="h-3.5 w-3.5 text-neutral-400" />}
                  </Button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                    onClick={() => setActiveSequence(sequence.id)}
                    title={t('trackIdWindow.selectSequence')}
                    aria-pressed={isActive}
                  >
                    <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-600 dark:text-neutral-300" title={sequence.endCandidate?.stem}>
                      {renderCandidate(sequence.endCandidate)}
                    </span>
                    <ArrowRightToLine className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-6 w-full justify-center border-blue-200 bg-white/50 px-0 text-blue-600 hover:bg-white hover:text-blue-700 dark:border-blue-900/60 dark:bg-neutral-900/40 dark:hover:bg-neutral-900 dark:hover:text-blue-300"
              onClick={onAddSequence}
              title={t('trackIdWindow.addSequence')}
              aria-label={t('trackIdWindow.addSequence')}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-neutral-500">
            <span
              className={`min-w-0 truncate font-semibold ${reidStatus?.runtime_available && reidStatus.configured && reidStatus.model_exists ? 'text-emerald-600' : 'text-amber-600'}`}
              title={reidStatus?.detail || undefined}
            >
              {reidStatus?.runtime_available && reidStatus.configured && reidStatus.model_exists
                ? t('trackIdWindow.reidReady')
                : t('trackIdWindow.reidUnavailable')}
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant={reidSettingsOpen ? 'secondary' : 'ghost'}
              className="shrink-0"
              onClick={() => setReidSettingsOpen((open) => !open)}
              title={t('trackIdWindow.reidSettings')}
              aria-label={t('trackIdWindow.reidSettings')}
              aria-expanded={reidSettingsOpen}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {reidSettingsOpen && (
            <div className="mt-2 space-y-2 rounded-md border border-neutral-200 bg-white/80 p-2 dark:border-neutral-700 dark:bg-neutral-900/80">
              <div>
                <Label className="text-[9px] uppercase tracking-wider text-neutral-400">{t('trackIdWindow.reidModelPath')}</Label>
                <div className="mt-1 flex items-center gap-1">
                  <Input
                    value={reidPathDraft}
                    onChange={(event) => setReidPathDraft(event.target.value)}
                    className="h-7 min-w-0 flex-1 text-[10px]"
                    title={reidPathDraft || undefined}
                    aria-label={t('trackIdWindow.reidModelPath')}
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    onClick={onConfirmReidPath}
                    disabled={reidPathSaving}
                    title={t('trackIdWindow.confirmReidPath')}
                    aria-label={t('trackIdWindow.confirmReidPath')}
                  >
                    {reidPathSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[9px] uppercase tracking-wider text-neutral-400">{t('trackIdWindow.reidThreshold')}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={reidSettings.minSimilarity}
                    onChange={(event) => onUpdateReidSettings({ minSimilarity: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })}
                    className="mt-1 h-7 text-[10px]"
                    aria-label={t('trackIdWindow.reidThreshold')}
                  />
                </div>
                <div>
                  <Label className="text-[9px] uppercase tracking-wider text-neutral-400">{t('trackIdWindow.spatialWeight')}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={reidSettings.locationWeight}
                    onChange={(event) => onUpdateReidSettings({ locationWeight: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })}
                    className="mt-1 h-7 text-[10px]"
                    aria-label={t('trackIdWindow.spatialWeight')}
                  />
                </div>
                <div>
                  <Label className="text-[9px] uppercase tracking-wider text-neutral-400">{t('trackIdWindow.batchSize')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={64}
                    step={1}
                    value={reidSettings.batchSize ?? 8}
                    onChange={(event) => onUpdateReidSettings({ batchSize: Math.min(64, Math.max(1, Number(event.target.value) || 1)) })}
                    className="mt-1 h-7 text-[10px]"
                    aria-label={t('trackIdWindow.batchSize')}
                  />
                </div>
              </div>
              {reidSettingsMessage && <p className="text-[10px] leading-relaxed text-neutral-500">{reidSettingsMessage}</p>}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 h-7 w-full text-[10px]"
            disabled={
              reidRunning
              || !reidStatus?.runtime_available
              || !reidStatus.configured
              || !reidStatus.model_exists
              || !currentTrackId
              || !activeStartLocked
              || !activeEndLocked
            }
            onClick={onRunReid}
          >
            {reidRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {reidRunning ? t('trackIdWindow.reidRunning') : t('trackIdWindow.autoTrack')}
          </Button>
          {reidProgress && (reidRunning || reidProgress.status === 'completed' || reidProgress.status === 'failed' || reidProgress.status === 'cancelled') && (
            <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/50 p-2 dark:border-blue-900/50 dark:bg-blue-950/20">
              <OperationProgress
                stageIndex={reidProgress.stage_index}
                stageCount={reidProgress.stage_count}
                stageName={reidProgress.stage_name}
                current={reidProgress.current}
                total={reidProgress.total}
                stageLabel={t('common.stage')}
              />
              {reidProgress.message && (
                <p className="mt-1 truncate text-[9px] text-neutral-500" title={reidProgress.message}>
                  {reidProgress.message}
                </p>
              )}
            </div>
          )}
          {reidMessage && <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">{reidMessage}</p>}
        </div>
      </div>
    </div>
  );
}

export function TrackIdAnnotationModal({ open, onClose, rightPanelProps, canvasProps }: TrackIdAnnotationModalProps) {
  const { t } = useTranslation();
  const stems = useStore((state) => state.stems);
  const currentStem = useStore((state) => state.currentStem);
  const setCurrentStem = useStore((state) => state.setCurrentStem);
  const annotations = useStore((state) => state.annotations);
  const activeAnnotationId = useStore((state) => state.activeAnnotationId);
  const setActiveAnnotationId = useStore((state) => state.setActiveAnnotationId);
  const updateAnnotation = useStore((state) => state.updateAnnotation);
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const trackIdReIDSettings = useStore((state) => state.trackIdReIDSettings);
  const setTrackIdReIDSettings = useStore((state) => state.setTrackIdReIDSettings);
  const projectName = useStore((state) => state.projectName);
  const projectMetaPath = useStore((state) => state.projectMetaPath);
  const workspacePath = useStore((state) => state.workspacePath);

  const [mainIdDraft, setMainIdDraft] = React.useState('');
  const [partIdDraft, setPartIdDraft] = React.useState('');
  const [trackIdValidationError, setTrackIdValidationError] = React.useState<'required' | 'whitespace' | 'tooLong' | null>(null);
  const [selectedTrackId, setSelectedTrackId] = React.useState<string | null>(null);
  const [manualTrackIds, setManualTrackIds] = React.useState<string[]>([]);
  const [activeSequence, setActiveSequence] = React.useState(1);
  const [sequences, setSequences] = React.useState<TrackSequence[]>([createTrackSequence(1)]);
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(true);
  const [rightPanelOpen, setRightPanelOpen] = React.useState(true);
  const [syncFrames, setSyncFrames] = React.useState(true);
  const [showTrackIds, setShowTrackIds] = React.useState(true);
  const [frameContextMode, setFrameContextMode] = React.useState<'locked' | 'adjacent'>('locked');
  const [verticalFrameLayout, setVerticalFrameLayout] = React.useState(false);
  const [reidStatus, setReidStatus] = React.useState<TrackIdReIDStatus | null>(null);
  const [reidRunning, setReidRunning] = React.useState(false);
  const [reidProgress, setReidProgress] = React.useState<TrackIdReIDJob | null>(null);
  const [reidMessage, setReidMessage] = React.useState('');
  const [reidSettingsOpen, setReidSettingsOpen] = React.useState(false);
  const [reidPathDraft, setReidPathDraft] = React.useState('');
  const [reidPathSaving, setReidPathSaving] = React.useState(false);
  const [reidSettingsMessage, setReidSettingsMessage] = React.useState('');
  const centerFitRef = React.useRef<(() => void) | null>(null);
  const previousViewportRef = React.useRef<any>(null);
  const previousCurrentStemRef = React.useRef<string | null>(null);
  const previousActiveAnnotationIdRef = React.useRef<string | null>(null);
  const draftHydrationRef = React.useRef<{ key: string; signature: string } | null>(null);
  const previousDraftProjectKeyRef = React.useRef<string | null>(null);
  const reidAbortControllerRef = React.useRef<AbortController | null>(null);
  const reidJobIdRef = React.useRef<string | null>(null);
  const reidRunTokenRef = React.useRef(0);

  const draftProjectKey = React.useMemo(() => getTrackIdDraftProjectKey({
    projectMetaPath,
    workspacePath,
    projectName,
  }), [projectMetaPath, projectName, workspacePath]);

  React.useEffect(() => {
    if (!open) return;
    const previousProjectKey = previousDraftProjectKeyRef.current;
    if (previousProjectKey && previousProjectKey !== draftProjectKey) {
      // The modal component stays mounted while projects are switched. Do not
      // carry a manually-created ID or the selected ID into the new project.
      setSelectedTrackId(null);
      setManualTrackIds([]);
      setMainIdDraft('');
      setPartIdDraft('');
      setTrackIdValidationError(null);
      setSequences([createTrackSequence(1)]);
      setActiveSequence(1);
    }
    previousDraftProjectKeyRef.current = draftProjectKey;
  }, [draftProjectKey, open]);

  React.useEffect(() => {
    if (!open) return;
    previousViewportRef.current = viewport;
    previousCurrentStemRef.current = currentStem;
    previousActiveAnnotationIdRef.current = activeAnnotationId;
    return () => {
      const restoreMainState = () => {
        const previousViewport = previousViewportRef.current;
        if (previousViewport && setViewport) {
          setViewport(previousViewport.zoom, previousViewport.panX, previousViewport.panY);
        }
        if (setCurrentStem) setCurrentStem(previousCurrentStemRef.current);
        if (setActiveAnnotationId) {
          const previousAnnotationId = previousActiveAnnotationIdRef.current;
          const previousAnnotation = useStore.getState().annotations.find((annotation) => annotation.id === previousAnnotationId);
          setActiveAnnotationId(previousAnnotation?.id || null);
        }
        previousViewportRef.current = null;
        previousCurrentStemRef.current = null;
        previousActiveAnnotationIdRef.current = null;
      };

      // Save the scene that is currently being edited before restoring the
      // scene from which the Track ID window was opened. Otherwise an edit on
      // a browsed frame could be saved against the wrong current scene.
      if (useStore.getState().isAnnotationDirty && rightPanelProps.handleSave) {
        void rightPanelProps.handleSave().finally(restoreMainState);
      } else {
        restoreMainState();
      }
    };
  }, [open, rightPanelProps.handleSave, setActiveAnnotationId, setCurrentStem, setViewport]);

  React.useEffect(() => {
    if (!open) return;
    setShowTrackIds(true);
    setReidProgress(null);
    setReidMessage('');
    setReidSettingsOpen(false);
    setReidSettingsMessage('');
    return () => {
      reidRunTokenRef.current += 1;
      const jobId = reidJobIdRef.current;
      if (jobId) void cancelTrackIdReID(jobId).catch(() => undefined);
      reidAbortControllerRef.current?.abort();
      reidAbortControllerRef.current = null;
      reidJobIdRef.current = null;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReidStatus(null);
    checkTrackIdReIDStatus().then((status) => {
      if (!cancelled) {
        setReidStatus(status);
        setReidPathDraft(trackIdReIDSettings?.modelPath || status.model_path || '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, trackIdReIDSettings?.modelPath]);

  const currentIndex = currentStem ? stems.indexOf(currentStem) : -1;
  const activeAnnotation = annotations.find((annotation: any) => annotation.id === activeAnnotationId) || null;
  const activeSequenceData = sequences.find((sequence) => sequence.id === activeSequence) || sequences[0] || createTrackSequence(1);
  const startCandidate = activeSequenceData.startCandidate;
  const endCandidate = activeSequenceData.endCandidate;
  const startLocked = activeSequenceData.startLocked;
  const endLocked = activeSequenceData.endLocked;

  const trackIds = React.useMemo(() => {
    const values = [
      ...(annotations as any[]).map((annotation) => getTrackIdLabel(annotation.track_id)),
      ...manualTrackIds,
    ].filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }, [annotations, manualTrackIds]);

  const annotationsByStem = React.useMemo(() => {
    const index = new Map<string, any[]>();
    annotations.forEach((annotation) => {
      const frameAnnotations = index.get(annotation.stem) || [];
      frameAnnotations.push(annotation);
      index.set(annotation.stem, frameAnnotations);
    });
    return index;
  }, [annotations]);

  const draftIdentity = React.useMemo(() => (
    selectedTrackId
    || getTrackIdLabel(activeAnnotation?.track_id)
    || (!activeAnnotation ? trackIds[0] || '' : '')
  ), [activeAnnotation?.track_id, selectedTrackId, trackIds]);
  const draftStorageKey = React.useMemo(
    () => getTrackIdDraftKey(draftProjectKey, draftIdentity),
    [draftIdentity, draftProjectKey],
  );

  React.useEffect(() => {
    if (!open) return;
    draftHydrationRef.current = null;
    const restored = readTrackIdDraft(draftProjectKey, draftIdentity);
    const restoredSequences = restored?.sequences
      ?.filter((sequence) => sequence && Number.isFinite(Number(sequence.id)))
      .map((sequence) => ({
        ...createTrackSequence(Number(sequence.id)),
        startCandidate: sequence.startCandidate || null,
        endCandidate: sequence.endCandidate || null,
        startLocked: Boolean(sequence.startLocked && sequence.startCandidate),
        endLocked: Boolean(sequence.endLocked && sequence.endCandidate),
      })) || [];
    const nextSequences = restoredSequences.length > 0 ? restoredSequences : [createTrackSequence(1)];
    const nextActiveSequence = restored?.activeSequence && nextSequences.some((sequence) => sequence.id === restored.activeSequence)
      ? restored.activeSequence
      : nextSequences[0].id;
    draftHydrationRef.current = {
      key: draftStorageKey,
      signature: JSON.stringify({ sequences: nextSequences, activeSequence: nextActiveSequence }),
    };
    setSequences(nextSequences);
    setActiveSequence(nextActiveSequence);
  }, [draftIdentity, draftProjectKey, draftStorageKey, open]);

  React.useEffect(() => {
    if (!open) return;
    const signature = JSON.stringify({ sequences, activeSequence });
    const pendingHydration = draftHydrationRef.current;
    if (pendingHydration?.key === draftStorageKey && pendingHydration.signature !== signature) {
      // The hydration effect has just replaced state. Wait for that state
      // update before writing, otherwise the old sequence could overwrite the
      // newly restored draft for one render.
      draftHydrationRef.current = null;
      return;
    }
    if (pendingHydration?.key === draftStorageKey) draftHydrationRef.current = null;
    writeTrackIdDraft(draftProjectKey, draftIdentity, {
      sequences,
      activeSequence,
      updatedAt: Date.now(),
    });
  }, [activeSequence, draftIdentity, draftProjectKey, draftStorageKey, open, sequences]);

  const frameSlots = React.useMemo<FrameSlot[]>(() => {
    const previousStem = currentIndex >= 0 ? stems[currentIndex - 1] || null : null;
    const nextStem = currentIndex >= 0 ? stems[currentIndex + 1] || null : null;
    const startStem = frameContextMode === 'locked'
      ? (startLocked ? startCandidate?.stem || null : null)
      : previousStem;
    const endStem = frameContextMode === 'locked'
      ? (endLocked ? endCandidate?.stem || null : null)
      : nextStem;

    return [
      {
        offset: -1,
        role: frameContextMode === 'locked' ? 'start' : 'previous',
        stem: startStem,
      },
      {
        offset: 0,
        role: 'current',
        stem: currentStem || (currentIndex >= 0 ? stems[currentIndex] || null : null),
      },
      {
        offset: 1,
        role: frameContextMode === 'locked' ? 'end' : 'next',
        stem: endStem,
      },
    ];
  }, [currentIndex, currentStem, endCandidate?.stem, endLocked, frameContextMode, startCandidate?.stem, startLocked, stems]);

  React.useEffect(() => {
    if (!open) return;
    const parsed = parseTrackId(getTrackIdLabel(activeAnnotation?.track_id) || selectedTrackId || trackIds[0] || '');
    setMainIdDraft(parsed.mainId);
    setPartIdDraft(parsed.partId);
    setTrackIdValidationError(null);
  }, [activeAnnotation?.track_id, open, selectedTrackId, trackIds]);

  const selectTrackId = (value: string) => {
    setTrackIdValidationError(null);
    setSelectedTrackId(value);
    const parsed = parseTrackId(value);
    setMainIdDraft(parsed.mainId);
    setPartIdDraft(parsed.partId);
  };

  const applyTrackId = (valueOverride?: string) => {
    const validation = validateTrackId(valueOverride?.trim() || composeTrackId(mainIdDraft, partIdDraft));
    if (validation.error) {
      setTrackIdValidationError(validation.error);
      return;
    }
    const value = validation.value;
    setTrackIdValidationError(null);
    if (valueOverride) {
      const parsed = parseTrackId(value);
      setMainIdDraft(parsed.mainId);
      setPartIdDraft(parsed.partId);
    }
    setManualTrackIds((current) => current.includes(value) ? current : [...current, value]);
    setSelectedTrackId(value || null);
    if (activeAnnotation) updateAnnotation(activeAnnotation.id, { track_id: value });
  };

  const makeCandidate = (annotation: any, stem = annotation?.stem || currentStem): TrackCandidate | null => {
    if (!annotation || !stem) return null;
    return {
      stem,
      annotationId: String(annotation.id),
      label: annotation.label,
    };
  };

  const updateSequence = (sequenceId: number, updates: Partial<TrackSequence>) => {
    setSequences((current) => current.map((sequence) => (
      sequence.id === sequenceId ? { ...sequence, ...updates } : sequence
    )));
  };

  const handleTrackObjectDoubleClick = (annotation: any, stem: string) => {
    const candidate = makeCandidate(annotation, stem);
    if (!candidate) return;

    if (!startLocked) {
      updateSequence(activeSequence, { startCandidate: candidate, startLocked: true });
    } else if (!endLocked) {
      updateSequence(activeSequence, { endCandidate: candidate, endLocked: true });
    }
  };

  const toggleCandidateLock = (kind: 'start' | 'end', sequenceId = activeSequence) => {
    const sequence = sequences.find((item) => item.id === sequenceId);
    if (!sequence) return;

    if (kind === 'start') {
      if (sequence.startLocked) {
        updateSequence(sequenceId, { startLocked: false });
        return;
      }
      const candidate = sequence.startCandidate || (sequenceId === activeSequence ? makeCandidate(activeAnnotation) : null);
      if (!candidate) return;
      updateSequence(sequenceId, { startCandidate: candidate, startLocked: true });
      return;
    }

    if (sequence.endLocked) {
      updateSequence(sequenceId, { endLocked: false });
      return;
    }
    const candidate = sequence.endCandidate || (sequenceId === activeSequence ? makeCandidate(activeAnnotation) : null);
    if (!candidate) return;
    updateSequence(sequenceId, { endCandidate: candidate, endLocked: true });
  };

  const addSequence = () => {
    const nextId = sequences.reduce((maximum, sequence) => Math.max(maximum, sequence.id), 0) + 1;
    setSequences((current) => [...current, createTrackSequence(nextId)]);
    setActiveSequence(nextId);
  };

  const confirmReidPath = async () => {
    setReidPathSaving(true);
    setReidSettingsMessage('');
    try {
      const status = await configureTrackIdReID({ model_path: reidPathDraft.trim() });
      setReidStatus(status);
      const configuredPath = status.model_path || '';
      setReidPathDraft(configuredPath);
      setTrackIdReIDSettings({ modelPath: configuredPath });
      setReidSettingsMessage(t('trackIdWindow.reidPathSaved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReidSettingsMessage(`${t('trackIdWindow.reidPathFailed')}: ${message}`);
    } finally {
      setReidPathSaving(false);
    }
  };

  const runReid = async () => {
    const trackId = selectedTrackId || composeTrackId(mainIdDraft, partIdDraft);
    if (!trackId || !startLocked || !endLocked || !startCandidate || !endCandidate) return;

    const startAnnotation = annotations.find((annotation: any) => (
      String(annotation.id) === startCandidate.annotationId && annotation.stem === startCandidate.stem
    ));
    const endAnnotation = annotations.find((annotation: any) => (
      String(annotation.id) === endCandidate.annotationId && annotation.stem === endCandidate.stem
    ));
    if (!startAnnotation || !endAnnotation) {
      setReidMessage(t('trackIdWindow.reidCandidatesMissing'));
      return;
    }

    const startIndex = stems.indexOf(startCandidate.stem);
    const endIndex = stems.indexOf(endCandidate.stem);
    if (startIndex < 0 || endIndex < 0) {
      setReidMessage(t('trackIdWindow.reidCandidatesMissing'));
      return;
    }

    const firstIndex = Math.min(startIndex, endIndex);
    const lastIndex = Math.max(startIndex, endIndex);
    const frameStems = stems.slice(firstIndex, lastIndex + 1);
    const toCandidate = (annotation: any): TrackIdReIDCandidate => ({
      stem: annotation.stem,
      annotation_id: String(annotation.id),
      label: annotation.label || '',
      track_id: getTrackIdLabel(annotation.track_id) || undefined,
      points: Array.isArray(annotation.points) ? annotation.points : [],
    });
    const sameLabelOnly = Boolean(trackIdReIDSettings?.sameLabelOnly ?? true);

    if (frameStems.length <= 2) {
      const anchorAnnotations = new Map<string, any>();
      anchorAnnotations.set(`${startAnnotation.stem}:${startAnnotation.id}`, startAnnotation);
      anchorAnnotations.set(`${endAnnotation.stem}:${endAnnotation.id}`, endAnnotation);
      anchorAnnotations.forEach((annotation) => {
        updateAnnotation(annotation.id, { track_id: trackId });
      });
      setSelectedTrackId(trackId);
      setReidProgress(null);
      setReidMessage(t('trackIdWindow.directTrackResult', { count: anchorAnnotations.size }));
      return;
    }

    const controller = new AbortController();
    const runToken = reidRunTokenRef.current + 1;
    reidRunTokenRef.current = runToken;
    const previousJobId = reidJobIdRef.current;
    if (previousJobId) void cancelTrackIdReID(previousJobId).catch(() => undefined);
    reidAbortControllerRef.current?.abort();
    reidAbortControllerRef.current = controller;
    setReidRunning(true);
    const collectionTotal = Math.max(frameStems.length, 1);
    setReidProgress(createLocalReidProgress(0, collectionTotal, t('trackIdWindow.collectingBoxes'), t('trackIdWindow.collectingBoxes')));
    setReidMessage('');
    let startedJobId: string | null = null;
    try {
      const frames: Array<{
        stem: string;
        image_path: string;
        candidates: TrackIdReIDCandidate[];
      }> = [];
      const collectionStep = Math.max(1, Math.ceil(collectionTotal / 40));
      for (let index = 0; index < frameStems.length; index += 1) {
        if (controller.signal.aborted) {
          throw new DOMException('ReID request was aborted.', 'AbortError');
        }
        const stem = frameStems[index];
        frames.push({
          stem,
          image_path: getFrameImagePath(stem, canvasProps),
          candidates: (annotationsByStem.get(stem) || [])
            .filter((annotation) => {
              const isLockedAnchor = (
                (stem === startAnnotation.stem && String(annotation.id) === String(startAnnotation.id))
                || (stem === endAnnotation.stem && String(annotation.id) === String(endAnnotation.id))
              );
              return isLockedAnchor || (
                !getTrackIdLabel(annotation.track_id)
                && (
                  !sameLabelOnly
                  || String(annotation.label || '').trim() === String(startAnnotation.label || '').trim()
                )
              );
            })
            .map(toCandidate),
        });
        const current = index + 1;
        if (current === collectionTotal || current === 1 || current % collectionStep === 0) {
          setReidProgress(createLocalReidProgress(
            current,
            collectionTotal,
            t('trackIdWindow.collectingBoxes'),
            `${t('trackIdWindow.collectingBoxes')}: ${stem}`,
          ));
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }

      let job = await startTrackIdReID({
        track_id: trackId,
        start: toCandidate(startAnnotation),
        end: toCandidate(endAnnotation),
        frames,
        min_similarity: Number(trackIdReIDSettings?.minSimilarity ?? 0.5),
        location_weight: Number(trackIdReIDSettings?.locationWeight ?? 0.2),
        same_label_only: sameLabelOnly,
        batch_size: Math.min(64, Math.max(1, Number(trackIdReIDSettings?.batchSize ?? 8) || 8)),
      }, controller.signal);
      if (reidRunTokenRef.current !== runToken) return;
      startedJobId = job.job_id;
      reidJobIdRef.current = startedJobId;
      setReidProgress(job);

      for (let attempt = 0; attempt < 7200 && (job.status === 'queued' || job.status === 'running'); attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
        job = await getTrackIdReIDJob(job.job_id, controller.signal);
        if (reidRunTokenRef.current !== runToken) return;
        setReidProgress(job);
      }
      if (job.status === 'queued' || job.status === 'running') {
        throw new Error('ReID job timed out.');
      }
      if (job.status === 'failed') {
        throw new Error(job.error || job.message || 'ReID job failed.');
      }
      const result = job.result;
      if (!result) throw new Error('ReID job returned no result.');
      if (reidRunTokenRef.current !== runToken) return;

      const matchedAnnotations = new Map<string, any>();
      result.assignments.forEach((assignment) => {
        const annotation = annotations.find((item: any) => (
          String(item.id) === String(assignment.annotation_id) && item.stem === assignment.stem
        ));
        if (annotation) matchedAnnotations.set(`${annotation.stem}:${annotation.id}`, annotation);
      });
      // The backend normally returns both anchors, but keep the two locked
      // objects explicit so Auto Track always persists their Track ID too.
      matchedAnnotations.set(`${startAnnotation.stem}:${startAnnotation.id}`, startAnnotation);
      matchedAnnotations.set(`${endAnnotation.stem}:${endAnnotation.id}`, endAnnotation);
      matchedAnnotations.forEach((annotation) => {
        updateAnnotation(annotation.id, { track_id: result.track_id });
      });
      setSelectedTrackId(result.track_id);
      const missingText = result.missing_stems.length > 0
        ? ` ${t('trackIdWindow.reidMissing', { count: result.missing_stems.length })}`
        : '';
      setReidMessage(t('trackIdWindow.reidResult', {
        matched: result.matched_frames,
        total: result.total_frames,
      }) + missingText);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (reidRunTokenRef.current !== runToken) return;
      const message = error instanceof Error ? error.message : String(error);
      setReidMessage(`${t('trackIdWindow.reidFailed')}: ${message}`);
    } finally {
      if (reidRunTokenRef.current !== runToken) return;
      if (reidAbortControllerRef.current === controller) {
        reidAbortControllerRef.current = null;
      }
      if (reidJobIdRef.current === startedJobId) {
        reidJobIdRef.current = null;
      }
      setReidRunning(false);
    }
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
      trackIdValidationError={trackIdValidationError ? t(`trackIdWindow.trackIdInvalid.${trackIdValidationError}`) : null}
      setMainIdDraft={(value) => {
        setTrackIdValidationError(null);
        setMainIdDraft(value);
      }}
      setPartIdDraft={(value) => {
        setTrackIdValidationError(null);
        setPartIdDraft(value);
      }}
      selectTrackId={selectTrackId}
      applyTrackId={applyTrackId}
      activeAnnotation={activeAnnotation}
      activeSequence={activeSequence}
      sequences={sequences}
      setActiveSequence={setActiveSequence}
      onAddSequence={addSequence}
      onToggleCandidateLock={toggleCandidateLock}
      reidStatus={reidStatus}
      reidRunning={reidRunning}
      reidProgress={reidProgress}
      reidMessage={reidMessage}
      reidSettings={trackIdReIDSettings || {
        modelPath: '',
        minSimilarity: 0.5,
        locationWeight: 0.2,
        sameLabelOnly: true,
        batchSize: 8,
      }}
      onUpdateReidSettings={(settings) => setTrackIdReIDSettings(settings)}
      reidSettingsOpen={reidSettingsOpen}
      setReidSettingsOpen={setReidSettingsOpen}
      reidPathDraft={reidPathDraft}
      setReidPathDraft={setReidPathDraft}
      reidPathSaving={reidPathSaving}
      reidSettingsMessage={reidSettingsMessage}
      onConfirmReidPath={confirmReidPath}
      onRunReid={runReid}
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
        <DialogHeader className="shrink-0 border-b border-border p-4">
          <DialogTitle>{t('trackIdWindow.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden bg-neutral-50/70 dark:bg-neutral-950/50">
          <section className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 dark:border-neutral-800">
            <div className="flex min-h-0 flex-1">
              <div className={`relative shrink-0 ${leftPanelOpen ? '' : 'w-6'}`}>
                {leftPanelOpen ? (
                  centerToolbar
                ) : (
                  <button
                    type="button"
                    onClick={() => setLeftPanelOpen(true)}
                    className="flex h-full w-6 items-center justify-center border-r border-neutral-200 bg-neutral-100 transition-colors hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    title={t('annotation.expandLeftPanel')}
                    aria-label={t('annotation.expandLeftPanel')}
                  >
                    <ChevronRight className="h-4 w-4 text-neutral-500" />
                  </button>
                )}
                {leftPanelOpen && (
                  <button
                    type="button"
                    onClick={() => setLeftPanelOpen(false)}
                    className="absolute top-2 -right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    title={t('annotation.collapseLeftPanel')}
                    aria-label={t('annotation.collapseLeftPanel')}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 text-neutral-500" />
                  </button>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  <div className={`grid gap-3 ${verticalFrameLayout ? 'min-w-0 grid-cols-1' : 'min-w-[900px] grid-cols-3'}`}>
                {frameSlots.map((slot, index) => {
                  const editable = slot.offset === 0;
                  const viewPacket: TrackIdViewPacket = {
                    view: canvasProps.view || null,
                    interaction: {
                      editable,
                      synchronized: !editable && syncFrames,
                      browsable: true,
                    },
                  };
                  const frameLabel = slot.role === 'start'
                    ? t('trackIdWindow.startFrame')
                    : slot.role === 'end'
                      ? t('trackIdWindow.endFrame')
                      : slot.role === 'previous'
                        ? t('trackIdWindow.frameOne')
                        : slot.role === 'next'
                          ? t('trackIdWindow.frameThree')
                          : t('trackIdWindow.frameTwo');
                  return (
                    <article key={`${slot.offset}-${slot.stem || 'empty'}`} className={`overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-neutral-900 ${editable ? 'border-blue-300 ring-1 ring-blue-100 dark:border-blue-700 dark:ring-blue-950' : 'border-neutral-200 dark:border-neutral-800'}`}>
                      <div className="flex min-w-0 items-center gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-100 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{index + 1}</span>
                        <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">{frameLabel}</span>
                        {slot.stem && <span className="min-w-0 truncate text-[10px] font-normal text-neutral-500 dark:text-neutral-400" title={slot.stem}>· {slot.stem}</span>}
                      </div>
                      <div
                        role="button"
                        tabIndex={slot.stem && viewPacket.interaction.browsable ? 0 : -1}
                        aria-disabled={!slot.stem || !viewPacket.interaction.browsable}
                        onClick={() => viewPacket.interaction.browsable && jumpToStem(slot.stem)}
                        onKeyDown={(event) => {
                          if (slot.stem && viewPacket.interaction.browsable && (event.key === 'Enter' || event.key === ' ')) {
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
                          viewPacket={viewPacket}
                          canvasProps={canvasProps}
                          t={t}
                          fitRef={viewPacket.interaction.editable ? centerFitRef : undefined}
                          syncViewport={canvasProps.viewport}
                          showTrackId={showTrackIds}
                          annotationsByStem={annotationsByStem}
                          onTrackObjectDoubleClick={handleTrackObjectDoubleClick}
                        />
                      </div>
                    </article>
                  );
                })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                      <Label className="text-xs">{t('trackIdWindow.syncViews')}</Label>
                      <Switch
                        className="scale-90 origin-right"
                        checked={syncFrames}
                        onCheckedChange={setSyncFrames}
                        aria-label={t('trackIdWindow.syncViews')}
                        title={t(syncFrames ? 'trackIdWindow.syncViewsOn' : 'trackIdWindow.syncViewsOff')}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                      <Label className="text-xs">{t('trackIdWindow.showTrackId')}</Label>
                      <Switch
                        className="scale-90 origin-right"
                        checked={showTrackIds}
                        onCheckedChange={setShowTrackIds}
                        aria-label={t('trackIdWindow.showTrackId')}
                        title={t(showTrackIds ? 'trackIdWindow.showTrackIdOn' : 'trackIdWindow.showTrackIdOff')}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                      <Label className="text-xs">{t(frameContextMode === 'locked' ? 'trackIdWindow.lockedFrames' : 'trackIdWindow.adjacentFrames')}</Label>
                      <Switch
                        className="scale-90 origin-right"
                        checked={frameContextMode === 'locked'}
                        onCheckedChange={(checked) => setFrameContextMode(checked ? 'locked' : 'adjacent')}
                        aria-label={t(frameContextMode === 'locked' ? 'trackIdWindow.lockedFrames' : 'trackIdWindow.adjacentFrames')}
                        title={t(frameContextMode === 'locked' ? 'trackIdWindow.switchToAdjacentFrames' : 'trackIdWindow.switchToLockedFrames')}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                      <Label className="text-xs">{t('trackIdWindow.verticalLayout')}</Label>
                      <Switch
                        className="scale-90 origin-right"
                        checked={verticalFrameLayout}
                        onCheckedChange={setVerticalFrameLayout}
                        aria-label={t('trackIdWindow.verticalLayout')}
                        title={t('trackIdWindow.verticalLayout')}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-neutral-500"><span>{t('trackIdWindow.filmstrip')}</span><span>{currentIndex >= 0 ? `${currentIndex + 1}/${stems.length}` : `0/${stems.length}`}</span></div>
                  <div className="flex max-w-full gap-1.5 overflow-x-scroll pb-2 custom-scrollbar">
                    {stems.map((stem: string) => (
                      <TrackFrameThumbnail key={stem} stem={stem} current={stem === currentStem} canvasProps={canvasProps} onClick={() => jumpToStem(stem)} />
                    ))}
                    {stems.length === 0 && <span className="py-2 text-[10px] text-neutral-400">{t('trackIdWindow.noFrames')}</span>}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className={`relative shrink-0 overflow-visible bg-white dark:bg-neutral-950 ${rightPanelOpen ? 'w-80 min-w-80' : 'w-6 min-w-6'}`}>
            {rightPanelOpen ? (
              <>
                <RightPanel {...rightPanelProps} readOnlyViewLayers trackIdMode trackIdEditor={editor} />
                <button
                  type="button"
                  onClick={() => setRightPanelOpen(false)}
                  className="absolute top-2 -left-3 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  title={t('annotation.collapseRightPanel')}
                  aria-label={t('annotation.collapseRightPanel')}
                >
                  <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setRightPanelOpen(true)}
                className="flex h-full w-6 items-center justify-center border-l border-neutral-200 bg-neutral-100 transition-colors hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                title={t('annotation.expandRightPanel')}
                aria-label={t('annotation.expandRightPanel')}
              >
                <ChevronLeft className="h-4 w-4 text-neutral-500" />
              </button>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
