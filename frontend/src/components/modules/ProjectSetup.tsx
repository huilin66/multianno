// src/components/modals/ProjectSetupModals.tsx
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { FolderSearch, AlertCircle, Check, X } from 'lucide-react';
import { saveProjectMeta, loadProjectMetaFromServer, analyzeWorkspaceFolders } from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog';
import { loadAllProjectAnnotations } from '../../lib/projectUtils';
import { useTranslation } from 'react-i18next';
import { showDialog } from '../../store/useDialogStore';

export function CreateProject({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { resetProject, setProjectName, setProjectMetaPath, setActiveModule } = useStore();
  const [name, setName] = useState(t('createProject.defaultName'));
  const [metaPath, setMetaPath] = useState('');
  const [explorerOpen, setExplorerOpen] = useState(false);

  const handleConfirm = async () => {
    if (!name.trim() || !metaPath.trim()) {
      alert(t('createProject.fillAllFields'));
      return;
    }
    
    resetProject();
    setProjectName(name);
    setProjectMetaPath(metaPath);

    try {
      await saveProjectMeta({
        file_path: metaPath,
        content: {
          projectName: name,
          folders: [], views: [], taxonomyClasses: [], taxonomyAttributes: []
        }
      });
      setActiveModule('preload');
    } catch (e) {
      alert(t('createProject.saveFailed'));
    }
  };

  return (
    <div className="p-5 pt-1 space-y-5 h-full flex flex-col">
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t('createProject.projectName')}
        </Label>
        <Input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder={t('createProject.namePlaceholder')}
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t('createProject.projectMetaPath')}
        </Label>
        <div className="relative">
          <Input 
            value={metaPath} 
            onChange={(e) => setMetaPath(e.target.value)}
            placeholder={t('createProject.projectMetaPlaceholder')}
            className="h-9 text-xs pr-9 font-mono"
          />
          <button
            type="button"
            onClick={() => setExplorerOpen(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <FolderSearch size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 mt-auto border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" className="text-white" onClick={handleConfirm}>
          {t('common.confirm')}
        </Button>
      </div>

      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath="/" 
        selectType="save" 
        defaultSaveName={`${name.replace(/\s+/g, '_')}_meta.json`}
        onClose={() => setExplorerOpen(false)}
        onConfirm={(paths) => { setMetaPath(paths[0]); setExplorerOpen(false); }}
      />
    </div>
  );
}


export function LoadProject({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { loadProjectMeta, setActiveModule, resetProject } = useStore();
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState(''); // 🆕 输入的路径
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleExplorerConfirm = (paths: string[]) => {
    setExplorerOpen(false);
    if (paths.length > 0) {
      setSelectedPath(paths[0]);
    }
  };
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });

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

    try {
      const meta = await loadProjectMetaFromServer(filePath);
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

      setActiveModule('workspace');
      onClose();
    } catch (err: any) {
      setError(t('common.error')+err.message);
    } finally {
      setIsLoading(false);
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

        {error && (
          <Alert variant="destructive" className="text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        {isLoading && loadProgress.total > 0 ? (
          <div className="flex items-center gap-3 flex-1 mr-4">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t('loadProject.loadingAnnotations')}
              <span className="font-mono font-bold text-foreground ml-1">
                {loadProgress.current}/{loadProgress.total}
              </span>
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(loadProgress.current / loadProgress.total) * 100}%` }}
              />
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