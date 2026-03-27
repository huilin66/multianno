import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import { 
FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2,  Database, 
} from 'lucide-react';

export function DataPreload() {
  // 【新增提取 setActiveModule】用于跳转界面
  const { folders, views, addFolder, removeFolder, addView, removeView, updateView, setActiveModule } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [pendingFolders, setPendingFolders] = useState<{path: string, files: File[]}[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [rootDir, setRootDir] = useState("");

  const getFullPath = (folderName: string) => {
    if (!rootDir.trim()) return folderName;
    const cleanRoot = rootDir.trim().replace(/\\/g, '/').replace(/\/$/, '');
    return `${cleanRoot}/${folderName}`;
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const folderPath = files[0].webkitRelativePath.split('/')[0] || 'Selected Folder';
      
      setPendingFolders(prev => [...prev, {
        path: folderPath,
        files: files
      }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const readDirectory = async (directory: any): Promise<File[]> => {
    const dirReader = directory.createReader();
    const files: File[] = [];

    const readEntries = async () => {
      return new Promise<void>((resolve, reject) => {
        dirReader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) {
            resolve();
          } else {
            for (const entry of entries) {
              if (entry.isFile) {
                const file = await new Promise<File>((res) => entry.file(res));
                Object.defineProperty(file, 'webkitRelativePath', {
                  value: directory.name + '/' + file.name
                });
                files.push(file);
              } else if (entry.isDirectory) {
                const subFiles = await readDirectory(entry);
                files.push(...subFiles);
              }
            }
            await readEntries();
            resolve();
          }
        }, reject);
      });
    };

    await readEntries();
    return files;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    if (!items) return;

    const newPending = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i].webkitGetAsEntry();
      if (item && item.isDirectory) {
        const files = await readDirectory(item);
        if (files.length > 0) {
          newPending.push({ path: item.name, files: files });
        }
      }
    }

    if (newPending.length > 0) {
      setPendingFolders(prev => [...prev, ...newPending]);
    }
  };

  const confirmFolders = async () => {
    if (pendingFolders.length === 0) return;
    
    if (!rootDir.trim()) {
      alert("请先填写根目录 (Root Directory) 路径！\n示例：D:/dataset/images");
      return;
    }
    
    setIsConfirming(true);
    
    try {
      const pathsToAnalyze = pendingFolders.map(f => getFullPath(f.path));

      const response = await fetch('http://localhost:8080/api/project/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: pathsToAnalyze }),
      });

      if (!response.ok) throw new Error("Backend analysis failed");
      
      const result = await response.json();
      const backendData = result.data; 

      if (!backendData || backendData.length === 0) {
        alert("Python 未能在该路径下找到图片数据，请检查根目录是否正确。");
        setIsConfirming(false);
        return;
      }

      backendData.forEach((folderMeta: any, index: number) => {
        const originalFolder = pendingFolders[index];
        if (originalFolder) {
          addFolder({
            id: `folder-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
            path: folderMeta.folderPath || getFullPath(originalFolder.path), 
            files: originalFolder.files, 
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
        }
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
      } else {
        alert("警告：您选择的文件夹中没有找到任何同名图像，无法建立协同视图！");
      }
      
      setPendingFolders([]);
    } catch (error) {
      console.error("Error connecting to backend:", error);
      alert("连接 Python 后端失败，请确认 FastAPI 正在运行。");
    } finally {
      setIsConfirming(false);
    }
  };

  const cancelFolders = () => setPendingFolders([]);
  const removePendingFolder = (index: number) => setPendingFolders(prev => prev.filter((_, i) => i !== index));

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

  // 【新增】校验并确认 View 设置的逻辑
  const handleConfirmViews = () => {
    if (views.length === 0) {
      alert("请至少配置一个 View (Main View)！");
      return;
    }

    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const viewName = view.isMain ? "Main View" : `Aug View ${i}`;

      // 1. 检查是否选择了数据夹
      if (!view.folderId) {
        alert(`[${viewName}] 尚未选择关联的 Source Folder！`);
        return;
      }

      // 2. 检查波段逻辑 (0 代表 None)
      // 过滤出大于 0 的有效波段
      const activeBandsCount = view.bands.filter(b => b > 0).length;

      if (activeBandsCount !== 1 && activeBandsCount !== 3) {
        alert(`[${viewName}] 的波段配置无效！\n当前有效波段数：${activeBandsCount}。\n渲染器仅支持【单波段(灰度/红外)】或【三波段(RGB)】。请检查是否有不必要的通道未设置为 None。`);
        return;
      }
    }

    // 校验全部通过，跳转到 View Extent Check
    setActiveModule('extent');
  };

  // 【新增】：根据实际存储在 store 里的 metadata 生成标准元数据
  const generateGlobalMeta = () => {
    return {
      folders: folders.map((f, i) => {
        return {
          Id: i + 1,
          path: f.path,
          // 直接读取 Python 后端返回并保存在 store 中的组/文件统计
          "files in sceneGroups": f.metadata?.sceneGroupsLoaded || 0,
          "files Skipped": f.metadata?.sceneGroupsSkipped || 0,
          "files total": f.files ? f.files.length : 0,
          "image meta": {
            width: f.metadata?.width || 'Unknown',
            height: f.metadata?.height || 'Unknown',
            bands: f.metadata?.bands || 'Unknown',
            // dataType 对应您刚才提到的 uint8 等 dtype，它在 confirmFolders 中被存为了 fileType
            "data type": f.metadata?.fileType || 'uint8' 
          }
        };
      }),
      views: views.map((v, i) => {
        const fIndex = folders.findIndex(f => f.id === v.folderId);
        return {
          id: v.isMain ? 'main view' : `aug view ${i}`, // views[0] 是 main, views[1] 自然就是 aug view 1
          "folder id": fIndex >= 0 ? fIndex + 1 : 'Unknown',
          bands: v.bands,
          isMain: v.isMain,
          // 初始界面没有配准数据，默认输出
          transform: v.transform || { crop: { t: 0, r: 100, b: 100, l: 0 }, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
        };
      })
    };
  };

  return (
    <div className="grid grid-cols-2 h-full gap-6 p-6 overflow-hidden">
      {/* 左侧：Folders Section (无变动) */}
      <Card 
        className={`flex flex-col flex-1 min-h-0 transition-colors ${isDragging ? 'border-primary bg-primary/5' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
      >
        <CardHeader className="shrink-0 pb-4 border-b">
          <div className="flex flex-col gap-4">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2"><FolderOpen className="w-5 h-5" /> Data Folders</div>
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" disabled={isConfirming}>
                <Plus className="w-4 h-4 mr-2" /> Add Folder
              </Button>
            </CardTitle>
            
            <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border">
              <Label htmlFor="rootDir" className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                <Database className="w-3 h-3" /> Root Directory (Workspace Path)
              </Label>
              <Input 
                id="rootDir" placeholder="e.g., D:/MyDataset/RGB_Images"
                value={rootDir} onChange={(e) => setRootDir(e.target.value)}
                className="h-8 text-xs bg-background"
              />
              <p className="text-[10px] text-muted-foreground leading-tight">
                All selected folders below should be located inside this root directory. The system will combine them automatically.
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col">
          <input 
            type="file" ref={fileInputRef} onChange={handleFolderSelect} className="hidden" 
            // @ts-ignore
            webkitdirectory="true" directory="true" multiple 
          />
          
          <div className="flex-1 space-y-2">
            {folders.length === 0 && pendingFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <UploadCloud className="w-10 h-10 mb-2 opacity-50" />
                <p>Drag & drop folders here to bypass browser popups</p>
                <p className="text-sm opacity-70">or click "Add Folder" to select manually</p>
              </div>
            ) : (
              <>
                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-background rounded-md border"><FolderOpen className="w-6 h-6 text-primary" /></div>
                      <div>
                        <h3 className="font-semibold" title={folder.path}>{folder.path}</h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                          <span>Files: {folder.files.length}</span>
                          <span>Size: {folder.metadata.width}x{folder.metadata.height}</span>
                          <span>Bands: {folder.metadata.bands}</span>
                          <span className="text-green-600 dark:text-green-400">Loaded Groups: {folder.metadata.sceneGroupsLoaded}</span>
                          {folder.metadata.sceneGroupsSkipped ? (<span className="text-destructive">Skipped: {folder.metadata.sceneGroupsSkipped}</span>) : null}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive flex-shrink-0" onClick={() => removeFolder(folder.id)} disabled={isConfirming}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                {pendingFolders.map((pf, idx) => (
                  <div key={`pending-${idx}`} className="flex items-center justify-between p-4 border border-dashed border-primary/50 rounded-lg bg-primary/5">
                    <div className="flex items-center gap-4 w-full">
                      <div className="p-2 bg-background rounded-md border border-dashed flex-shrink-0"><FolderOpen className="w-6 h-6 text-muted-foreground" /></div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm flex items-center gap-2 truncate">
                          <span className="truncate" title={getFullPath(pf.path)}>{getFullPath(pf.path)}</span>
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider flex-shrink-0">Pending</span>
                        </h3>
                        <div className="text-xs text-muted-foreground mt-1">Waiting for confirmation to load data...</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removePendingFolder(idx)} className="text-destructive flex-shrink-0 ml-2" disabled={isConfirming}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">{pendingFolders.length} folder(s) pending confirmation</span>
            <Button onClick={cancelFolders} variant="outline" disabled={pendingFolders.length === 0 || isConfirming}><X className="w-4 h-4 mr-2" /> Cancel All</Button>
            <Button onClick={confirmFolders} disabled={pendingFolders.length === 0 || isConfirming}>
              {isConfirming ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : <><Check className="w-4 h-4 mr-2" /> Confirm Upload</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 右侧：Views Configuration Section */}
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
                    {/* 1. Source Folder 选择器 */}
                    <div className="space-y-1">
                      <Label>Source Folder</Label>
                      <Select 
                        value={view.folderId} 
                        onValueChange={(val) => {
                          const selectedFolder = folders.find(f => f.id === val);
                          const numBands = selectedFolder?.metadata?.bands || 3;
                          // 选择文件夹后，默认初始化波段
                          const newBands = numBands === 1 ? [1, 0, 0] : [1, 2, 3];
                          updateView(view.id, { folderId: val, bands: newBands });
                        }}
                      >
                        {/* 修复1: 强制 SelectValue 显示匹配的路径，避免偶尔组件未渲染时显示一串 id 代码 */}
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
                    
                    {/* 2. Bands 选择器 (级联逻辑) */}
                    <div className="space-y-1">
                      <Label>Bands (R, G, B)</Label>
                      <div className="flex gap-2">
                        {[0, 1, 2].map((bandIndex) => {
                          const selectedFolder = folders.find(f => f.id === view.folderId);
                          
                          // 修复2 & 3: 如果未选择文件夹，波段数设为 0；有效波段范围根据当前文件夹动态生成
                          const numBands = selectedFolder ? (selectedFolder.metadata?.bands || 3) : 0;
                          const availableBands = Array.from({ length: numBands }, (_, i) => i + 1);
                          
                          // 如果没有选择文件夹，将当前波段强制重置为 0 (None)
                          const currentBand = selectedFolder && view.bands[bandIndex] !== undefined 
                            ? view.bands[bandIndex] 
                            : 0;
                          
                          return (
                            <div key={`band-${view.id}-${bandIndex}`} className="flex-1">
                              <Select
                                disabled={!view.folderId} // 修复2: 未选择文件夹时，直接禁用该下拉框！
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
          
          {/* 【新增】右侧界面确认/取消按钮控制区 */}
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">
              {views.length} view(s) configured
            </span>
            <Button onClick={() => { /* 可以预留为重置 View 等逻辑 */ }} variant="outline" disabled={views.length === 0}>
              <X className="w-4 h-4 mr-2" /> Reset
            </Button>
            <Button onClick={handleConfirmViews} disabled={views.length === 0} className="bg-blue-600 hover:bg-blue-700">
              <Check className="w-4 h-4 mr-2" /> Confirm & Map Extents
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}