import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import { 
  FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2, History
} from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog'; 

export function DataPreload() {
  const { folders, views, addFolder, removeFolder, addView, removeView, updateView, setActiveModule } = useStore();
  
  // --- 占位符与资源管理器状态 ---
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string }[]>([]);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // ==========================================
  // 🌟 前端本地历史记录管理 (localStorage)
  // ==========================================
  const [recentPaths, setRecentPaths] = useState<string[]>([]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('multiAnno_recentPaths');
    if (savedHistory) {
      try {
        setRecentPaths(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const savePathsToHistory = (paths: string[]) => {
    let newHistory = [...recentPaths];
    
    paths.forEach(path => {
      const trimmed = path.trim().replace(/\\/g, '/'); 
      if (trimmed) {
        newHistory = newHistory.filter(p => p !== trimmed); // 去重
        newHistory.unshift(trimmed); // 放到最前面
      }
    });

    newHistory = newHistory.slice(0, 5); // 最多保留 5 条
    setRecentPaths(newHistory);
    localStorage.setItem('multiAnno_recentPaths', JSON.stringify(newHistory));
  };

  // 🚀 新增：点击历史记录直接添加为一个新的占位符
// 🚀 修复：去除防重拦截，允许用户随意点击添加
  const handleAddFromHistory = (path: string) => {
    setPlaceholders(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), path }]);
  };
  // ==========================================

  // --- 占位符操作逻辑 ---
  const handleAddPlaceholder = () => {
    setPlaceholders([...placeholders, { id: Math.random().toString(36).substr(2, 9), path: '' }]);
  };

  const handleRemovePlaceholder = (id: string) => {
    setPlaceholders(placeholders.filter(p => p.id !== id));
  };

  const handleUpdatePath = (id: string, newPath: string) => {
    setPlaceholders(placeholders.map(p => p.id === id ? { ...p, path: newPath } : p));
  };

  const openExplorerFor = (id: string) => {
    setActivePlaceholderId(id);
    setExplorerOpen(true);
  };

  const handleExplorerConfirm = (selectedPaths: string[]) => {
    if (selectedPaths.length === 0 || !activePlaceholderId) return;

    const newPlaceholders = [...placeholders];
    const targetIndex = newPlaceholders.findIndex(p => p.id === activePlaceholderId);

    if (targetIndex !== -1) {
      newPlaceholders[targetIndex].path = selectedPaths[0];

      // 自动分裂追加
      const extraPlaceholders = selectedPaths.slice(1).map(path => ({
        id: Math.random().toString(36).substr(2, 9),
        path: path
      }));
      newPlaceholders.splice(targetIndex + 1, 0, ...extraPlaceholders);
    }

    setPlaceholders(newPlaceholders);
    setExplorerOpen(false);
    savePathsToHistory(selectedPaths);
  };

  const cancelFolders = () => setPlaceholders([]);

  // --- 确认并上传给后端分析 ---
  const confirmFolders = async () => {
    const validPlaceholders = placeholders.filter(p => p.path.trim() !== "");
    if (validPlaceholders.length === 0) return;
    
    setIsConfirming(true);
    
    try {
      // 🚀 删除了 getFullPath，直接使用用户输入或选择的绝对路径
      const pathsToAnalyze = validPlaceholders.map(p => p.path.trim());

      const response = await fetch('http://localhost:8080/api/project/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: pathsToAnalyze }),
      });

      if (!response.ok) throw new Error("Backend analysis failed");
      
      const result = await response.json();
      const backendData = result.data; 

      if (!backendData || backendData.length === 0) {
        alert("Python 未能在该路径下找到图片数据，请检查路径是否正确。");
        setIsConfirming(false);
        return;
      }

      backendData.forEach((folderMeta: any, index: number) => {
        const originalPath = pathsToAnalyze[index];
        addFolder({
          id: `folder-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
          path: folderMeta.folderPath || originalPath, 
          files: [], 
          metadata: {
            width: folderMeta.width || 1024,
            height: folderMeta.height || 1024,
            bands: folderMeta.bands || 3,
            fileType: folderMeta.dtype || 'TIFF',
            dataType: "Remote Sensing Imagery",
            sceneGroupsLoaded: folderMeta.group_success || 0, 
            sceneGroupsSkipped: folderMeta.group_fail || 0
          }
        });
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
      } else {
        alert("警告：您选择的文件夹中没有找到任何同名图像，无法建立协同视图！");
      }
      
      // 🌟 核心：保存这批成功的绝对路径到历史记录
      savePathsToHistory(pathsToAnalyze);
      
      // 成功后清空占位符
      setPlaceholders([]);
    } catch (error) {
      console.error("Error connecting to backend:", error);
      alert("连接 Python 后端失败，请确认 FastAPI 正在运行。");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleAddView = () => {
    if (views.length >= 9) return;
    const isMain = views.length === 0;
    addView({
      id: Math.random().toString(36).substr(2, 9),
      folderId: '',
      bands: [1, 2, 3],
      isMain,
      opacity: 1,
      transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
    });
  };

  const handleConfirmViews = () => {
    if (views.length === 0) {
      alert("请至少配置一个 View (Main View)！");
      return;
    }

    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const viewName = view.isMain ? "Main View" : `Aug View ${i}`;

      if (!view.folderId) {
        alert(`[${viewName}] 尚未选择关联的 Source Folder！`);
        return;
      }

      const activeBandsCount = view.bands.filter(b => b > 0).length;
      if (activeBandsCount !== 1 && activeBandsCount !== 3) {
        alert(`[${viewName}] 的波段配置无效！\n当前有效波段数：${activeBandsCount}。\n渲染器仅支持【单波段(灰度/红外)】或【三波段(RGB)】。请检查是否有不必要的通道未设置为 None。`);
        return;
      }
    }
    setActiveModule('extent');
  };

  return (
    <div className="grid grid-cols-2 h-full gap-6 p-6 overflow-hidden">
      {/* 左侧：Folders Section */}
      <Card className="flex flex-col flex-1 min-h-0 transition-colors">
        <CardHeader className="shrink-0 pb-4 border-b">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2"><FolderOpen className="w-5 h-5" /> Data Folders</div>
            <Button onClick={handleAddPlaceholder} variant="outline" size="sm" disabled={isConfirming}>
              <Plus className="w-4 h-4 mr-2" /> Add Folder
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col">
          <div className="flex-1 space-y-3">
            
            {/* 🌟 改造完毕：快捷历史记录现在变成了一个“一键添加”面板 */}
            {recentPaths.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 rounded-lg border border-neutral-800 border-dashed mb-4">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <History className="w-3 h-3"/> Recent:
                </span>
                {recentPaths.map((path) => (
                  <button
                    key={path}
                    onClick={() => handleAddFromHistory(path)}
                    className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-1 rounded border border-neutral-700 transition-colors truncate max-w-[200px]"
                    title={`Click to add: ${path}`}
                  >
                    + {path}
                  </button>
                ))}
              </div>
            )}

            {/* 1. 已成功加载的 Folders 列表 */}
            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-background rounded-md border"><FolderOpen className="w-6 h-6 text-primary" /></div>
                  <div>
                    <h3 className="font-semibold" title={folder.path}>{folder.path}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>Size: {folder.metadata.width}x{folder.metadata.height}</span>
                      <span>Bands: {folder.metadata.bands}</span>
                      <span className="text-green-600 dark:text-green-400">Loaded: {folder.metadata.sceneGroupsLoaded}</span>
                      {folder.metadata.sceneGroupsSkipped ? (<span className="text-destructive">Skipped: {folder.metadata.sceneGroupsSkipped}</span>) : null}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive flex-shrink-0" onClick={() => removeFolder(folder.id)} disabled={isConfirming}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {/* 2. 占位符 (Pending) 列表 */}
            {folders.length === 0 && placeholders.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <UploadCloud className="w-10 h-10 mb-2 opacity-50" />
                <p>Click "Add Folder" to start configuring</p>
              </div>
            )}

            {placeholders.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-primary/5 border border-dashed border-primary/50 rounded-lg">
                {/* 资源管理器唤醒按钮 */}
                <button 
                  onClick={() => openExplorerFor(item.id)}
                  className="p-2 bg-background rounded-md border border-dashed border-neutral-600 hover:border-primary hover:text-primary transition-colors group flex-shrink-0"
                  title="Browse local files"
                  disabled={isConfirming}
                >
                  <FolderOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </button>
                
                {/* 路径输入框 */}
                <div className="flex-1 min-w-0">
                  <Input 
                    value={item.path} 
                    onChange={(e) => handleUpdatePath(item.id, e.target.value)}
                    placeholder="Enter absolute path or click icon to browse..."
                    className="font-mono text-xs bg-background h-8"
                    disabled={isConfirming}
                  />
                </div>

                <Button variant="ghost" size="icon" onClick={() => handleRemovePlaceholder(item.id)} className="text-destructive flex-shrink-0" disabled={isConfirming}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

          </div>

          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">{placeholders.length} folder(s) pending</span>
            <Button onClick={cancelFolders} variant="outline" disabled={placeholders.length === 0 || isConfirming}>
              <X className="w-4 h-4 mr-2" /> Cancel All
            </Button>
            <Button onClick={confirmFolders} disabled={placeholders.length === 0 || isConfirming}>
              {isConfirming ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : <><Check className="w-4 h-4 mr-2" /> Confirm Upload</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 右侧：Views Configuration Section (保持原样) */}
      <Card className="flex flex-col flex-1 min-h-0">
        <CardHeader className="shrink-0 pb-4 border-b">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Info className="w-5 h-5" /> View Configuration</div>
            <Button onClick={handleAddView} variant="outline" size="sm" disabled={views.length >= 9}>
              <Plus className="w-4 h-4 mr-2" /> Add View {views.length >= 9 && '(Max 9)'}
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col">
          <div className="flex-1 space-y-4">
            {views.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                No views configured. Add a view to start mapping data.
              </div>
            ) : (
              views.map((view, index) => (
                <div key={view.id} className="flex flex-col gap-4 p-4 border rounded-lg bg-card">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${view.isMain ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                      {view.isMain ? 'Main View' : `Aug View ${index}`}
                    </span>
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => removeView(view.id)} disabled={view.isMain && views.length > 1} >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Source Folder</Label>
                      <Select 
                        value={view.folderId} 
                        onValueChange={(val) => {
                          const selectedFolder = folders.find(f => f.id === val);
                          const numBands = selectedFolder?.metadata?.bands || 3;
                          const newBands = numBands === 1 ? [1, 0, 0] : [1, 2, 3];
                          updateView(view.id, { folderId: val, bands: newBands });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select folder...">
                            {view.folderId ? folders.find(f => f.id === view.folderId)?.path : "Select folder..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {folders.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.path}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1">
                      <Label>Bands (R, G, B)</Label>
                      <div className="flex gap-2">
                        {[0, 1, 2].map((bandIndex) => {
                          const selectedFolder = folders.find(f => f.id === view.folderId);
                          const numBands = selectedFolder ? (selectedFolder.metadata?.bands || 3) : 0;
                          const availableBands = Array.from({ length: numBands }, (_, i) => i + 1);
                          const currentBand = selectedFolder && view.bands[bandIndex] !== undefined ? view.bands[bandIndex] : 0;
                          
                          return (
                            <div key={`band-${view.id}-${bandIndex}`} className="flex-1">
                              <Select
                                disabled={!view.folderId} 
                                value={currentBand.toString()}
                                onValueChange={(val) => {
                                  const newBands = [...view.bands];
                                  newBands[bandIndex] = parseInt(val);
                                  while(newBands.length < 3) newBands.push(0);
                                  updateView(view.id, { bands: newBands.slice(0, 3) });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder={!view.folderId ? "-" : `B${bandIndex + 1}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">None</SelectItem>
                                  {availableBands.map(b => (
                                    <SelectItem key={b} value={b.toString()}>Band {b}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">
              {views.length} view(s) configured
            </span>
            <Button onClick={() => { /* 预留重置逻辑 */ }} variant="outline" disabled={views.length === 0}>
              <X className="w-4 h-4 mr-2" /> Reset
            </Button>
            <Button onClick={handleConfirmViews} disabled={views.length === 0} className="bg-blue-600 hover:bg-blue-700">
              <Check className="w-4 h-4 mr-2" /> Confirm & Map Extents
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 挂载资源管理器弹窗 */}
      <FileExplorerDialog 
        open={explorerOpen}
        initialPath={activePlaceholderId ? placeholders.find(p => p.id === activePlaceholderId)?.path || '' : ''}
        onClose={() => setExplorerOpen(false)}
        onConfirm={handleExplorerConfirm}
      />
    </div>
  );
}