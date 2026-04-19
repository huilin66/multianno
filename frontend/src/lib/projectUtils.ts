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

export const loadAllProjectAnnotations = async (stems: string[], mainFolderPath: string) => {
  if (!stems || stems.length === 0 || !mainFolderPath) return;

  const allLoadedAnnotations: Annotation[] = [];
  const CHUNK_SIZE = 50; // 每次并发请求 50 个文件，保护浏览器网络队列

  // 统一路径分隔符
  const separator = mainFolderPath.includes('\\') ? '\\' : '/';
  const cleanPath = mainFolderPath.endsWith(separator) ? mainFolderPath : mainFolderPath + separator;

  console.log(`🚀 开始全量加载 ${stems.length} 个场景的标注数据...`);

  // 分批处理
  for (let i = 0; i < stems.length; i += CHUNK_SIZE) {
    const chunk = stems.slice(i, i + CHUNK_SIZE);
    
    // 生成这一批的 Promise 数组
    // 生成这一批的 Promise 数组
    const promises = chunk.map(async (stem) => {
      const jsonPath = `${cleanPath}${stem}.json`;
      try {
        // 🌟 核心替换：直接调用封装好的 client API，极其清爽！
        const rawData = await getFileContent(jsonPath);
        const data = typeof rawData.content === 'string' ? JSON.parse(rawData.content) : rawData;
        
        // 将后端的 shape 转换为前端的 Annotation 格式
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
        // 文件不存在或解析失败，直接忽略（说明这张图还没标）
        return []; 
      }
    });

    // 等待这一批请求全部完成
    const chunkResults = await Promise.all(promises);
    
    // 拍平数组并收集
    chunkResults.forEach(annos => {
      if (annos && annos.length > 0) {
        allLoadedAnnotations.push(...annos);
      }
    });

    // 🌟 每加载完 50 个，就更新一次内存。这样用户在界面上能看到右侧的数字“刷刷刷”地跳动，体验极佳！
    useStore.setState({ annotations: [...allLoadedAnnotations] });
  }

  console.log(`✅ 全量加载完成！共读取到 ${allLoadedAnnotations.length} 个标注对象。`);
};