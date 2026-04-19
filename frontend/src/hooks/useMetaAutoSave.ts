import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveProjectMeta } from '../api/client';
import { generateProjectMetaConfig } from '../lib/projectUtils'; // 🌟 引入统一生成器

export function useMetaAutoSave() {
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [metaLastSavedTime, setMetaLastSavedTime] = useState<string | null>(null);
  const projectMetaPath = useStore((state: any) => state.projectMetaPath);
  const projectName = useStore((state: any) => state.projectName);
  const taxonomyClasses = useStore((state: any) => state.taxonomyClasses);
  const taxonomyAttributes = useStore((state: any) => state.taxonomyAttributes);
  const sceneGroups = useStore((state: any) => state.sceneGroups);
  const folders = useStore((state: any) => state.folders);
  const views = useStore((state: any) => state.views);


  useEffect(() => {
    // 只有在确定了项目路径且有基础数据时才启动
    if (!projectMetaPath || !folders || folders.length === 0) return;

    const timer = setTimeout(async () => {
      setMetaSaveStatus('saving');
      try {
        // 🌟 使用规范的生成器提取全量数据
        const currentWholeState = useStore.getState();
        const payload = generateProjectMetaConfig(currentWholeState);

        await saveProjectMeta({ file_path: projectMetaPath, content: payload });
        
        setMetaSaveStatus('idle');
        
        // 🌟 2. 补上缺失的时间记录逻辑 (格式化为 HH:mm:ss)
        const now = new Date();
        setMetaLastSavedTime(now.toLocaleTimeString('zh-CN', { hour12: false }));
        
      } catch (error) {
        console.error("Meta auto-save failed:", error);
        setMetaSaveStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
    // 🌟 依赖项精简，只要这些核心数据变了就触发保存
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