// src/components/LoadProject.tsx
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { FolderSearch, AlertCircle, History } from 'lucide-react';
import { loadProjectMetaFromServer, analyzeWorkspaceFolders } from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog';
import { loadAllProjectAnnotations } from '../../lib/annotationUtils';
import {
  MAX_RECENT_PROJECTS,
  RECENT_PROJECTS_KEY,
  RecentProject,
  normalizeProjectPath,
  parseRecentProjects,
  rememberRecentProject,
} from '../../lib/projectHistory';
import { useTranslation } from 'react-i18next';
import { showDialog } from '../../store/useDialogStore';

type LoadStage = 'metadata' | 'analyzing' | 'annotations' | 'complete';

export function LoadProject({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { loadProjectMeta, setActiveModule, resetProject } = useStore();
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState(''); // 🆕 输入的路径
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [loadStage, setLoadStage] = useState<LoadStage>('metadata');

  React.useEffect(() => {
    setRecentProjects(parseRecentProjects(localStorage.getItem(RECENT_PROJECTS_KEY)));
  }, []);

  const rememberProject = (path: string, name?: string) => {
    setRecentProjects(rememberRecentProject(path, name, recentProjects));
  };

  const handleExplorerConfirm = (paths: string[]) => {
    setExplorerOpen(false);
    if (paths.length > 0) {
      setSelectedPath(paths[0]);
    }
  };
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });

  const getDatasetSummary = () => {
    const state = useStore.getState();
    const labelCount = new Set(
      state.annotations
        .map((annotation) => annotation.label.trim())
        .filter((label) => label.length > 0),
    ).size;

    return {
      images: state.stems.length,
      labels: labelCount,
      objects: state.annotations.length,
    };
  };

  const handleLoadFile = async () => {
    const filePath = selectedPath.trim();
    if (!filePath) return;

    const confirmed = await showDialog({
      type: 'warning',
      title: t('loadProject.confirmResetTitle'),
      description: t('loadProject.confirmReset'),
    });
    if (!confirmed) return;

    setIsLoading(true);
    setError('');
    setLoadProgress({ current: 0, total: 0 });
    setLoadStage('metadata');

    try {
      const meta = await loadProjectMetaFromServer(filePath);
      setLoadStage('analyzing');
      resetProject();
      useStore.getState().setProjectMetaPath(filePath);
      loadProjectMeta(meta);

      if (meta.workspacePath) {
        useStore.getState().setWorkspacePath(meta.workspacePath);
      }

      if (meta.folders && meta.folders.length > 0) {
        try {
          const payloadData = meta.folders.map((f: any) => ({
            path: f.path,
            suffix: f.suffix || ''
          }));
          const result = await analyzeWorkspaceFolders(payloadData);
          
          if (result.commonStems && result.commonStems.length > 0) {
            useStore.getState().setStems(result.commonStems);
            useStore.getState().setSceneGroups(result.sceneGroups);
            useStore.getState().setCurrentStem(result.commonStems[0]);

            const state = useStore.getState();
            const mainViewFolderId = meta.views?.find((v: any) => v.isMain)?.["folder id"];
            const mainFolder = meta.folders?.find((f: any) => f.Id === mainViewFolderId) || meta.folders[0];
            const loadPath = state.workspacePath || mainFolder?.path || '';
            
            if (loadPath) {
              setLoadStage('annotations');
              setLoadProgress({ current: 0, total: result.commonStems.length });
              await loadAllProjectAnnotations(
                result.commonStems, 
                loadPath, 
                (current, total) => setLoadProgress({ current, total }),
                10,
              );
            }
          }
        } catch (analyzeError) {
          console.warn("Failed to scan folders:", analyzeError);
        }
      }

      setLoadStage('complete');
      setLoadProgress({ current: 1, total: 1 });
      rememberProject(filePath, meta.projectName);
      const datasetSummary = getDatasetSummary();
      await showDialog({
        type: 'success',
        title: t('loadProject.datasetLoadedTitle'),
        description: t('loadProject.datasetLoadedDescription', {
          images: datasetSummary.images,
          labels: datasetSummary.labels,
          objects: datasetSummary.objects,
        }),
        confirmText: t('common.confirm'),
        hideCancel: true,
      });
      setActiveModule('workspace');
      onClose();
    } catch (err: any) {
      setError(t('common.error')+err.message);
    } finally {
      setIsLoading(false);
      setLoadStage('metadata');
    }
  };

  return (
    <div className="p-5 pt-1 space-y-5 h-full flex flex-col">
      <div className="flex-1 space-y-4">

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('loadProject.projectMetaPath')}
          </Label>
          <div className="relative">
            <Input
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              placeholder={t('loadProject.projectMetaPlaceholder')}
              className="h-9 text-xs pr-9 font-mono"
              disabled={isLoading}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadFile()}
            />
            <button
              type="button"
              onClick={() => setExplorerOpen(true)}
              disabled={isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <FolderSearch size={14} />
            </button>
          </div>
        </div>

        {recentProjects.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('loadProject.recentProjects')}
              </Label>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
              {recentProjects.map((project, index) => {
                const isSelected = normalizeProjectPath(selectedPath) === normalizeProjectPath(project.path);
                return (
                  <button
                    key={`${project.path}-${index}`}
                    type="button"
                    onClick={() => {
                      setSelectedPath(project.path);
                      setError('');
                    }}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/60'
                    }`}
                    title={project.path}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{project.name}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">{project.path}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        {isLoading ? (
          <div className="flex items-center gap-3 flex-1 mr-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {loadStage === 'annotations'
                    ? t('loadProject.loadingAnnotations')
                    : loadStage === 'complete'
                      ? t('loadProject.loadComplete')
                      : loadStage === 'analyzing'
                        ? t('loadProject.analyzingImages')
                        : t('loadProject.loadingProject')}
                </span>
                {loadProgress.total > 0 && (
                  <span className="shrink-0 font-mono font-bold text-foreground">
                    {loadProgress.current}/{loadProgress.total}
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full bg-primary rounded-full transition-all duration-300 ${loadProgress.total > 0 ? '' : 'w-1/2 animate-pulse'}`}
                style={loadProgress.total > 0
                  ? { width: `${Math.min(100, (loadProgress.current / loadProgress.total) * 100)}%` }
                  : undefined}
              />
              </div>
            </div>
          </div>
        ) : (
          <span />
        )}

      <div className="flex items-center gap-3 shrink-0">
        <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button 
          size="sm" 
          className="text-white" 
          onClick={handleLoadFile}
          disabled={isLoading || !selectedPath.trim()}
        >
          {isLoading ? (
            <> {t('common.loading')}</>
          ) : (
            t('common.confirm')
          )}
        </Button>
      </div>
    </div>

      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath={selectedPath || '/'}
        selectType="file"
        onClose={() => setExplorerOpen(false)} 
        onConfirm={handleExplorerConfirm}
      />
    </div>
  );
}
