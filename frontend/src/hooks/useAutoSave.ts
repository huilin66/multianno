import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveAnnotation } from '../api/client'; // 确保路径正确

export function useAutoSave() {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  // 🌟 新增：记录最后保存时间
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null); 
  
  const { currentStem, annotations } = useStore() as any;

  useEffect(() => {
    if (!currentStem) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const state = useStore.getState();
        
        // 🌟 拦截 1：如果项目被重置，根本没有文件夹，直接静默退出！
        if (!state.folders || state.folders.length === 0) {
          setSaveStatus('idle');
          return;
        }

        const currentAnnotations = state.annotations.filter((a: any) => a.stem === currentStem);
        const mainViewFolder = state.folders.find((f: any) => f.id === state.views.find((v: any) => v.isMain)?.folderId) || state.folders[0];

        const saveDir = mainViewFolder?.path || '';
        
        // 🌟 拦截 2：如果提取不到有效路径，直接静默退出，避免后端报空路径错误！
        if (!saveDir) {
          setSaveStatus('idle');
          return;
        }

        const fileName = `${currentStem}.json`;
        const payload = {
          version: "1.0.0",
          flags: {},
          stem: currentStem,
          projectName: state.projectName || 'Untitled Project',
          imageDescription: "",
          imageNameMain: state.sceneGroups?.[currentStem]?.[mainViewFolder?.path] || `${currentStem}.tif`,
          imageHeight: mainViewFolder?.metadata?.height || 1024,
          imageWidth: mainViewFolder?.metadata?.width || 1024,
          shapes: currentAnnotations.map((ann: any) => ({
            label: ann.label,
            text: ann.text || "",
            points: ann.points.map((p: any) => [p.x, p.y]), 
            group_id: ann.group_id || null,
            shape_type: (() => {
                if (ann.type === 'bbox') return 'rectangle';
                if (ann.type === 'point') return 'point';
                if (ann.type === 'line') return 'linestrip';
                if (ann.type === 'ellipse') return 'ellipse';
                if (ann.type === 'circle') return 'circle';
                if (ann.type === 'lasso') return 'lasso';
                return 'polygon';
              })(),
            flags: {},
            attributes: ann.attributes || {},
            difficult: ann.difficult || false
          }))
        };

        if (typeof saveAnnotation === 'function') {
           await saveAnnotation({ save_dir: saveDir, file_name: fileName, content: payload });
           
           // 🌟 成功写入后，记录当前精确时间 (例如: "14:35:22")
           setLastSavedTime(new Date().toLocaleTimeString(undefined, { hour12: false }));
        }
        setSaveStatus('idle');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 1000); 

    return () => clearTimeout(timer);
  }, [annotations, currentStem]); 

  // 🌟 将最后保存时间暴露给 UI 层
  return { saveStatus, lastSavedTime };
}