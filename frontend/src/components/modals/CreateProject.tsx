// src/components/CreateProject.tsx
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FolderSearch } from 'lucide-react';
import { saveProjectMeta} from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog';
import { useTranslation } from 'react-i18next';

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