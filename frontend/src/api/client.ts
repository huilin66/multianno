// frontend/src/api/client.ts

// 🌟 1. 定义并导出全局的 Base URL
export const API_BASE_URL = 'http://localhost:8080/api';

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
  
  if (!response.ok) throw new Error('Failed to delete class');
  return response.json(); // 返回格式: { status: "success", modified_files: 8 }
}

// ==========================================
// 🌟 4. 批量删除属性
// ==========================================
export async function batchDeleteAttribute(payload: {
  save_dirs: string[];
  attribute_name: string;
}) {
  const response = await fetch(`${API_BASE_URL}/taxonomy/delete_attribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) throw new Error('Failed to delete attribute');
  return response.json(); // 返回格式: { status: "success", modified_files: 42 }
}

// export function getPreviewImageUrl(
//   folderPath: string, 
//   fileName: string, 
//   bands: number[], 
//   colormap: string = 'gray'
// ): string {
//   const params = new URLSearchParams({
//     folderPath: folderPath,
//     fileName: fileName,
//     bands: bands.join(','),
//     colormap: colormap
//   });
  
//   return `${API_BASE_URL}/project/preview?${params.toString()}`;
// }


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


// 💡 进阶建议：以后你甚至可以把 DataPreload 和 FileExplorerDialog 里的 fetch
// 也封装成类似上面的函数（例如 exploreFileSystem, analyzeProject）全放在这里，
// 然后在组件里直接调用函数，这样 UI 组件和网络请求就彻底解耦了！