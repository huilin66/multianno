// src/lib/annotationUtils.ts
import { AppState, useStore, Annotation } from '../store/useStore';
import { getFileContent } from '../api/client';

/**
 * ==========================================
 * 1. 核心工具：前后端 Shape Type 双向映射
 * ==========================================
 */
const mapDiskTypeToFrontend = (diskType: string) => {
  return diskType === 'rectangle' ? 'bbox' : diskType;
};

const mapFrontendTypeToDiskType = (frontendType: string) => {
  const typeMap: Record<string, string> = {
    'bbox': 'rectangle',
    'point': 'point',
    'line': 'linestrip',
    'ellipse': 'ellipse',
    'circle': 'circle',
    'lasso': 'lasso',
  };
  return typeMap[frontendType] || 'polygon';
};

/**
 * ==========================================
 * 2. 读逻辑 (Read / Import)
 * ==========================================
 * 批量加载所有场景的标注数据，并转换为前端使用的状态格式
 */
export const loadAllProjectAnnotations = async (stems: string[], mainFolderPath: string) => {
  if (!stems || stems.length === 0 || !mainFolderPath) return;

  const allLoadedAnnotations: Annotation[] = [];
  const CHUNK_SIZE = 50; // 每次并发请求 50 个文件，保护浏览器网络队列

  // 统一路径分隔符
  const separator = mainFolderPath.includes('\\') ? '\\' : '/';
  const cleanPath = mainFolderPath.endsWith(separator) ? mainFolderPath : mainFolderPath + separator;

  console.log(`🚀 开始全量加载 ${stems.length} 个场景的标注数据...`);

  // 分批处理[cite: 4]
  for (let i = 0; i < stems.length; i += CHUNK_SIZE) {
    const chunk = stems.slice(i, i + CHUNK_SIZE);
    
    const promises = chunk.map(async (stem) => {
      const jsonPath = `${cleanPath}${stem}.json`;
      try {
        // 调用封装好的 client API 获取原文件[cite: 4]
        const rawData = await getFileContent(jsonPath);
        const data = typeof rawData.content === 'string' ? JSON.parse(rawData.content) : rawData;
        
        // 将后端的 shape 转换为前端的 Annotation 格式[cite: 4]
        return (data.shapes || []).map((shape: any) => ({
          id: crypto.randomUUID(), 
          stem: stem,
          label: shape.label,
          text: shape.text || '',
          type: mapDiskTypeToFrontend(shape.shape_type), // 使用映射函数
          // 兼容后端数组 [x,y] 或对象 {x,y} 格式[cite: 4]
          points: shape.points.map((p: any) => ({ x: p[0] ?? p.x, y: p[1] ?? p.y })),
          attributes: shape.attributes || {},
          difficult: shape.difficult || false,
          occluded: shape.occluded || false,
          group_id: shape.group_id
        }));
      } catch (error) {
        // 文件不存在或解析失败，直接忽略（说明这张图还没标）[cite: 4]
        return []; 
      }
    });

    // 等待这一批请求全部完成[cite: 4]
    const chunkResults = await Promise.all(promises);
    
    // 拍平数组并收集[cite: 4]
    chunkResults.forEach(annos => {
      if (annos && annos.length > 0) {
        allLoadedAnnotations.push(...annos);
      }
    });

    // 🌟 每加载完 50 个，就更新一次内存，实现 UI 进度跳动体验[cite: 4]
    useStore.setState({ annotations: [...allLoadedAnnotations] });
  }

  console.log(`✅ 全量加载完成！共读取到 ${allLoadedAnnotations.length} 个标注对象。`);
};

/**
 * ==========================================
 * 3. 写逻辑 (Write / Export)
 * ==========================================
 * 根据当前的全局状态和目标 Stem，生成符合系统落盘标准的标注 JSON Payload
 */
export const generateAnnotationPayload = (state: AppState, currentStem: string) => {
  // 1. 获取主视图所在的文件夹，以确定主图像基准
  const mainViewFolder = state.folders.find(
    (f: any) => f.id === state.views.find((v: any) => v.isMain)?.folderId
  ) || state.folders[0];

  // 2. 过滤出当前场景组下的所有标注
  const currentAnnotations = state.annotations.filter((a: any) => a.stem === currentStem);

  // 3. 构建并返回标准化 Payload (兼容 LabelMe / AnyLabeling 格式)
  return {
    version: "1.0.0",
    flags: {},
    stem: currentStem,
    projectName: state.projectName || 'Untitled Project',
    imageDescription: "",
    // 主视图图像名称和尺寸映射
    imageNameMain: state.sceneGroups?.[currentStem]?.[mainViewFolder?.path] || `${currentStem}.tif`,
    imageHeight: mainViewFolder?.metadata?.height || 1024,
    imageWidth: mainViewFolder?.metadata?.width || 1024,
    
    // 逆向映射：前端状态 -> 后端落盘格式
    shapes: currentAnnotations.map((ann: any) => ({
      label: ann.label,
      text: ann.text || "",
      // 将前端的 {x, y} 转换为后端的 [x, y] 数组
      points: ann.points.map((p: any) => [p.x, p.y]), 
      group_id: ann.group_id || null,
      shape_type: mapFrontendTypeToDiskType(ann.type), // 使用映射函数
      flags: {},
      attributes: ann.attributes || {},
      difficult: ann.difficult || false,
      occluded: ann.occluded || false,
      truncated: ann.truncated || false
    }))
  };
};