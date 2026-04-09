import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { saveAnnotation } from '../api/client'; // 确保路径正确

export function useAutoSave() {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  
  // 🌟 优化 1：只从 Hook 中解构最核心的触发依赖
  const { currentStem, annotations } = useStore() as any;

  useEffect(() => {
    // 🌟 优化 2：去掉了 length === 0 的拦截。只要存在 currentStem 就允许执行，确保删除所有标注后能存入空数组
    if (!currentStem) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        // 🌟 优化 3：在保存触发的瞬间，动态抓取最新的全局状态，避免将庞大对象塞进依赖数组导致无限重渲染
        const state = useStore.getState();
        const currentAnnotations = state.annotations.filter((a: any) => a.stem === currentStem);
        const mainViewFolder = state.folders.find((f: any) => f.id === state.views.find((v: any) => v.isMain)?.folderId);

        // 组装标准 Scene JSON 数据格式
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
    }, 1000); // 1秒防抖

    return () => clearTimeout(timer);
  }, [annotations, currentStem]); // 🌟 优化 4：依赖项极致精简，只有画图或切图时才触发！

  return { saveStatus };
}