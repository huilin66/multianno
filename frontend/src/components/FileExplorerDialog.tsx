import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Folder, ChevronRight, CheckSquare, Square, ArrowLeft, File, Info } from 'lucide-react';

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
  const [parentPath, setParentPath] = useState(''); 
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // 🚀 核心逻辑 100% 还原自你的 _src 版本
  const fetchDirectory = async (targetPath: string) => {
    setLoading(true);
    try {
      const savedHistory = localStorage.getItem('multiAnno_recentPaths');
      let historyParams = '';
      if (savedHistory) {
        try {
          const paths = JSON.parse(savedHistory);
          if (Array.isArray(paths)) {
            historyParams = paths.map(p => `&history=${encodeURIComponent(p)}`).join('');
          }
        } catch(e) {
          console.error("解析历史记录失败", e);
        }
      }
      
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

  // 🚀 逻辑 100% 还原自你的 _src 版本
  useEffect(() => {
    if (open) {
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

  // 🚀 逻辑 100% 还原自你的 _src 版本，完美处理 C: / E: 这种盘符情况
  const handleNavigateUp = () => {
    if (!currentPath || currentPath === '/') {
      fetchDirectory('');
      return;
    }

    let normalized = currentPath.replace(/\\/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    const lastSlashIndex = normalized.lastIndexOf('/');
    
    if (lastSlashIndex > 0) {
      let nextPath = normalized.slice(0, lastSlashIndex);
      if (/^[a-zA-Z]:$/.test(nextPath)) {
        nextPath += '/';
      }
      fetchDirectory(nextPath);
    } else if (lastSlashIndex === 0) {
      fetchDirectory('/');
    } else {
      fetchDirectory('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {/* 🌟 UI 更新：自适应的背景色和边框 */}
      <DialogContent className="max-w-3xl bg-background border-border text-foreground">
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
            className="flex-1 font-mono text-sm bg-background border-input"
            placeholder={currentPath === "" ? "System Root (Drives)" : "e.g. D:/Datasets"}
          />
          <Button onClick={() => fetchDirectory(currentPath)} disabled={loading} variant="secondary">Go</Button>
        </div>

        {/* 🌟 提示区 */}
        <div className="flex items-center mt-1 mb-0.5 px-1">
           <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
             <Info className="w-3.5 h-3.5 text-primary"/> 
             Tip: Double-click row to enter folder, click checkbox to select. (双击进入，单击勾选)
           </span>
        </div>

        {/* 主体：文件夹列表 */}
        {/* 🌟 UI 更新：去除了原先的死黑背景，改为柔和内嵌的 bg-muted/30 */}
        <div className="h-[50vh] border border-border rounded-md bg-muted/30 overflow-y-auto p-2 custom-scrollbar shadow-inner">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
               <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
               <span>Reading Directory...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Empty Directory</div>
          ) : (
            <div className="space-y-1">

              {/* 返回上一级 */}
              {currentPath !== "" && currentPath !== "/" && (
                <div 
                  className="flex items-center gap-3 p-1.5 rounded cursor-pointer hover:bg-muted transition-colors border border-transparent"
                  onDoubleClick={handleNavigateUp}
                >
                  <div className="px-2 w-8" /> 
                  <div className="flex items-center gap-2 flex-1 select-none text-primary">
                    <Folder className="w-4 h-4 text-primary" />
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
                    // 🌟 UI 更新：晶莹剔透的选中背景
                    className={`flex items-center gap-3 p-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'}`}
                  >
                    <div className="px-2" onClick={(e) => { e.stopPropagation(); if (isDir) toggleSelect(item.path); }}>
                      {isDir ? (
                         isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      ) : (
                         <div className="w-4 h-4" /> 
                      )}
                    </div>
                    
                    <div 
                      className={`flex items-center gap-2 flex-1 select-none ${!isDir && 'opacity-50'}`}
                      onDoubleClick={() => { if (isDir) fetchDirectory(item.path); }}
                    >
                      {isDir ? <Folder className="w-4 h-4 text-amber-500" /> : <File className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    
                    {isDir && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => fetchDirectory(item.path)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            {selectedPaths.size} folder(s) selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button 
              variant="default"
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