import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Folder, ChevronRight, CheckSquare, Square, ArrowLeft, File, Info, FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  selectType?: 'dir' | 'file' | 'save'; // 🌟 新增 'save'
  defaultSaveName?: string;             // 🌟 新增默认文件名
}

export function FileExplorerDialog({ open, initialPath, onClose, onConfirm, selectType, defaultSaveName }: FileExplorerDialogProps) {
  const { t } = useTranslation();
  const [saveFileName, setSaveFileName] = useState(defaultSaveName || 'project_meta.json');
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // 🌟 新增：新建文件夹状态
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchDirectory = async (targetPath: string) => {
    setLoading(true);
    // 重置新建状态
    setIsCreatingFolder(false);
    setNewFolderName('');
    
    try {
      const savedHistory = localStorage.getItem('multiAnno_recentPaths');
      let historyParams = '';
      if (savedHistory) {
        try {
          const paths = JSON.parse(savedHistory);
          if (Array.isArray(paths)) {
            historyParams = paths.map((p: string) => `&history=${encodeURIComponent(p)}`).join('');
          }
        } catch(e) {
          console.error("解析历史记录失败", e);
        }
      }
      
      const url = `${API_BASE_URL}/fs/explore?path=${encodeURIComponent(targetPath)}${historyParams}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const errorData = await res.json();
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
      alert(t('fileExplorer.errorConnect'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
      if (open && defaultSaveName) setSaveFileName(defaultSaveName);
    }, [open, defaultSaveName]);

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

  // 🌟 新增：处理创建文件夹逻辑
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/fs/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: newFolderName.trim() })
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert(`${t('fileExplorer.createFailed', '创建失败')}: ${err.detail || err.error}`);
        return;
      }
      
      // 创建成功后重新拉取当前目录，关闭新建状态
      setIsCreatingFolder(false);
      setNewFolderName('');
      fetchDirectory(currentPath);
    } catch (e) {
      console.error(e);
      alert(t('fileExplorer.errorConnect'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle>{t('fileExplorer.title')}</DialogTitle>
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
            placeholder={currentPath === "" ? t('fileExplorer.placeholderRoot') : t('fileExplorer.placeholderPath')}
          />
          <Button onClick={() => fetchDirectory(currentPath)} disabled={loading} variant="secondary">
            {t('fileExplorer.go')}
          </Button>
          
          {/* 🌟 新增：新建文件夹按钮 (不在根目录时显示) */}
          <Button 
            onClick={() => setIsCreatingFolder(true)} 
            disabled={loading || currentPath === "" || currentPath === "/"} 
            variant="outline" 
            size="icon"
            className="h-9 w-9 shrink-0 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            title={t('fileExplorer.newFolder', '新建文件夹')}
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center mt-1 mb-0.5 px-1">
           <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
             <Info className="w-3.5 h-3.5 text-primary"/> 
             {t('fileExplorer.tip')} 
           </span>
        </div>

        <div className="h-[50vh] border border-border rounded-md bg-muted/30 overflow-y-auto p-2 custom-scrollbar shadow-inner relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
               <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
               <span>{t('fileExplorer.reading')}</span>
            </div>
          ) : (
            <div className="space-y-1">
              
              {/* 🌟 新增：内联新建文件夹输入框 */}
              {isCreatingFolder && (
                <div className="flex items-center gap-3 p-1.5 rounded bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                  <div className="px-2">
                    <FolderPlus className="w-4 h-4 text-blue-500" />
                  </div>
                  <Input 
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') {
                        setIsCreatingFolder(false);
                        setNewFolderName('');
                      }
                    }}
                    disabled={creating}
                    placeholder={t('fileExplorer.newFolderNameHint', '输入文件夹名 (Enter确认, Esc取消)')}
                    className="flex-1 h-8 text-sm"
                  />
                  <Button size="sm" variant="ghost" onClick={handleCreateFolder} disabled={creating || !newFolderName.trim()}>
                    {t('common.confirm', '确认')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }} disabled={creating}>
                    {t('common.cancel')}
                  </Button>
                </div>
              )}

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

              {/* 文件列表 */}
              {items.length === 0 && !isCreatingFolder ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  {t('fileExplorer.empty')}
                </div>
              ) : (
                items.map((item) => {
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
                })
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between mt-4">
          
          {/* 🌟 核心修改：如果是 Save 模式，显示文件名输入框 */}
          {selectType === 'save' ? (
            <div className="flex-1 flex items-center gap-2 mr-4">
              <span className="text-sm font-bold text-muted-foreground whitespace-nowrap">文件名:</span>
              <Input 
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                className="h-8 text-sm font-mono"
                placeholder="例如: my_project_meta.json"
              />
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {selectedPaths.size} {t('fileExplorer.selectedCount')}
            </span>
          )}

          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button 
              variant="default"
              onClick={() => {
                if (selectType === 'save') {
                  const separator = currentPath.includes('\\') ? '\\' : '/';
                  const cleanPath = currentPath.endsWith(separator) ? currentPath : currentPath + separator;
                  onConfirm([cleanPath + saveFileName]);
                } else {
                  onConfirm(Array.from(selectedPaths));
                }
              }}
              // 控制 Save 模式下必须有路径和文件名才能确认
              disabled={
                (selectType !== 'save' && selectedPaths.size === 0) || 
                (selectType === 'save' && (!currentPath || !saveFileName.trim()))
              }
            >
              {t('fileExplorer.confirm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}