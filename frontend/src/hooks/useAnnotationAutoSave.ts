import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { saveAnnotation } from '../api/client';
import { useTranslation } from 'react-i18next';
import { localeMap } from '../i18n';
import { generateAnnotationPayload } from '../lib/annotationUtils';

export function useAnnotationAutoSave() {
  const { i18n } = useTranslation();
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const currentStem = useStore((s) => s.currentStem);
  const annotations = useStore((s) => s.annotations);
  const isAnnotationDirty = useStore((s) => s.isAnnotationDirty);
  const clearAnnotationDirty = useStore((s) => s.clearAnnotationDirty);
  const setAnnotationLastSavedTime = useStore((s) => s.setAnnotationLastSavedTime);
  const autoSave = async () => {
    if (!currentStem) return;
    setAnnotationSaveStatus('saving');
    try {
      const state = useStore.getState();
      const mainViewFolder = state.folders.find(
        (f: any) => f.id === state.views.find((v: any) => v.isMain)?.folderId
      ) || state.folders[0];
      const saveDir = mainViewFolder?.path || '';
      if (!state.folders || state.folders.length === 0 || !saveDir) {
        setAnnotationSaveStatus('idle');
        return;
      }

      const fileName = `${currentStem}.json`;
      const payload = generateAnnotationPayload(state, currentStem);

      await saveAnnotation({ save_dir: saveDir, file_name: fileName, content: payload });
      const timeStr = new Date().toLocaleTimeString(localeMap[i18n.language || 'en'] || undefined, { hour12: false });
      setAnnotationLastSavedTime(timeStr);
      setAnnotationSaveStatus('idle');
      clearAnnotationDirty();
    } catch (error) {
      setAnnotationSaveStatus('error');
    }
  };

  useEffect(() => {
    if (!currentStem) return;
    if (!isAnnotationDirty) return;

    const timer = setTimeout(() => {
      autoSave();
    }, 1000); 

    return () => clearTimeout(timer);
  }, [annotations, currentStem, isAnnotationDirty]); 
  return { annotationSaveStatus, autoSave};
}