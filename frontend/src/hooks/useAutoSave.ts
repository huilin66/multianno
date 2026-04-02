import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveAnnotation } from '../api/client'; // 确保路径正确

export function useAutoSave() {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const { 
    currentStem, annotations, projectName, folders, views, sceneGroups 
  } = useStore() as any;

  useEffect(() => {
    const currentAnnotations = annotations.filter((a: any) => a.stem === currentStem);
    if (!currentStem || currentAnnotations.length === 0) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const mainViewFolder = folders.find((f: any) => f.id === views.find((v: any) => v.isMain)?.folderId);

        // 组装标准 Scene JSON 数据格式
        const payload = {
          version: "1.0.0",
          flags: {},
          stem: currentStem,
          projectName: projectName || 'Untitled Project',
          imageDescription: "",
          imageNameMain: sceneGroups?.[currentStem]?.[mainViewFolder?.path] || `${currentStem}.tif`,
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

        const saveDir = mainViewFolder?.path || '';
        const fileName = `${currentStem}.json`;

        if (typeof saveAnnotation === 'function') {
           await saveAnnotation({ save_dir: saveDir, file_name: fileName, content: payload });
        }
        setSaveStatus('idle');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [annotations, currentStem, projectName, folders, views, sceneGroups]);

  return { saveStatus };
}