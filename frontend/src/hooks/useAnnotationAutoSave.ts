import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveAnnotation } from '../api/client';
import { useTranslation } from 'react-i18next';
import { localeMap } from '../i18n';
import { generateAnnotationPayload } from '../lib/annotationUtils';

export function useAnnotationAutoSave() {
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [annotationLastSavedTime, setAnnotationLastSavedTime] = useState<string | null>(null); 
  const { i18n } = useTranslation();
  const currentStem = useStore((state) => state.currentStem);
  const annotations = useStore((state) => state.annotations);
  

  useEffect(() => {
    if (!currentStem) return;

    const timer = setTimeout(async () => {
      setAnnotationSaveStatus('saving');
      try {
        const state = useStore.getState();
        const mainViewFolder = state.folders.find((f: any) => f.id === state.views.find((v: any) => v.isMain)?.folderId) || state.folders[0];
        const saveDir = mainViewFolder?.path || '';
        if (!state.folders || state.folders.length === 0 || !saveDir) {
          setAnnotationSaveStatus('idle');
          return;
        }

        const currentAnnotations = state.annotations.filter((a: any) => a.stem === currentStem);
        const fileName = `${currentStem}.json`;
        const payload = generateAnnotationPayload(state, currentStem);

        await saveAnnotation({ save_dir: saveDir, file_name: fileName, content: payload });
        setAnnotationLastSavedTime(new Date().toLocaleTimeString(localeMap[i18n.language||'en'] || undefined, { hour12: false }));
        setAnnotationSaveStatus('idle');
      } catch (error) {
        setAnnotationSaveStatus('error');
      }
    }, 1000); 

    return () => clearTimeout(timer);
  }, [annotations, currentStem]); 

  return {annotationSaveStatus, annotationLastSavedTime};
}