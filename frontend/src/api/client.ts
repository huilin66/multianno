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

// 💡 进阶建议：以后你甚至可以把 DataPreload 和 FileExplorerDialog 里的 fetch
// 也封装成类似上面的函数（例如 exploreFileSystem, analyzeProject）全放在这里，
// 然后在组件里直接调用函数，这样 UI 组件和网络请求就彻底解耦了！