import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';

type Action = { type: 'add' | 'delete' | 'edit' | 'batch', anno?: any, batch?: Action[] };

export function useActionHistory() {
  const { currentStem, addAnnotation, removeAnnotation, updateAnnotation, activeAnnotationId, setActiveAnnotationId } = useStore() as any;
  
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
    setRedoHistory([]);
  }, []);

  // 🌟 递归执行所有 action（正向执行）
  const executeActions = useCallback((actions: Action[], isInverse: boolean) => {
    // 逆向操作时反转数组顺序（后删除的先恢复）
    const ordered = isInverse ? [...actions].reverse() : actions;
    
    ordered.forEach(action => {
      if (action.type === 'batch' && action.batch) {
        // 递归处理批量操作
        executeActions(action.batch, isInverse);
      } else if (action.type === 'add') {
        if (isInverse) {
          // 逆向：删除添加的对象
          removeAnnotation(action.anno.id);
          if (activeAnnotationId === action.anno.id) setActiveAnnotationId(null);
        } else {
          // 正向：重新添加
          addAnnotation(action.anno);
          setActiveAnnotationId(action.anno.id);
        }
      } else if (action.type === 'delete') {
        if (isInverse) {
          // 逆向：恢复删除的对象
          addAnnotation(action.anno);
        } else {
          // 正向：重新删除
          removeAnnotation(action.anno.id);
          if (activeAnnotationId === action.anno.id) setActiveAnnotationId(null);
        }
      } else if (action.type === 'edit') {
        // 🌟 edit 类型：用 anno 中保存的快照直接恢复
        updateAnnotation(action.anno.id, action.anno);
      }
    });
  }, [addAnnotation, removeAnnotation, updateAnnotation, activeAnnotationId, setActiveAnnotationId]);

  // 执行撤销
  const performGlobalUndo = useCallback(() => {
    if (actionHistory.length === 0) return;
    
    const lastAction = actionHistory[actionHistory.length - 1];
    setActionHistory(prev => prev.slice(0, -1));
    setRedoHistory(prev => [...prev, lastAction]);
    
    executeActions([lastAction], true);
  }, [actionHistory, executeActions]);

  // 执行重做
  const performGlobalRedo = useCallback(() => {
    if (redoHistory.length === 0) return;
    
    const redoAction = redoHistory[redoHistory.length - 1];
    setRedoHistory(prev => prev.slice(0, -1));
    setActionHistory(prev => [...prev, redoAction]);
    
    executeActions([redoAction], false);
  }, [redoHistory, executeActions]);

  return { 
    pushAction, 
    performGlobalUndo, 
    performGlobalRedo,
    undoCount: actionHistory.length,
    redoCount: redoHistory.length
  };
}