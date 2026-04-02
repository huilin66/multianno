import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';

type Action = { type: 'add' | 'delete', anno: any };

export function useActionHistory() {
  const { currentStem, addAnnotation, removeAnnotation, activeAnnotationId, setActiveAnnotationId } = useStore() as any;
  
  const [actionHistory, setActionHistory] = useState<Action[]>([]);
  const [redoHistory, setRedoHistory] = useState<Action[]>([]);

  // 切换图片时自动清空历史
  useEffect(() => {
    setActionHistory([]);
    setRedoHistory([]);
  }, [currentStem]);

  // 记录新操作
  const pushAction = useCallback((action: Action) => {
    setActionHistory(prev => [...prev, action]);
    setRedoHistory([]); // 发生新操作时，切断未来的重做线
  }, []);

  // 执行对象级撤销
  const performGlobalUndo = useCallback(() => {
    if (actionHistory.length > 0) {
      const lastAction = actionHistory[actionHistory.length - 1];
      setActionHistory(prev => prev.slice(0, -1));
      setRedoHistory(prev => [...prev, lastAction]);
      
      if (lastAction.type === 'add') {
        removeAnnotation(lastAction.anno.id);
        if (activeAnnotationId === lastAction.anno.id) setActiveAnnotationId(null);
      } else if (lastAction.type === 'delete') {
        addAnnotation(lastAction.anno);
      }
    }
  }, [actionHistory, removeAnnotation, addAnnotation, activeAnnotationId, setActiveAnnotationId]);

  // 执行对象级重做
  const performGlobalRedo = useCallback(() => {
    if (redoHistory.length > 0) {
      const redoAction = redoHistory[redoHistory.length - 1];
      setRedoHistory(prev => prev.slice(0, -1));
      setActionHistory(prev => [...prev, redoAction]);
      
      if (redoAction.type === 'add') {
        addAnnotation(redoAction.anno);
        setActiveAnnotationId(redoAction.anno.id);
      } else if (redoAction.type === 'delete') {
        removeAnnotation(redoAction.anno.id);
        if (activeAnnotationId === redoAction.anno.id) setActiveAnnotationId(null);
      }
    }
  }, [redoHistory, addAnnotation, removeAnnotation, setActiveAnnotationId]);

  return { pushAction, performGlobalUndo, performGlobalRedo };
}