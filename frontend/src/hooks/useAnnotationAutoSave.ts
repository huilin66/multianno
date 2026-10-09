import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { saveDirtyAnnotations } from '../lib/annotationSaveService';

export function useAnnotationAutoSave() {
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const currentStem = useStore((s) => s.currentStem);
  const isAnnotationDirty = useStore((s) => s.isAnnotationDirty);
  const dirtyAnnotationStems = useStore((s) => s.dirtyAnnotationStems);
  const setAnnotationLastSavedTime = useStore((s) => s.setAnnotationLastSavedTime);
  const autoSave = useCallback(async (): Promise<boolean> => {
    if (!useStore.getState().isAnnotationDirty) return true;
    setAnnotationSaveStatus('saving');
    try {
      // Track ID editing can dirty several scenes while the active scene
      // changes. Flush the complete dirty set instead of saving only the
      // currently visible scene.
      await saveDirtyAnnotations();
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
    if (!isAnnotationDirty || dirtyAnnotationStems.length === 0) return;

    const timer = setTimeout(() => {
      void autoSave();
    }, 1000); 

    return () => clearTimeout(timer);
  }, [currentStem, dirtyAnnotationStems, isAnnotationDirty, autoSave]);
  return { annotationSaveStatus, autoSave};
}
