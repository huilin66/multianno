// src/lib/projectUtils.ts
import { AppState, useStore, Annotation } from '../store/useStore';
import type { ProjectMetaContract } from '../config/contract';
import { getFileContent } from '../api/client';

export const readProjectJsonFile = (file: File): Promise<ProjectMetaContract> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        // 简单校验一下文件格式
        if (!json.views || !json.folders) {
          throw new Error("Invalid project file format. Missing views or folders.");
        }
        resolve(json as ProjectMetaContract);
      } catch (err) {
        reject(new Error("Failed to parse JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

export function generateProjectMetaConfig(state: AppState): ProjectMetaContract {
  const { folders, views, taxonomyClasses, taxonomyAttributes, sceneGroups } = state;

  return {
        projectName: state.projectName || "Untitled Project",
        workspacePath: state.workspacePath || '',
        sceneGroups: sceneGroups || {},
        taxonomyClasses: taxonomyClasses || [],
        taxonomyAttributes: taxonomyAttributes || [],
        folders: folders.map((f, i) => ({
          Id: i + 1,
          path: f.path,
          suffix: f.suffix || "",
          "files in sceneGroups": f.metadata?.sceneGroupsLoaded || 0,
          "files Skipped": f.metadata?.sceneGroupsSkipped || 0,
          "files total": f.files ? f.files.length : 0,
          "image meta": {
            width: f.metadata?.width || 'Unknown',
            height: f.metadata?.height || 'Unknown',
            bands: f.metadata?.bands || 'Unknown',
            "data type": f.metadata?.fileType || 'uint8'
            }
        })),
        views: views.map((v, i) => {
          const fIndex = folders.findIndex(f => f.id === v.folderId);
          return {
            id: v.isMain ? 'main view' : `aug view ${i}`, 
            "folder id": fIndex >= 0 ? fIndex + 1 : 'Unknown',
            bands: v.bands,
            renderMode: v.bands.length === 3 ? 'rgb' : (v.colormap || 'gray'),
            isMain: v.isMain,
            transform: {
              crop: v.crop || { t: 0, r: 100, b: 100, l: 0 },
              scaleX: v.transform?.scaleX ?? 1,
              scaleY: v.transform?.scaleY ?? (v.transform?.scaleX ?? 1),
              offsetX: v.transform?.offsetX ?? 0,
              offsetY: v.transform?.offsetY ?? 0
            },
            settings: v.settings
          };
        })
  };
}

export const loadAllProjectAnnotations = async (
  stems: string[], 
  mainFolderPath: string,
  onProgress?: (current: number, total: number) => void,
  chunkSize?: number
) => {
  if (!stems || stems.length === 0 || !mainFolderPath) return;

  const allLoadedAnnotations: Annotation[] = [];
  const CHUNK_SIZE = chunkSize || 50; 
  const separator = mainFolderPath.includes('\\') ? '\\' : '/';
  const cleanPath = mainFolderPath.endsWith(separator) ? mainFolderPath : mainFolderPath + separator;

  console.log(`🚀 开始全量加载 ${stems.length} 个场景的标注数据...`);

  for (let i = 0; i < stems.length; i += CHUNK_SIZE) {
    const chunk = stems.slice(i, i + CHUNK_SIZE);
    
    const promises = chunk.map(async (stem) => {
      const jsonPath = `${cleanPath}${stem}.json`;
      try {
        const rawData = await getFileContent(jsonPath);
        const data = typeof rawData.content === 'string' ? JSON.parse(rawData.content) : rawData;
        
        return (data.shapes || []).map((shape: any) => ({
          id: crypto.randomUUID(), 
          stem: stem,
          label: shape.label,
          text: shape.text || '',
          type: shape.shape_type === 'rectangle' ? 'bbox' : shape.shape_type,
          points: shape.points.map((p: any) => ({ x: p[0] ?? p.x, y: p[1] ?? p.y })),
          attributes: shape.attributes || {},
          difficult: shape.difficult || false,
          occluded: shape.occluded || false,
          group_id: shape.group_id
        }));
      } catch (error) {
        return []; 
      }
    });

    const chunkResults = await Promise.all(promises);
    
    chunkResults.forEach(annos => {
      if (annos && annos.length > 0) {
        allLoadedAnnotations.push(...annos);
      }
    });

    useStore.setState({ annotations: [...allLoadedAnnotations] });

    // 🆕 每完成一个 chunk，回调进度
    const completed = Math.min(i + CHUNK_SIZE, stems.length);
    onProgress?.(completed, stems.length);
  }

  console.log(`✅ 全量加载完成！共读取到 ${allLoadedAnnotations.length} 个标注对象。`);
};