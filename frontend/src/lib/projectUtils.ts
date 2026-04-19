// src/lib/projectUtils.ts
import { AppState } from '../store/useStore';
import type { ProjectMetaContract } from '../config/contract';

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