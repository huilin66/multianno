import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Folder, ChevronRight, CheckSquare, Square, ArrowLeft, File, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // 🌟 引入翻译钩子
import { API_BASE_URL } from '../../api/client';

interface ExplorerItem {
  name: string;
  path: string;
  type: 'dir' | 'file';
  tag?: 'drive' | 'history';
}

interface FileExplorerDialogProps {
  open: boolean;
  initialPath: string;
  onClose: () => void;
  onConfirm: (selectedPaths: string[]) => void;
  selectType?: 'dir' | 'file'; // 🌟 新增：决定是选文件夹还是选文件
}

export function FileExplorerDialog({ open, initialPath, onClose, onConfirm, selectType }: FileExplorerDialogProps) {
  const { t } = useTranslation(); // 🌟 激活翻译钩子
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [parentPath, setParentPath] = useState(''); 
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

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
      
      const url = `${API_BASE_URL}/fs/explore?path=${encodeURIComponent(targetPath)}${historyParams}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const errorData = await res.json();
        // 🌟 错误提示翻译
        const errorMsg = errorData.error || errorData.detail || t('fileExplorer.errorUnknown');
        alert(`${t('fileExplorer.errorRead')}${errorMsg}`);
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      setItems(data.items);
      setCurrentPath(data.current_path);
      
    } catch (e) {
      console.error(e);
      // 🌟 后端断联提示翻译
      alert(t('fileExplorer.errorConnect'));
    } finally {
      setLoading(false);
    }
  };

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
      <DialogContent className="max-w-3xl bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle>{t('fileExplorer.title')}</DialogTitle> {/* 🌟 弹窗标题 */}
        </DialogHeader>

        <div className="flex items-center gap-2 mt-2">
          <Button variant="outline" size="icon" onClick={handleNavigateUp} disabled={loading} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input 
            value={currentPath} 
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchDirectory(currentPath)}
            className="flex-1 font-mono text-sm bg-background border-input"
            // 🌟 输入框占位符提示
            placeholder={currentPath === "" ? t('fileExplorer.placeholderRoot') : t('fileExplorer.placeholderPath')}
          />
          <Button onClick={() => fetchDirectory(currentPath)} disabled={loading} variant="secondary">
            {t('fileExplorer.go')} {/* 🌟 Go按钮 */}
          </Button>
        </div>

        <div className="flex items-center mt-1 mb-0.5 px-1">
           <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
             <Info className="w-3.5 h-3.5 text-primary"/> 
             {t('fileExplorer.tip')} {/* 🌟 提示文字 */}
           </span>
        </div>

        <div className="h-[50vh] border border-border rounded-md bg-muted/30 overflow-y-auto p-2 custom-scrollbar shadow-inner">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
               <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
               <span>{t('fileExplorer.reading')}</span> {/* 🌟 加载中提示 */}
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('fileExplorer.empty')} {/* 🌟 空目录提示 */}
            </div>
          ) : (
            <div className="space-y-1">

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

                const canSelect = selectType === 'dir' ? isDir : !isDir;

                let displayName = item.name;
                if (item.tag === 'drive') {
                  displayName = `${t('fileExplorer.localDrive')} (${item.name})`;
                } else if (item.tag === 'history') {
                  displayName = `${t('fileExplorer.historyRecord')} (${item.name})`;
                }

                return (
                  <div 
                    key={item.path} 
                    className={`flex items-center gap-3 p-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'}`}
                  >
                    <div className="px-2" onClick={(e) => { e.stopPropagation(); if (canSelect) toggleSelect(item.path); }}>
                      {canSelect ? (
                        isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      ) : (
                        <div className="w-4 h-4" /> 
                      )}
                    </div>
                    
                    <div 
                      className={`flex items-center gap-2 flex-1 select-none ${(!isDir && selectType === 'dir') && 'opacity-50'}`}
                      onDoubleClick={() => { if (isDir) fetchDirectory(item.path); }}
                    >
                      {isDir ? <Folder className="w-4 h-4 text-amber-500" /> : <File className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-medium">{displayName}</span>
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
            {selectedPaths.size} {t('fileExplorer.selectedCount')} {/* 🌟 选中数量提示 */}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button> {/* 🌟 复用之前定义好的全局 common.cancel */}
            <Button 
              variant="default"
              onClick={() => onConfirm(Array.from(selectedPaths))}
              disabled={selectedPaths.size === 0}
            >
              {t('fileExplorer.confirm')} {/* 🌟 确认按钮 */}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}