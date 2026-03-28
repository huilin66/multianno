import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Folder, ChevronRight, CheckSquare, Square, ArrowLeft, File } from 'lucide-react';

interface ExplorerItem {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

interface FileExplorerDialogProps {
  open: boolean;
  initialPath: string;
  onClose: () => void;
  onConfirm: (selectedPaths: string[]) => void;
}

export function FileExplorerDialog({ open, initialPath, onClose, onConfirm }: FileExplorerDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [parentPath, setParentPath] = useState(''); // 新增：保存上一级路径
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // 🚀 核心修改：这里变成了真正的后端请求！
const fetchDirectory = async (targetPath: string) => {
    setLoading(true);
    try {
      // 🌟 1. 从前端静默读取历史记录
      const savedHistory = localStorage.getItem('multiAnno_recentPaths');
      let historyParams = '';
      if (savedHistory) {
        try {
          const paths = JSON.parse(savedHistory);
          if (Array.isArray(paths)) {
            // 将数组转化为 &history=xxx&history=yyy 的格式
            historyParams = paths.map(p => `&history=${encodeURIComponent(p)}`).join('');
          }
        } catch(e) {
          console.error("解析历史记录失败", e);
        }
      }
      
      // 🌟 2. 带着历史记录向后端发请求
      const url = `http://localhost:8080/api/fs/explore?path=${encodeURIComponent(targetPath)}${historyParams}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const errorData = await res.json();
        const errorMsg = errorData.error || errorData.detail || "未知错误";
        alert(`读取失败: ${errorMsg}`);
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      setItems(data.items);
      setCurrentPath(data.current_path);
      
    } catch (e) {
      console.error(e);
      alert("无法连接到 Python 后端，请检查 FastAPI 服务状态。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      // 每次打开弹窗时，如果输入了路径就去那个路径，没有就传空字符串，触发后端返回盘符根目录
      fetchDirectory(initialPath || ''); 
      setSelectedPaths(new Set()); 
    }
  }, [open, initialPath]);

  const toggleSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedPaths(next);
  };

  // 🚀 修改：返回上一级直接使用后端提供的 parentPath
const handleNavigateUp = () => {
    if (!currentPath || currentPath === '/') {
      fetchDirectory('');
      return;
    }

    // 去除末尾斜杠，统一反斜杠
    let normalized = currentPath.replace(/\\/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    const lastSlashIndex = normalized.lastIndexOf('/');
    
    if (lastSlashIndex > 0) {
      let nextPath = normalized.slice(0, lastSlashIndex);
      // 如果切完只剩盘符 (比如 E:)，补上斜杠变成 E:/
      if (/^[a-zA-Z]:$/.test(nextPath)) {
        nextPath += '/';
      }
      fetchDirectory(nextPath);
    } else if (lastSlashIndex === 0) {
      // 针对 Linux/Mac 的根目录情况
      fetchDirectory('/');
    } else {
      fetchDirectory('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl bg-neutral-950 border-neutral-800 text-neutral-200">
        <DialogHeader>
          <DialogTitle>Select Data Folders</DialogTitle>
        </DialogHeader>

        {/* 顶部：地址栏与返回按钮 */}
        <div className="flex items-center gap-2 mt-2">
          <Button variant="outline" size="icon" onClick={handleNavigateUp} disabled={loading} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input 
            value={currentPath} 
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchDirectory(currentPath)}
            className="flex-1 font-mono text-sm bg-neutral-900 border-neutral-700"
            placeholder={currentPath === "" ? "System Root (Drives)" : "e.g. D:/Datasets"}
          />
          <Button onClick={() => fetchDirectory(currentPath)} disabled={loading} variant="secondary">Go</Button>
        </div>

        {/* 主体：文件夹列表 */}
        <div className="h-[50vh] border border-neutral-800 rounded-md bg-black/50 overflow-y-auto p-2 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 space-y-2">
               <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
               <span>Reading Directory...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-500">Empty Directory</div>
          ) : (
            <div className="space-y-1">

            {/* 🚀 新增：始终在最前面显示 ".." 返回上一级 */}
              {currentPath !== "" && currentPath !== "/" && (
                <div 
                  className="flex items-center gap-3 p-1.5 rounded cursor-pointer hover:bg-neutral-800 transition-colors border border-transparent"
                  onDoubleClick={handleNavigateUp}
                >
                  <div className="px-2 w-8" /> {/* 空白占位，为了和下面的复选框对齐 */}
                  
                  <div className="flex items-center gap-2 flex-1 select-none text-blue-400">
                    <Folder className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold tracking-widest">..</span>
                  </div>
                </div>
              )}

              {items.map((item) => {
                const isSelected = selectedPaths.has(item.path);
                const isDir = item.type === 'dir';
                
                return (
                  <div 
                    key={item.path} 
                    className={`flex items-center gap-3 p-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/30 border border-blue-800/50' : 'hover:bg-neutral-800/80 border border-transparent'}`}
                  >
                    {/* 复选框：如果是文件夹才允许选中 */}
                    <div 
                       className="px-2"
                       onClick={(e) => { 
                         e.stopPropagation(); 
                         if (isDir) toggleSelect(item.path); 
                       }}
                    >
                      {isDir ? (
                         isSelected ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-neutral-600 hover:text-neutral-400" />
                      ) : (
                         <div className="w-4 h-4" /> /* 占位，保持对齐 */
                      )}
                    </div>
                    
                    {/* 文件夹名：双击进入下一级 */}
                    <div 
                      className={`flex items-center gap-2 flex-1 select-none ${!isDir && 'opacity-50'}`}
                      onDoubleClick={() => { if (isDir) fetchDirectory(item.path); }}
                    >
                      {isDir ? <Folder className="w-4 h-4 text-amber-500" /> : <File className="w-4 h-4 text-neutral-500" />}
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    
                    {isDir && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fetchDirectory(item.path)}>
                        <ChevronRight className="w-4 h-4 text-neutral-500" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between mt-4">
          <span className="text-sm text-neutral-400">
            {selectedPaths.size} folder(s) selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => onConfirm(Array.from(selectedPaths))}
              disabled={selectedPaths.size === 0}
            >
              Confirm Selection
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}