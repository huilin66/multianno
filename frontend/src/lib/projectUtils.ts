// src/lib/projectUtils.ts
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