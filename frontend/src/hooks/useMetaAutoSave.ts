// src/hooks/useMetaAutoSave.ts
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { saveProjectMeta } from '../api/client';
import { useTranslation } from 'react-i18next';
import { localeMap } from '../i18n';
import { generateProjectMetaConfig } from '../lib/projectUtils';

export function useMetaAutoSave() {
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { i18n } = useTranslation();
  
  const projectMetaPath = useStore((s) => s.projectMetaPath);
  const taxonomyClasses = useStore((s) => s.taxonomyClasses);
  const taxonomyAttributes = useStore((s) => s.taxonomyAttributes);
  const sceneGroups = useStore((s) => s.sceneGroups);
  const folders = useStore((s) => s.folders);
  const views = useStore((s) => s.views);
  
  const setMetaLastSavedTime = useStore((s) => s.setMetaLastSavedTime);
  
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 🌟 记录初始状态的快照
  const initialSnapshotRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!projectMetaPath || !folders || folders.length === 0) return;

    // 🌟 生成当前快照
    const currentSnapshot = JSON.stringify({
      taxonomyClasses: taxonomyClasses.map(c => ({ id: c.id, name: c.name, color: c.color })),
      taxonomyAttributes: taxonomyAttributes.map(a => ({ id: a.id, name: a.name, options: a.options })),
      sceneGroups,
      folders: folders.map(f => f.path).sort(),
      views: views.map(v => ({ id: v.id, folderId: v.folderId, bands: v.bands, isMain: v.isMain })),
    });

    // 🌟 首次：记录初始快照，不触发保存
    if (!hasInitializedRef.current) {
      initialSnapshotRef.current = currentSnapshot;
      hasInitializedRef.current = true;
      return;
    }

    // 🌟 和初始快照一样 = 没变化，跳过
    if (currentSnapshot === initialSnapshotRef.current) {
      return;
    }

    // 🌟 真正有变化了，标记脏数据
    isDirtyRef.current = true;

  }, [
    projectMetaPath,
    taxonomyClasses,
    taxonomyAttributes,
    sceneGroups,
    folders,
    views,
  ]);

  // 🌟 独立的保存定时器
  useEffect(() => {
    if (!isDirtyRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!isDirtyRef.current) return;
      
      setMetaSaveStatus('saving');
      try {
        const currentWholeState = useStore.getState();
        const payload = generateProjectMetaConfig(currentWholeState);
        await saveProjectMeta({ file_path: projectMetaPath, content: payload });
        
        const timeStr = new Date().toLocaleTimeString(
          localeMap[i18n.language || 'en'] || undefined, 
          { hour12: false }
        );
        setMetaLastSavedTime(timeStr);
        setMetaSaveStatus('saved');
        isDirtyRef.current = false;
        
        setTimeout(() => setMetaSaveStatus('idle'), 2000);
      } catch (error) {
        setMetaSaveStatus('error');
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirtyRef.current]);

  return { 
    metaSaveStatus, 
    metaLastSavedTime: useStore((s) => s.metaLastSavedTime),
    isDirty: isDirtyRef.current 
  };
}