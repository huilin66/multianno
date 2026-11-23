import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';
import { Button } from '../ui/button';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { PidAnswerAudit } from './PidAnswerAudit';

type AnnotationTool = 'cross-view-association';

const CROSS_VIEW_TOOL: AnnotationTool = 'cross-view-association';

export function OtherAnnotation({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<AnnotationTool>(CROSS_VIEW_TOOL);
  const [dataRoot, setDataRoot] = useState('');
  const [folderExplorerOpen, setFolderExplorerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleFolderConfirm = (paths: string[]) => {
    const selectedPath = paths[0]?.trim();
    if (selectedPath) setDataRoot(selectedPath);
    setFolderExplorerOpen(false);
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
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">
                {t('otherAnnotation.tools')}
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={t('otherAnnotation.collapseTools', 'Collapse annotation tools')}
                aria-label={t('otherAnnotation.collapseTools', 'Collapse annotation tools')}
              >
                <ChevronLeft className="size-4" />
              </button>
            </div>

            <div className="flex-1 p-2">
              <button
                type="button"
                onClick={() => setActiveTool(CROSS_VIEW_TOOL)}
                className={`flex w-full items-center rounded-md px-3 py-2 text-left text-xs transition-colors ${
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
          <div className="flex h-full items-center justify-center overflow-y-auto p-6">
            <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <FolderOpen className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">
                    {t('otherAnnotation.crossViewObjectAssociation')}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('otherAnnotation.selectRootDescription')}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/20 p-4">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('otherAnnotation.dataRoot')}
                </div>
                <Button className="w-full" onClick={() => setFolderExplorerOpen(true)}>
                  <FolderOpen className="mr-2 size-4" />
                  {t('otherAnnotation.chooseRoot')}
                </Button>
              </div>
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
