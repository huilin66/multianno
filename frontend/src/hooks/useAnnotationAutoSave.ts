import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useTranslation } from 'react-i18next';
import { localeMap } from '../i18n';
import { saveCurrentAnnotations } from '../lib/annotationSaveService';

export function useAnnotationAutoSave() {
  const { i18n } = useTranslation();
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const currentStem = useStore((s) => s.currentStem);
  const annotations = useStore((s) => s.annotations);
  const isAnnotationDirty = useStore((s) => s.isAnnotationDirty);
  const setAnnotationLastSavedTime = useStore((s) => s.setAnnotationLastSavedTime);
  const autoSave = useCallback(async (): Promise<boolean> => {
    if (!useStore.getState().currentStem) return true;
    setAnnotationSaveStatus('saving');
    try {
      await saveCurrentAnnotations();
      const timeStr = new Date().toLocaleTimeString(localeMap[i18n.language || 'en'] || undefined, { hour12: false });
      setAnnotationLastSavedTime(timeStr);
      setAnnotationSaveStatus('idle');
      return true;
    } catch {
      setAnnotationSaveStatus('error');
      return false;
    }
  }, [i18n.language, setAnnotationLastSavedTime]);

  useEffect(() => {
    if (!currentStem) return;
    if (!isAnnotationDirty) return;

    const timer = setTimeout(() => {
      void autoSave();
    }, 1000); 

    return () => clearTimeout(timer);
  }, [annotations, currentStem, isAnnotationDirty, autoSave]);
  return { annotationSaveStatus, autoSave};
}
