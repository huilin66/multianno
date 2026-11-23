import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, FolderSearch, History } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { PidAnswerAudit } from './PidAnswerAudit';

type AnnotationTool = 'cross-view-association';

const CROSS_VIEW_TOOL: AnnotationTool = 'cross-view-association';
const RECENT_ROOTS_KEY = 'multiAnno_recentAnnotationRoots';
const MAX_RECENT_ROOTS = 3;

const normalizeRoot = (path: string) => path.trim().replace(/[\\/]+$/, '').toLowerCase();

const rootName = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).pop() || normalized;
};

const readRecentRoots = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ROOTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, MAX_RECENT_ROOTS);
  } catch {
    return [];
  }
};

export function OtherAnnotation({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<AnnotationTool>(CROSS_VIEW_TOOL);
  const [dataRoot, setDataRoot] = useState('');
  const [selectedRoot, setSelectedRoot] = useState('');
  const [recentRoots, setRecentRoots] = useState<string[]>([]);
  const [folderExplorerOpen, setFolderExplorerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setRecentRoots(readRecentRoots());
  }, []);

  const rememberRoot = (path: string) => {
    const next = [
      path,
      ...recentRoots.filter(item => normalizeRoot(item) !== normalizeRoot(path)),
    ].slice(0, MAX_RECENT_ROOTS);
    setRecentRoots(next);
    try {
      localStorage.setItem(RECENT_ROOTS_KEY, JSON.stringify(next));
    } catch {
      // Recent roots are only a convenience; loading should continue if storage is unavailable.
    }
  };

  const handleFolderConfirm = (paths: string[]) => {
    const selectedPath = paths[0]?.trim();
    if (selectedPath) {
      setSelectedRoot(selectedPath);
      if (dataRoot) {
        setDataRoot(selectedPath);
        rememberRoot(selectedPath);
      }
    }
    setFolderExplorerOpen(false);
  };

  const handleRootConfirm = () => {
    const root = selectedRoot.trim();
    if (!root) return;
    setDataRoot(root);
    rememberRoot(root);
  };

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <div className={`relative shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? 'w-7' : 'w-64'}`}>
        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="flex h-full w-7 items-center justify-center border-r border-border bg-muted/20 transition-colors hover:bg-muted"
            title={t('otherAnnotation.expandTools', 'Expand annotation tools')}
            aria-label={t('otherAnnotation.expandTools', 'Expand annotation tools')}
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ) : (
          <aside className="relative flex h-full w-64 flex-col border-r border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t('otherAnnotation.collapseTools', 'Collapse annotation tools')}
              aria-label={t('otherAnnotation.collapseTools', 'Collapse annotation tools')}
            >
              <ChevronLeft className="size-4" />
            </button>

            <div className="flex-1 p-2">
              <button
                type="button"
                onClick={() => setActiveTool(CROSS_VIEW_TOOL)}
                className={`flex w-full items-center rounded-md px-3 py-2 pr-10 text-left text-xs transition-colors ${
                  activeTool === CROSS_VIEW_TOOL
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className="leading-4">{t('otherAnnotation.crossViewObjectAssociation')}</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      <main className="min-w-0 flex-1 overflow-hidden">
        {dataRoot && activeTool === CROSS_VIEW_TOOL ? (
          <div key={dataRoot} className="h-full min-h-0">
            <PidAnswerAudit
              dataRoot={dataRoot}
              onChangeRoot={() => setFolderExplorerOpen(true)}
              onClose={onClose}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col p-5 pt-3">
            <div className="flex-1 space-y-5 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('otherAnnotation.dataRoot')}
                </Label>
                <div className="relative">
                  <Input
                    value={selectedRoot}
                    onChange={event => setSelectedRoot(event.target.value)}
                    placeholder={t('otherAnnotation.rootPlaceholder')}
                    className="h-9 pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setFolderExplorerOpen(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    title={t('otherAnnotation.chooseRoot')}
                    aria-label={t('otherAnnotation.chooseRoot')}
                  >
                    <FolderSearch size={14} />
                  </button>
                </div>
              </div>

              {recentRoots.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <History className="size-3.5 text-muted-foreground" />
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t('otherAnnotation.recentRoots')}
                    </Label>
                  </div>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                    {recentRoots.map((root, index) => {
                      const isSelected = normalizeRoot(selectedRoot) === normalizeRoot(root);
                      return (
                        <button
                          key={`${root}-${index}`}
                          type="button"
                          onClick={() => setSelectedRoot(root)}
                          className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/60'
                          }`}
                          title={root}
                        >
                          <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-foreground">{rootName(root)}</span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">{root}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleRootConfirm} disabled={!selectedRoot.trim()}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        )}
      </main>

      <FileExplorerDialog
        open={folderExplorerOpen}
        initialPath={dataRoot || '/'}
        selectType="dir"
        onClose={() => setFolderExplorerOpen(false)}
        onConfirm={handleFolderConfirm}
      />
    </div>
  );
}
