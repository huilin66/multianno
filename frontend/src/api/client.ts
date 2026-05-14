// frontend/src/api/client.ts

// ==========================================
// 基础配置
// ==========================================
export const API_BASE_URL = 'http://localhost:8080/api';
const VISION_AI_API_URL = `${API_BASE_URL}/ai/vision`;

// ==========================================
// 通用请求辅助
// ==========================================
const post = async (url: string, body: any) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Request failed');
  }
  return response.json();
};

const get = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Request failed');
  }
  return response.json();
};

// ==========================================
// 项目配置 (Project Meta)
// ==========================================
export const saveProjectMeta = (payload: { file_path: string; content: any }) =>
  post(`${API_BASE_URL}/project/save_meta`, payload);

export const loadProjectMetaFromServer = (file_path: string) =>
  get(`${API_BASE_URL}/project/load_meta?file_path=${encodeURIComponent(file_path)}`);

export const analyzeWorkspaceFolders = (folders: { path: string; suffix?: string }[]) =>
  post(`${API_BASE_URL}/project/analyze`, { folders });

// ==========================================
// 工作区 (Workspace)
// ==========================================
export const checkWorkspaceJson = (path: string) =>
  post(`${API_BASE_URL}/workspace/check-json`, { path });

// ==========================================
// 标注 (Annotations)
// ==========================================
export const saveAnnotation = (payload: {
  save_dir: string;
  file_name: string;
  content: Record<string, any>;
}) => post(`${API_BASE_URL}/annotations/save`, payload);

export const getFileContent = (path: string) =>
  get(`${API_BASE_URL}/exchange/read_text?path=${encodeURIComponent(path)}`);

// ==========================================
// 分类学 (Taxonomy)
// ==========================================
export const batchMergeClass = (payload: {
  save_dirs: string[];
  old_names: string[];
  new_name: string;
}) => post(`${API_BASE_URL}/taxonomy/merge_class`, payload);

export const batchDeleteClass = (payload: {
  save_dirs: string[];
  class_name: string;
  hard_delete: boolean;
}) => post(`${API_BASE_URL}/taxonomy/delete_class`, payload);

export const batchApplyAttribute = (payload: {
  save_dirs: string[];
  attribute_name: string;
  new_default: string;
  old_default?: string;
}) => post(`${API_BASE_URL}/taxonomy/apply_attribute`, payload);

export const batchDeleteAttribute = (payload: {
  save_dirs: string[];
  attribute_name: string;
}) => post(`${API_BASE_URL}/taxonomy/delete_attribute`, payload);

export const repairData = (
  saveDirs: string[],
  stems: string[],
  repairTypes: string[] = ['stem']
) => post(`${API_BASE_URL}/taxonomy/repair`, { save_dirs: saveDirs, stems, repair_types: repairTypes });

export const batchMergeClassWithAttribute = (params: {
  save_dirs: string[];
  merges: { old_name: string; new_name: string; attribute_name: string; attribute_value: string }[];
}) => post(`${API_BASE_URL}/taxonomy/merge_with_attribute`, params);

export const fetchProjectStatistics = (saveDirs: string[], forceRefresh = false) =>
  post(`${API_BASE_URL}/taxonomy/statistics`, { save_dirs: saveDirs, force_refresh: forceRefresh });

// ==========================================
// 数据交换 (Exchange)
// ==========================================
export const exportData = (payload: any) =>
  post(`${API_BASE_URL}/exchange/export`, payload);

export const importData = (payload: any) =>
  post(`${API_BASE_URL}/exchange/import`, payload);

// ==========================================
// 文件系统 (File System)
// ==========================================
export const exploreDirectory = async (path: string) => {
  const savedHistory = localStorage.getItem('multiAnno_recentPaths');
  let historyParams = '';
  if (savedHistory) {
    try {
      const paths = JSON.parse(savedHistory);
      if (Array.isArray(paths)) {
        historyParams = paths.map((p: string) => `&history=${encodeURIComponent(p)}`).join('');
      }
    } catch (e) {
      console.error('Failed to parse history', e);
    }
  }
  return get(`${API_BASE_URL}/fs/explore?path=${encodeURIComponent(path)}${historyParams}`);
};

export const createFolder = (path: string, name: string) =>
  post(`${API_BASE_URL}/fs/mkdir`, { path, name: name.trim() });

// ==========================================
// AI 视觉 (Vision AI)
// ==========================================
export const checkVisionAIStatus = async () => {
  try {
    return await get(`${VISION_AI_API_URL}/status`);
  } catch {
    return { is_loaded: false };
  }
};

export const updateAIConfig = (config: {
  model_path: string;
  model_type: string;
  confidence: number;
}) => post(`${VISION_AI_API_URL}/config`, config);

export const initSAM = (req: {
  image_path?: string;
  image_data?: string;
  image_size?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
}) => post(`${VISION_AI_API_URL}/init`, req);

export const predictSAM = (
  imagePath: string,
  points?: { x: number; y: number; label: 1 | 0 }[],
  box?: number[],
  conf?: number,
  image_size?: number
) => post(`${VISION_AI_API_URL}/predict`, { image_path: imagePath, points, box, conf, image_size });

export const predictAutoSAM = (
  imagePath: string,
  texts: string[],
  conf: number,
  image_size?: number
) => post(`${VISION_AI_API_URL}/auto`, { image_path: imagePath, texts, conf, image_size });

// ==========================================
// 可视化 (Visualization)
// ==========================================
export const requestVisPreview = (payload: any) =>
  post(`${API_BASE_URL}/vis/preview`, payload);

export const requestVisExportStream = async (payload: any, onProgress: (p: number) => void) => {
  const response = await fetch(`${API_BASE_URL}/vis/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error('Export service unavailable');
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'progress' || data.type === 'complete') onProgress(data.percent);
          if (data.type === 'error') throw new Error(data.message);
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { success: true };
};

// ==========================================
// 其他工具
// ==========================================
export const getPreviewImageUrl = (
  folderPath: string,
  fileName: string | undefined,
  bands: number[],
  colormap = 'gray'
) => {
  const params = new URLSearchParams({ folderPath, bands: bands.join(','), colormap });
  if (fileName) params.append('fileName', fileName);
  return `${API_BASE_URL}/project/preview?${params.toString()}`;
};

export const prefetchImages = async (paths: string[]) => {
  try {
    await post(`${API_BASE_URL}/project/prefetch`, { paths });
  } catch {
    // 静默失败
  }
};

export const fetchProjectStatisticsStream = async (
  saveDirs: string[],
  targetClass: string,
  onProgress: (current: number, total: number) => void,
  onComplete: (data: any) => void,
  onError: (err: Error) => void
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/stats/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_dirs: saveDirs, target_class: targetClass }),
    });

    if (!response.body) throw new Error('ReadableStream not supported');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress') onProgress(msg.current, msg.total);
          else if (msg.type === 'result') onComplete(msg.data);
        } catch (e) {
          console.error('JSON parse error:', line);
        }
      }
    }
  } catch (error: any) {
    onError(error);
  }
};

// 保留 scanFolder（如果其他地方有用）
export const scanFolder = (path: string) =>
  post(`${API_BASE_URL}/scan-folder`, { path });