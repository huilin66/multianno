import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveProjectMeta } from '../api/client';
import { useTranslation } from 'react-i18next';
import { localeMap } from '../i18n';
import { generateProjectMetaConfig } from '../lib/projectUtils';

export function useMetaAutoSave() {
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [metaLastSavedTime, setMetaLastSavedTime] = useState<string | null>(null);
  const { i18n } = useTranslation();
  const projectMetaPath = useStore((state) => state.projectMetaPath);
  const projectName = useStore((state) => state.projectName);
  const taxonomyClasses = useStore((state) => state.taxonomyClasses);
  const taxonomyAttributes = useStore((state) => state.taxonomyAttributes);
  const sceneGroups = useStore((state) => state.sceneGroups);
  const folders = useStore((state) => state.folders);
  const views = useStore((state) => state.views);


  useEffect(() => {
    if (!projectMetaPath || !folders || folders.length === 0) return;

    const timer = setTimeout(async () => {
      setMetaSaveStatus('saving');
      try {
        const currentWholeState = useStore.getState();
        const payload = generateProjectMetaConfig(currentWholeState);

        await saveProjectMeta({ file_path: projectMetaPath, content: payload });
        setMetaLastSavedTime(new Date().toLocaleTimeString(localeMap[i18n.language||'en'] || undefined, { hour12: false }));
        setMetaSaveStatus('idle');
      } catch (error) {
        setMetaSaveStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    projectMetaPath, 
    projectName, 
    folders, 
    views, 
    sceneGroups, 
    taxonomyClasses, 
    taxonomyAttributes
  ]); 

  return { metaSaveStatus, metaLastSavedTime };
}