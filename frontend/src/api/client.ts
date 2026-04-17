// frontend/src/api/client.ts

// 🌟 1. 定义并导出全局的 Base URL
export const API_BASE_URL = 'http://localhost:8080/api';

export const VISION_AI_API_URL = `${API_BASE_URL}/ai/vision`;


// 🌟 2. 改造你现有的方法，使用模板字符串拼接
export async function scanFolder(path: string) {
  const response = await fetch(`${API_BASE_URL}/scan-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return response.json();
}


// ==========================================
// 🌟 1. 静默保存单张切片的标注 (日常高频调用)
// ==========================================
export async function saveAnnotation(payload: {
  save_dir: string;
  file_name: string;
  content: Record<string, any>; // 这里将传入组装好的 SceneAnnotationJSON
}) {
  const response = await fetch(`${API_BASE_URL}/annotations/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to save annotation');
  }
  return response.json();
}

// ==========================================
// 🌟 2. 批量合并/重命名类别
// ==========================================
export async function batchMergeClass(payload: {
  save_dirs: string[];
  old_names: string[];
  new_name: string;
}) {
  const response = await fetch(`${API_BASE_URL}/taxonomy/merge_class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) throw new Error('Failed to merge classes');
  return response.json(); // 返回格式: { status: "success", modified_files: 15 }
}

// ==========================================
// 🌟 3. 批量删除类别 (支持软硬删除)
// ==========================================
// ==========================================
// 🌟 3. 批量删除类别 (支持软硬删除)
// ==========================================
export async function batchDeleteClass(payload: {
  save_dirs: string[];
  class_name: string;
  hard_delete: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/taxonomy/delete_class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    // 🌟 核心升级：拦截并解析 FastAPI 的具体校验报错
    const errorData = await response.json().catch(() => ({}));
    const errorDetail = errorData.detail 
      ? JSON.stringify(errorData.detail, null, 2) 
      : 'Unknown Backend Error';
    throw new Error(`\n[FastAPI 422 Rejection]:\n${errorDetail}`);
  }
  
  return response.json(); 
}


export function getPreviewImageUrl(
  folderPath: string, 
  fileName: string | undefined, // 🌟 改为可选
  bands: number[], 
  colormap: string = 'gray'
): string {
  const params = new URLSearchParams();
  params.append('folderPath', folderPath);
  
  // 如果传了 fileName 才拼接到 URL 里
  if (fileName) {
    params.append('fileName', fileName);
  }
  
  params.append('bands', bands.join(','));
  params.append('colormap', colormap);
  
  return `${API_BASE_URL}/project/preview?${params.toString()}`;
}
// 🌟 请求流式统计接口，支持实时回调
export const fetchProjectStatisticsStream = async (
  saveDirs: string[],
  targetClass: string,
  onProgress: (current: number, total: number) => void,
  onComplete: (data: any) => void,
  onError: (err: Error) => void
) => {
  try {
    const response = await fetch('/api/stats/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_dirs: saveDirs, target_class: targetClass })
    });

    if (!response.body) throw new Error('ReadableStream not supported.');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 将二进制块解码为字符串，并拼接到缓冲区
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // 最后一行可能是不完整的 JSON，保留在缓冲区等下一次读取
      buffer = lines.pop() || ''; 

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress') {
            onProgress(msg.current, msg.total);
          } else if (msg.type === 'result') {
            onComplete(msg.data);
          }
        } catch (e) {
          console.error("JSON parse error on stream chunk:", line);
        }
      }
    }
  } catch (error: any) {
    onError(error);
  }
};

// ==========================================
// 🌟 5. 获取全局项目统计数据大盘
// ==========================================
export const fetchProjectStatistics = async (saveDirs: string[], forceRefresh: boolean = false) => {
  const response = await fetch(`${API_BASE_URL}/taxonomy/statistics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      save_dirs: saveDirs,
      force_refresh: forceRefresh // 🌟 新增参数
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch project statistics');
  }

  return response.json();
};

export interface SAMPoint {
  x: number;
  y: number;
  label: 1 | 0; // 1 为正样本，0 为负样本
}

export interface SAMInitRequest {
  image_path?: string;
  image_data?: string; // 用于传输 Base64 渲染图
  image_size?: number; // 🌟 新增
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
}

// 2. 🌟 新增：获取后端 AI 真实状态的探针
export const checkVisionAIStatus = async () => {
  try {
    const res = await fetch(`${VISION_AI_API_URL}/status`);
    if (!res.ok) return { is_loaded: false };
    return await res.json();
  } catch (e) {
    return { is_loaded: false }; // 后端没开或者断联
  }
};

// 1. 初始化/预热图片
export const initSAM = async (req: SAMInitRequest) => {
  try {
    const res = await fetch(`${VISION_AI_API_URL}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Backend Internal Error');
    }
    return await res.json();
  } catch (e) {
    // 🌟 区分是“没连接”还是“后端报错”
    if (e instanceof TypeError && e.message === 'Failed to fetch') {
      throw new Error('无法连接到后端服务，请检查 Python 进程是否启动并监听 8080 端口');
    }
    throw e;
  }
};

// 2. 半自动交互 (给点/给框)
export const predictSAM = async (
  imagePath: string, 
  points?: SAMPoint[], 
  box?: number[], 
  conf?: number, // 🌟 1. 加上这第 4 个可选参数
  image_size?: number
) => {
  const res = await fetch(`${VISION_AI_API_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 🌟 2. 把 conf 一起打包发给后端
    body: JSON.stringify({ image_path: imagePath, points, box, conf, image_size }), 
    
  });
  if (!res.ok) throw new Error('SAM Predict Failed');
  return res.json();
};

// 3. 全自动标注 (文本 prompt)
export const autoPredictSAM = async (imagePath: string, texts: string[]) => {
  const res = await fetch(`${VISION_AI_API_URL}/auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path: imagePath, texts }),
  });
  if (!res.ok) throw new Error('SAM Auto Failed');
  return res.json();
};


export const updateAIConfig = async (config: {
  model_path: string;
  model_type: string;
  confidence: number;
}) => {
  const res = await fetch(`${VISION_AI_API_URL}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to update AI config');
  }
  return await res.json();
};


export const predictAutoSAM = async (
  imagePath: string, 
  texts: string[], 
  conf: number,
  image_size?: number
) => {
  const res = await fetch(`${VISION_AI_API_URL}/auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path: imagePath, texts, conf, image_size }), 
  });
  if (!res.ok) throw new Error('Auto Predict Failed');
  return res.json();
};
// src/api/client.ts (最后两个函数替换)

export const batchApplyAttribute = async (payload: { save_dirs: string[], attribute_name: string, new_default: string, old_default?: string }) => {
  console.log("🚀 [Frontend] Sending payload to backend:", payload); 
  
  try {
    // 🌟 修复：加上 `${API_BASE_URL}` 前缀！
    const response = await fetch(`${API_BASE_URL}/taxonomy/apply_attribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Frontend] HTTP Error ${response.status}:`, errorText);
      throw new Error(`Server error ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error("💥 [Frontend] Request completely failed (Aborted or Network Error):", err);
    throw err;
  }
};

export const batchDeleteAttribute = async (payload: { save_dirs: string[], attribute_name: string }) => {
  // 🌟 修复：加上 `${API_BASE_URL}` 前缀！
  const response = await fetch(`${API_BASE_URL}/taxonomy/delete_attribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to delete attribute');
  return response.json();
};


// ==========================================
// 🌟 6. 数据格式导入与导出
// ==========================================
export const processDataExchange = async (payload: {
  source_dirs: string[];
  target_dir: string;
  format: string;
  mode: 'import' | 'export';
}) => {
  const response = await fetch(`${API_BASE_URL}/exchange/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to process ${payload.mode}`);
  }

  return response.json();
};