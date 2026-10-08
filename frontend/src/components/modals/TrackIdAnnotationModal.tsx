import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Lock,
  Plus,
  Route,
  ScanLine,
  Sparkles,
  Unlock,
} from 'lucide-react';

interface TrackIdAnnotationModalProps {
  open: boolean;
  onClose: () => void;
}

interface FrameSlot {
  stem: string | null;
  offset: -1 | 0 | 1;
}

const getTrackIdLabel = (value: string | number | null | undefined) => String(value ?? '').trim();

export function TrackIdAnnotationModal({ open, onClose }: TrackIdAnnotationModalProps) {
  const { t } = useTranslation();
  const {
    stems = [],
    currentStem,
    setCurrentStem,
    annotations = [],
    views = [],
    folders = [],
  } = useStore() as any;

  const [trackIdDraft, setTrackIdDraft] = React.useState('');
  const [selectedTrackId, setSelectedTrackId] = React.useState<string | null>(null);
  const [activeSequence, setActiveSequence] = React.useState(1);

  const currentIndex = currentStem ? stems.indexOf(currentStem) : -1;
  const mainView = views.find((view: any) => view.isMain) || views[0];
  const mainFolder = folders.find((folder: any) => folder.id === mainView?.folderId);

  const trackIds = React.useMemo(() => {
    const values = (annotations as any[])
      .map((annotation) => getTrackIdLabel(annotation.track_id))
      .filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [annotations]);

  const frameSlots = React.useMemo<FrameSlot[]>(() => {
    return [-1, 0, 1].map((offset) => ({
      offset: offset as FrameSlot['offset'],
      stem: currentIndex >= 0 ? stems[currentIndex + offset] || null : null,
    }));
  }, [currentIndex, stems]);

  React.useEffect(() => {
    if (!open) return;
    setTrackIdDraft(selectedTrackId || trackIds[0] || '');
  }, [open, selectedTrackId, trackIds]);

  const selectTrackId = (value: string) => {
    setSelectedTrackId(value);
    setTrackIdDraft(value);
  };

  const jumpToStem = (stem: string | null) => {
    if (stem) setCurrentStem(stem);
  };

  const getFrameTitle = (slot: FrameSlot) => {
    if (slot.offset === -1) return t('trackIdWindow.frameOne');
    if (slot.offset === 0) return t('trackIdWindow.frameTwo');
    return t('trackIdWindow.frameThree');
  };

  const getFrameObjectCount = (stem: string | null) =>
    stem ? annotations.filter((annotation: any) => annotation.stem === stem).length : 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="flex max-h-[min(92vh,900px)] w-[calc(100vw-2rem)] max-w-7xl flex-col gap-0 overflow-hidden border-neutral-200 p-0 dark:border-neutral-800"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex min-w-0 items-start justify-between gap-4 pr-6">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Route className="h-4 w-4 text-blue-500" />
                {t('trackIdWindow.title')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {t('trackIdWindow.description')}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              <ScanLine className="h-3.5 w-3.5" />
              <span>{t('trackIdWindow.singleModality')}</span>
              <span className="text-blue-400">·</span>
              <span>{mainFolder?.path || t('trackIdWindow.noFolder')}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden bg-neutral-50/70 dark:bg-neutral-950/50">
          <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section className="flex min-h-0 flex-col border-b border-neutral-200 dark:border-neutral-800 xl:border-b-0 xl:border-r">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex min-w-0 items-center gap-2">
                  <Film className="h-4 w-4 text-neutral-500" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                      {t('trackIdWindow.threeFrameView')}
                    </div>
                    <div className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                      {currentStem || t('trackIdWindow.noCurrentScene')}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  {t('trackIdWindow.frameNavigationHint')}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  {frameSlots.map((slot, index) => {
                    const isEditable = slot.offset === 0;
                    const objectCount = getFrameObjectCount(slot.stem);
                    return (
                      <article
                        key={`${slot.offset}-${slot.stem || 'empty'}`}
                        className={`overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-neutral-900 ${
                          isEditable
                            ? 'border-blue-300 ring-1 ring-blue-100 dark:border-blue-700 dark:ring-blue-950'
                            : 'border-neutral-200 dark:border-neutral-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-100 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {index + 1}
                            </span>
                            <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                              {getFrameTitle(slot)}
                            </span>
                          </div>
                          <span className={`shrink-0 text-[10px] ${isEditable ? 'text-blue-600 dark:text-blue-300' : 'text-neutral-400'}`}>
                            {isEditable ? t('trackIdWindow.editable') : t('trackIdWindow.readOnly')}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => jumpToStem(slot.stem)}
                          disabled={!slot.stem}
                          className="group relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(59,130,246,0.06),transparent_45%,rgba(14,165,233,0.08))] text-center transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[linear-gradient(135deg,rgba(59,130,246,0.12),transparent_45%,rgba(14,165,233,0.08))] dark:hover:bg-blue-950/30"
                          title={slot.stem ? t('trackIdWindow.jumpToFrame') : undefined}
                        >
                          <ImageIcon className="mb-2 h-8 w-8 text-neutral-300 transition-colors group-hover:text-blue-300 dark:text-neutral-700 dark:group-hover:text-blue-700" />
                          <span className="max-w-[90%] truncate px-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                            {slot.stem || t('trackIdWindow.frameUnavailable')}
                          </span>
                          {slot.stem && (
                            <span className="mt-1 text-[10px] text-neutral-400">
                              {t('trackIdWindow.objects', { count: objectCount })}
                            </span>
                          )}
                          {isEditable && slot.stem && (
                            <span className="absolute bottom-2 rounded-full bg-blue-600/90 px-2 py-0.5 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                              {t('trackIdWindow.editHere')}
                            </span>
                          )}
                        </button>

                        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2 text-[10px] dark:border-neutral-800">
                          <span className="truncate text-neutral-500" title={slot.stem || undefined}>
                            {slot.stem || t('trackIdWindow.frameUnavailable')}
                          </span>
                          {slot.offset === -1 && <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                          {slot.offset === 1 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/50">
                  <div className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    {t('trackIdWindow.processingPreview')}
                  </div>
                  <p className="mt-1 text-[10px] leading-5 text-neutral-500 dark:text-neutral-400">
                    {t('trackIdWindow.processingPreviewDescription')}
                  </p>
                </div>
              </div>

              <div className="shrink-0 border-t border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-1.5 flex items-center justify-between text-[10px] text-neutral-500">
                  <span>{t('trackIdWindow.filmstrip')}</span>
                  <span>{currentIndex >= 0 ? `${currentIndex + 1}/${stems.length}` : `0/${stems.length}`}</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {stems.slice(Math.max(0, currentIndex - 5), Math.max(0, currentIndex - 5) + 11).map((stem: string) => (
                    <button
                      type="button"
                      key={stem}
                      onClick={() => jumpToStem(stem)}
                      className={`h-9 min-w-16 max-w-28 shrink-0 truncate rounded border px-1.5 text-[9px] transition-colors ${
                        stem === currentStem
                          ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-blue-300 hover:text-blue-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400'
                      }`}
                      title={stem}
                    >
                      {stem}
                    </button>
                  ))}
                  {stems.length === 0 && <span className="py-2 text-[10px] text-neutral-400">{t('trackIdWindow.noFrames')}</span>}
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 flex-col overflow-auto bg-white dark:bg-neutral-950">
              <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">{t('trackIdWindow.editorTitle')}</h2>
                    <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">{t('trackIdWindow.editorDescription')}</p>
                  </div>
                  <Route className="h-4 w-4 shrink-0 text-blue-500" />
                </div>

                <Label className="mt-4 block text-[10px] uppercase tracking-wider text-neutral-500">{t('trackIdWindow.trackId')}</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    value={trackIdDraft}
                    onChange={(event) => setTrackIdDraft(event.target.value)}
                    placeholder={t('trackIdWindow.trackIdPlaceholder')}
                    className="h-8 min-w-0 text-xs"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    onClick={() => setSelectedTrackId(trackIdDraft.trim() || null)}
                    title={t('trackIdWindow.selectTrackId')}
                    aria-label={t('trackIdWindow.selectTrackId')}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
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

              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
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
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                      {t('trackIdWindow.sequenceNumber', { count: activeSequence })}
                    </span>
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      {selectedTrackId || trackIdDraft || t('trackIdWindow.unassigned')}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="rounded-md border border-white/80 bg-white/80 p-2 dark:border-neutral-800 dark:bg-neutral-900/70">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-200">{t('trackIdWindow.startCandidate')}</span>
                        <Button type="button" size="icon-xs" variant="ghost" title={t('trackIdWindow.lock')} aria-label={t('trackIdWindow.lock')}>
                          <Unlock className="h-3.5 w-3.5 text-neutral-400" />
                        </Button>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-neutral-500">{currentStem || t('trackIdWindow.notSelected')}</p>
                    </div>
                    <div className="rounded-md border border-white/80 bg-white/80 p-2 dark:border-neutral-800 dark:bg-neutral-900/70">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-200">{t('trackIdWindow.endCandidate')}</span>
                        <Button type="button" size="icon-xs" variant="ghost" title={t('trackIdWindow.lock')} aria-label={t('trackIdWindow.lock')}>
                          <Lock className="h-3.5 w-3.5 text-neutral-400" />
                        </Button>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-neutral-500">{currentStem || t('trackIdWindow.notSelected')}</p>
                    </div>
                  </div>

                  <Button type="button" variant="outline" size="sm" className="mt-3 w-full text-[10px]" disabled>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('trackIdWindow.interpolateReid')}
                  </Button>
                </div>

                <div className="rounded-md border border-dashed border-neutral-300 p-3 text-[10px] leading-5 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  {t('trackIdWindow.scaffoldNotice')}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
