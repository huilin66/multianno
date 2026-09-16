import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { saveCurrentAnnotations } from '../lib/annotationSaveService';

export function useAnnotationAutoSave() {
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
      setAnnotationLastSavedTime(new Date().toISOString());
      setAnnotationSaveStatus('idle');
      return true;
    } catch {
      setAnnotationSaveStatus('error');
      return false;
    }
  }, [setAnnotationLastSavedTime]);

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
