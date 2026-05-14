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

// ==========================================
// Create New Project
// ==========================================
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

// ==========================================
// Load Project
// ==========================================
export function LoadProject({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { loadProjectMeta, setActiveModule, resetProject } = useStore();
  const [error, setError] = useState('');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoadFile = async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    const filePath = paths[0];

    const confirmMsg = t('loadProject.confirmReset');
    if (!window.confirm(confirmMsg)) return;

    setIsLoading(true);
    setError('');

    try {
      const meta = await loadProjectMetaFromServer(filePath);
      resetProject();
      useStore.getState().setProjectMetaPath(filePath);
      loadProjectMeta(meta);

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

            const mainViewFolderId = meta.views.find((v: any) => v.isMain)?.["folder id"];
            const mainFolder = meta.folders.find((f: any) => f.Id === mainViewFolderId) || meta.folders[0];
            
            const state = useStore.getState();
            const loadPath = state.workspacePath || mainFolder?.path || '';
            if (loadPath) {
              loadAllProjectAnnotations(result.commonStems, loadPath);
            }
          }
        } catch (analyzeError) {
          console.warn("Failed to scan folders:", analyzeError);
        }
      }

      setActiveModule('workspace');
      onClose();
    } catch (err: any) {
      setError(err.message || t('loadProject.failLoad'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-5 h-full flex flex-col">
      <div className="flex-1 space-y-4">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <FolderSearch className="w-7 h-7 text-muted-foreground" />
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          {t('loadProject.description1')}{' '}
          <span className="text-foreground font-mono font-medium">
            project_meta.json
          </span>{' '}
          {t('loadProject.description2')}
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('loadProject.selectFile')}
          </Label>
          <Button 
            variant="outline" 
            className="w-full justify-start text-xs font-mono h-9"
            onClick={() => setExplorerOpen(true)}
            disabled={isLoading}
          >
            <FolderSearch className="w-4 h-4 mr-2 shrink-0" />
            <span className="truncate">
              {t('loadProject.clickToSelect')}
            </span>
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('common.cancel')}
        </Button>
        <Button 
          size="sm" 
          className="text-white" 
          onClick={() => setExplorerOpen(true)}
          disabled={isLoading}
        >
          <FolderSearch className="w-3.5 h-3.5 mr-1.5" />
          {t('loadProject.load')}
        </Button>
      </div>

      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath="/" 
        selectType="file"
        onClose={() => setExplorerOpen(false)} 
        onConfirm={(paths) => {
          setExplorerOpen(false);
          handleLoadFile(paths);
        }} 
      />
    </div>
  );
}