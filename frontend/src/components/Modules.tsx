import React, { useState, useRef, useEffect } from 'react';
import { useStore, Annotation } from '../store/useStore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

import { 
  Menu, Layers, Settings, Download, FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2, CheckCircle2,
  Eye, EyeOff, Maximize, Move, Save, MousePointer2, Square, Hexagon, Database, Image as ImageIcon,RotateCcw,Zap,
  AlertTriangle, FileJson, FileText, Hand, Settings2, SplitSquareHorizontal // 新增这几个
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


export function ViewExtentCheck() {
  const { views, folders, updateView, setActiveModule } = useStore();
  
  const mainView = views.find(v => v.isMain);
  const augViews = views.filter(v => !v.isMain);

  // --- 状态管理 ---
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.5 });
  const [mode, setMode] = useState<'pan' | 'align'>('pan');
  const [alignSubMode, setAlignSubMode] = useState<'crop' | 'transform'>('transform');
  const [activeAugId, setActiveAugId] = useState<string>(augViews[0]?.id || '');
  // const [topBarConfig, setTopBarConfig] = useState({ opacity: 0.6, curtain: 100, isBlinking: false, showOutsideCrop: true });
  // 【修改1】：将透明度、水平卷帘、垂直卷帘整合为一个互斥模式
// 【修改1】：将 isBlinking 改为 showAugView，默认开启 (true)
  const [topBarConfig, setTopBarConfig] = useState({ 
    mode: 'opacity' as 'opacity' | 'swipeX' | 'swipeY', 
    value: 0.6, 
    showAugView: true, 
    showOutsideCrop: true 
  });
  // 操作A：裁剪范围状态
  const [crops, setCrops] = useState<Record<string, { t: number, r: number, b: number, l: number }>>({});
  const [draggingEdge, setDraggingEdge] = useState<'t' | 'r' | 'b' | 'l' | null>(null);

  // 操作B：拉伸控制状态
  const [draggingTransformHandle, setDraggingTransformHandle] = useState<'t' | 'l' | 'r' | 'b' | 'br' | null>(null);
  
  // --- 进度与预设状态 ---
  // 记录已完成对齐检查的视图 ID
  const [completedViews, setCompletedViews] = useState<Set<string>>(new Set());
  // 保存的对齐参数库 (Presets)
  const [savedAlignments, setSavedAlignments] = useState<Array<{id: string, name: string, crop: any, transform: any}>>([]);
  // 用于强制刷新右侧参数显示面板的 Tick
  const [renderTick, setRenderTick] = useState(0);
  
  // --- 【高性能重构】专用 Refs ---
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const tempTransformRef = useRef({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainImgRef = useRef<HTMLImageElement>(null);
  const augImgRef = useRef<HTMLImageElement>(null);
  const augTransformContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeAugView) {
      tempTransformRef.current = { 
        offsetX: activeAugView.transform.offsetX, 
        offsetY: activeAugView.transform.offsetY,
        scaleX: activeAugView.transform.scaleX,
        // 兼容老数据，如果没有 scaleY，默认等于 scaleX
        scaleY: activeAugView.transform.scaleY || activeAugView.transform.scaleX
      };
    }
  }, [activeAugId]);

  if (views.length <= 1) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 text-neutral-400">
        <Layers className="w-12 h-12 text-blue-500" />
        <h3 className="text-xl text-neutral-100 font-bold">Extent Check Skipped</h3>
        <p>Only one view (Main View) is configured. No alignment is needed.</p>
        <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setActiveModule('export')}>
          Proceed to Next Step <Check className="w-4 h-4 ml-2"/>
        </Button>
      </div>
    );
  }

  const activeAugView = augViews.find(v => v.id === activeAugId) || augViews[0];
  const activeCrop = crops[activeAugView.id] || { t: 0, r: 100, b: 100, l: 0 };

  const getPreviewUrl = (view: typeof mainView) => {
    if (!view) return '';
    const folder = folders.find(f => f.id === view.folderId);
    if (!folder) return '';
    return `http://localhost:8080/api/project/preview?folderPath=${encodeURIComponent(folder.path)}&bands=${view.bands.join(',')}`;
  };

  const updateAugDOMTransform = () => {
    if (!augTransformContainerRef.current) return;
    const { offsetX, offsetY, scaleX, scaleY } = tempTransformRef.current;
    augTransformContainerRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scaleX}, ${scaleY})`;
  };
// 【新增】解决跳变的核心：在点击手柄的瞬间，强制同步最新的鼠标物理坐标
  const startEdgeDrag = (e: React.PointerEvent, edge: 't' | 'r' | 'b' | 'l') => {
    e.stopPropagation();
    setDraggingEdge(edge);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };
// 确保这里的参数类型包含了 't' 和 'l'
  const startTransformDrag = (e: React.PointerEvent, handle: 't' | 'l' | 'r' | 'b' | 'br') => {
    e.stopPropagation();
    setDraggingTransformHandle(handle);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    
    if (activeAugView) {
        tempTransformRef.current.scaleX = activeAugView.transform.scaleX || 1;
        tempTransformRef.current.scaleY = activeAugView.transform.scaleY || activeAugView.transform.scaleX || 1;
    }
  };
  const handlePointerDown = (e: React.PointerEvent) => {
    if (draggingEdge || draggingTransformHandle) return; 
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    
    if (mode === 'align' && alignSubMode === 'transform' && activeAugView) {
        tempTransformRef.current = { 
            offsetX: activeAugView.transform.offsetX, 
            offsetY: activeAugView.transform.offsetY,
            scaleX: activeAugView.transform.scaleX,
            scaleY: activeAugView.transform.scaleY || activeAugView.transform.scaleX
        };
    }

    if (canvasRef.current) {
        canvasRef.current.setPointerCapture(e.pointerId);
        canvasRef.current.style.userSelect = 'none'; 
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    
    // 【操作B：边框拉伸】
// 【操作B：边框拉伸】
// 【操作B：全方位拉伸与吸附】
    if (draggingTransformHandle && mode === 'align' && alignSubMode === 'transform' && augImgRef.current && mainImgRef.current) {
        const mainRect = mainImgRef.current.getBoundingClientRect();
        const augRect = augImgRef.current.getBoundingClientRect();
        const snapThreshold = 6; // 吸附阈值

        // 基础增量（需除以视口缩放以保持像素同步）
        const deltaX = dx / viewport.scale;
        const deltaY = dy / viewport.scale;

        // 获取当前物理尺寸
        const currentWidth = augRect.width / viewport.scale;
        const currentHeight = augRect.height / viewport.scale;

        // --- 核心逻辑：根据不同手柄执行 Scale 变化与 Offset 补偿 ---
        
        // 1. 右边缘 (ScaleX)
        if (draggingTransformHandle === 'r' || draggingTransformHandle === 'br') {
            const newScaleX = tempTransformRef.current.scaleX * (1 + deltaX / currentWidth);
            // 简单吸附：如果右边缘靠近 Main 右边缘
            if (Math.abs(augRect.right - mainRect.right) < snapThreshold) {
                const snappedWidth = (mainRect.right - augRect.left) / viewport.scale;
                tempTransformRef.current.scaleX = snappedWidth / (augRect.width / viewport.scale / tempTransformRef.current.scaleX);
            } else {
                tempTransformRef.current.scaleX = Math.max(0.01, newScaleX);
            }
        }

        // 2. 底边缘 (ScaleY)
        if (draggingTransformHandle === 'b' || draggingTransformHandle === 'br') {
            const newScaleY = tempTransformRef.current.scaleY * (1 + deltaY / currentHeight);
            if (Math.abs(augRect.bottom - mainRect.bottom) < snapThreshold) {
                const snappedHeight = (mainRect.bottom - augRect.top) / viewport.scale;
                tempTransformRef.current.scaleY = snappedHeight / (augRect.height / viewport.scale / tempTransformRef.current.scaleY);
            } else {
                tempTransformRef.current.scaleY = Math.max(0.01, newScaleY);
            }
        }

        // 3. 左边缘 (ScaleX + OffsetX 补偿)
        if (draggingTransformHandle === 'l') {
            // 往左拉 dx 是负的，宽度增加
            const newScaleX = tempTransformRef.current.scaleX * (1 - deltaX / currentWidth);
            if (Math.abs(augRect.left - mainRect.left) < snapThreshold) {
                const snappedWidth = (augRect.right - mainRect.left) / viewport.scale;
                const oldScaleX = tempTransformRef.current.scaleX;
                tempTransformRef.current.scaleX = snappedWidth / (augRect.width / viewport.scale / oldScaleX);
                tempTransformRef.current.offsetX -= (mainRect.left - augRect.left) / viewport.scale;
            } else {
                tempTransformRef.current.scaleX = Math.max(0.01, newScaleX);
                tempTransformRef.current.offsetX += deltaX;
            }
        }

        // 4. 顶边缘 (ScaleY + OffsetY 补偿)
        if (draggingTransformHandle === 't') {
            const newScaleY = tempTransformRef.current.scaleY * (1 - deltaY / currentHeight);
            if (Math.abs(augRect.top - mainRect.top) < snapThreshold) {
                const snappedHeight = (augRect.bottom - mainRect.top) / viewport.scale;
                const oldScaleY = tempTransformRef.current.scaleY;
                tempTransformRef.current.scaleY = snappedHeight / (augRect.height / viewport.scale / oldScaleY);
                tempTransformRef.current.offsetY -= (mainRect.top - augRect.top) / viewport.scale;
            } else {
                tempTransformRef.current.scaleY = Math.max(0.01, newScaleY);
                tempTransformRef.current.offsetY += deltaY;
            }
        }

        requestAnimationFrame(updateAugDOMTransform);
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    // 【操作A：裁剪高亮范围与吸附】
// 【操作A：裁剪高亮范围与吸附】
    if (draggingEdge && augImgRef.current && mainImgRef.current) {
      const rect = augImgRef.current.getBoundingClientRect();
      // 增加防御性检查，防止除以 0
      if (rect.width === 0 || rect.height === 0) return;

      const dxPct = (dx / rect.width) * 100;
      const dyPct = (dy / rect.height) * 100;
      
      let newCrop = { ...activeCrop };
      
      // 优化：将边界限制稍微放宽（允许 0 到 100.1），防止因浮点数误差导致无法拖动到底边
      if (draggingEdge === 't') newCrop.t = Math.max(0, Math.min(newCrop.b - 0.5, newCrop.t + dyPct));
      if (draggingEdge === 'b') newCrop.b = Math.min(100, Math.max(newCrop.t + 0.5, newCrop.b + dyPct));
      if (draggingEdge === 'l') newCrop.l = Math.max(0, Math.min(newCrop.r - 0.5, newCrop.l + dxPct));
      if (draggingEdge === 'r') newCrop.r = Math.min(100, Math.max(newCrop.l + 0.5, newCrop.r + dxPct));

      // --- 重新设计的吸附逻辑 ---
      const mainRect = mainImgRef.current.getBoundingClientRect();
      const snapThresholdPx = 8; // 稍微调大一点点提高易用性
      
      // 计算当前裁剪边在屏幕上的真实物理坐标
      const currentPhysicalT = rect.top + (newCrop.t / 100) * rect.height;
      const currentPhysicalB = rect.top + (newCrop.b / 100) * rect.height;
      const currentPhysicalL = rect.left + (newCrop.l / 100) * rect.width;
      const currentPhysicalR = rect.left + (newCrop.r / 100) * rect.width;

      // 吸附：当物理坐标靠近 Main View 边界时，强制对齐
      // 解决“吸附后难移动”：只有当鼠标移动带来的位置改变超过阈值时才强制跳出
      if (draggingEdge === 't' && Math.abs(currentPhysicalT - mainRect.top) < snapThresholdPx) 
        newCrop.t = ((mainRect.top - rect.top) / rect.height) * 100;
      
      if (draggingEdge === 'b' && Math.abs(currentPhysicalB - mainRect.bottom) < snapThresholdPx) 
        newCrop.b = ((mainRect.bottom - rect.top) / rect.height) * 100;
      
      if (draggingEdge === 'l' && Math.abs(currentPhysicalL - mainRect.left) < snapThresholdPx) 
        newCrop.l = ((mainRect.left - rect.left) / rect.width) * 100;
      
      if (draggingEdge === 'r' && Math.abs(currentPhysicalR - mainRect.right) < snapThresholdPx) 
        newCrop.r = ((mainRect.right - rect.left) / rect.width) * 100;

      // 最后的安全检查，确保百分比不越界
      newCrop.t = Math.max(0, newCrop.t);
      newCrop.b = Math.min(100, newCrop.b);
      newCrop.l = Math.max(0, newCrop.l);
      newCrop.r = Math.min(100, newCrop.r);

      setCrops({ ...crops, [activeAugView.id]: newCrop });
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDraggingRef.current) return;
    lastPosRef.current = { x: e.clientX, y: e.clientY };

    if (mode === 'pan') {
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (mode === 'align' && alignSubMode === 'transform' && activeAugView) {
      // 【操作B：平移】
      tempTransformRef.current.offsetX += (dx / viewport.scale);
      tempTransformRef.current.offsetY += (dy / viewport.scale);
      requestAnimationFrame(updateAugDOMTransform);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // 操作B结束：保存缩放或平移状态到 Store
    if ((draggingTransformHandle || isDraggingRef.current) && mode === 'align' && alignSubMode === 'transform' && activeAugView) {
        updateView(activeAugView.id, { 
            transform: { 
                ...activeAugView.transform, 
                offsetX: tempTransformRef.current.offsetX,
                offsetY: tempTransformRef.current.offsetY,
                scaleX: tempTransformRef.current.scaleX,
                scaleY: tempTransformRef.current.scaleY,
            } 
        });
    }

    isDraggingRef.current = false;
    setDraggingEdge(null);
    setDraggingTransformHandle(null);
    
    if (canvasRef.current) {
        canvasRef.current.releasePointerCapture(e.pointerId);
        canvasRef.current.style.userSelect = 'auto';
    }

    // 【新增】：强制刷新右侧参数面板
    setRenderTick(p => p + 1);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08; 

    if (mode === 'pan') {
      setViewport(prev => ({ ...prev, scale: Math.max(0.01, Math.min(20, prev.scale * zoomFactor)) }));
    } else if (mode === 'align' && alignSubMode === 'transform' && activeAugView) {
      // 【修复滚轮跳动 Bug】：正确使用 scaleX 和 scaleY 同步更新
      const newScaleX = Math.max(0.001, activeAugView.transform.scaleX * zoomFactor);
      const newScaleY = Math.max(0.001, (activeAugView.transform.scaleY || activeAugView.transform.scaleX) * zoomFactor);
      
      tempTransformRef.current.scaleX = newScaleX;
      tempTransformRef.current.scaleY = newScaleY;
      
      requestAnimationFrame(updateAugDOMTransform);
      updateView(activeAugView.id, { transform: { ...activeAugView.transform, scaleX: newScaleX, scaleY: newScaleY } });
    }
  };// --- 新增：自动化与重置逻辑 ---

  // 功能 1 & 2: 操作 B 下的一键对齐与重置
  const handleAutoSnapCrop = () => {
    if (!mainImgRef.current || !augImgRef.current) return;
    const mainRect = mainImgRef.current.getBoundingClientRect();
    const augRect = augImgRef.current.getBoundingClientRect();
    
    // 计算将 Aug View 高亮框对齐到 Main View 的百分比坐标
    const newCrop = {
      t: Math.max(0, Math.min(100, ((mainRect.top - augRect.top) / augRect.height) * 100)),
      b: Math.max(0, Math.min(100, ((mainRect.bottom - augRect.top) / augRect.height) * 100)),
      l: Math.max(0, Math.min(100, ((mainRect.left - augRect.left) / augRect.width) * 100)),
      r: Math.max(0, Math.min(100, ((mainRect.right - augRect.left) / augRect.width) * 100)),
    };
    setCrops({ ...crops, [activeAugView.id]: newCrop });
  };


// --- 功能 1: 自动拉伸 Aug View 的高亮框以适配 Main View ---
// --- 功能 1: 自动拉伸 Aug View 的高亮框以完美贴合 Main View ---
  const handleFitToMain = () => {
    if (!mainImgRef.current || !augImgRef.current || !activeAugView) return;

    // 1. 获取 Main View 在父容器中的本地尺寸和坐标 (不受 viewport.scale 干扰)
    const targetW = mainImgRef.current.offsetWidth;
    const targetH = mainImgRef.current.offsetHeight;
    const targetX = mainImgRef.current.offsetLeft;
    const targetY = mainImgRef.current.offsetTop;

    // 2. 获取 Aug View 在应用 Transform 前的本地基础尺寸
    // 注意：CSS Transform 是基于 offsetWidth/offsetHeight 进行缩放的，绝对不能用 naturalWidth！
    const baseAugW = augImgRef.current.offsetWidth;
    const baseAugH = augImgRef.current.offsetHeight;

    // 3. 计算当前高亮框 (Crop) 在 Aug View 基础尺寸上的本地像素坐标和大小
    const cropLocalX = baseAugW * (activeCrop.l / 100);
    const cropLocalY = baseAugH * (activeCrop.t / 100);
    const cropLocalW = baseAugW * ((activeCrop.r - activeCrop.l) / 100);
    const cropLocalH = baseAugH * ((activeCrop.b - activeCrop.t) / 100);

    if (cropLocalW === 0 || cropLocalH === 0) return;

    // 4. 计算缩放比例：将 Crop 区域完美放大到 Main View 的大小
    const nextScaleX = targetW / cropLocalW;
    const nextScaleY = targetH / cropLocalH;

    // 5. 计算偏移量 (Offset)
    // 根据 CSS Transform 原理：先以 top left (0,0) 为原点缩放，再平移。
    // 我们希望 Crop 的左上角 (cropLocalX, cropLocalY) 最终落在 Main View 的左上角 (targetX, targetY)
    // 公式: targetX = (cropLocalX * nextScaleX) + nextOffsetX
    const nextOffsetX = targetX - (cropLocalX * nextScaleX);
    const nextOffsetY = targetY - (cropLocalY * nextScaleY);

    // 6. 同步更新状态
    tempTransformRef.current = {
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
      scaleX: nextScaleX,
      scaleY: nextScaleY
    };
    
    updateAugDOMTransform();
    updateView(activeAugView.id, { 
      transform: { 
        offsetX: nextOffsetX, 
        offsetY: nextOffsetY, 
        scaleX: nextScaleX, 
        scaleY: nextScaleY 
      } 
    });
  };

  // --- 功能 2 & 3: 重置逻辑 ---
  const handleResetTransform = () => {
    tempTransformRef.current = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
    updateAugDOMTransform();
    updateView(activeAugView.id, { transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 } });
  };

  const handleResetCrop = () => {
    setCrops({ ...crops, [activeAugView.id]: { t: 0, r: 100, b: 100, l: 0 } });
  };
// --- 预设、手动控制与验证逻辑 ---

  // 应用某个对齐参数到当前视图
  const applyAlignmentPreset = (crop: any, transform: any) => {
    if (!activeAugView) return;
    setCrops({ ...crops, [activeAugView.id]: crop });
    tempTransformRef.current = { ...transform };
    updateAugDOMTransform();
    updateView(activeAugView.id, { transform });
    setRenderTick(p => p + 1);
  };

  // 【新增】：手动输入与滑块联动逻辑
  const handleManualCropChange = (key: 't'|'r'|'b'|'l', val: number) => {
    if (!activeAugView) return;
    let newCrop = { ...activeCrop };
    if (key === 't') newCrop.t = Math.max(0, Math.min(newCrop.b - 0.1, val));
    if (key === 'b') newCrop.b = Math.min(100, Math.max(newCrop.t + 0.1, val));
    if (key === 'l') newCrop.l = Math.max(0, Math.min(newCrop.r - 0.1, val));
    if (key === 'r') newCrop.r = Math.min(100, Math.max(newCrop.l + 0.1, val));
    setCrops({ ...crops, [activeAugView.id]: newCrop });
  };

  const handleManualTransformChange = (key: 'scaleX'|'scaleY'|'offsetX'|'offsetY', val: number) => {
    if (!activeAugView) return;
    tempTransformRef.current = { ...tempTransformRef.current, [key]: val };
    updateAugDOMTransform();
    updateView(activeAugView.id, { transform: { ...tempTransformRef.current } });
    setRenderTick(p => p + 1);
  };

  // 检查并保存当前 View 的对齐状态
  const handleSaveCurrentView = () => {
    if (!mainImgRef.current || !augImgRef.current || !activeAugView) return;
    
    const mainRect = mainImgRef.current.getBoundingClientRect();
    const augRect = augImgRef.current.getBoundingClientRect();
    
    const cropPhysical = {
      top: augRect.top + (activeCrop.t / 100) * augRect.height,
      bottom: augRect.top + (activeCrop.b / 100) * augRect.height,
      left: augRect.left + (activeCrop.l / 100) * augRect.width,
      right: augRect.left + (activeCrop.r / 100) * augRect.width,
    };

    const isAligned = 
      Math.abs(cropPhysical.top - mainRect.top) < 2 &&
      Math.abs(cropPhysical.bottom - mainRect.bottom) < 2 &&
      Math.abs(cropPhysical.left - mainRect.left) < 2 &&
      Math.abs(cropPhysical.right - mainRect.right) < 2;

    const markAsCompleteAndSave = () => {
      setCompletedViews(prev => new Set(prev).add(activeAugView.id));
      
      // 【修改】：将预设名称改为对应的 Aug View 名称
      const viewIndex = augViews.findIndex(v => v.id === activeAugView.id);
      const presetName = `Aug View ${viewIndex + 1}`;
      
      setSavedAlignments(prev => [
        ...prev.filter(p => p.name !== presetName), // 覆盖同名旧记录
        { id: Math.random().toString(), name: presetName, crop: { ...activeCrop }, transform: { ...tempTransformRef.current } }
      ]);
    };

    if (isAligned) {
      markAsCompleteAndSave();
    } else {
      const autoAlign = window.confirm("Current crop box is NOT perfectly aligned with the Main View.\n\nDo you want the system to Auto-Align (Fit to Main) and save?");
      if (autoAlign) {
        handleFitToMain(); 
        requestAnimationFrame(() => {
          markAsCompleteAndSave();
          setRenderTick(p => p + 1);
        });
      }
    }
  };

  // 【修改】：所有视图对齐完毕，调出保存路径并进入下一步
  const proceedToExport = async () => {
    if (completedViews.size < augViews.length) {
      alert("Please save and confirm alignment for ALL Aug Views before proceeding.");
      return;
    }

    // 整合所有需要保存的配置参数
    const exportData = {
      projectMeta: { folders, views },
      extentCheck: { crops }
    };
    const jsonStr = JSON.stringify(exportData, null, 2);

    try {
      // 【修复报错】：使用 (window as any) 绕过 TS 的类型检查
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'project_alignment_parameters.json',
          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
      } else {
        // 降级方案：自动下载文件
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project_alignment_parameters.json';
        a.click();
        URL.revokeObjectURL(url);
      }
      setActiveModule('export'); // 或者跳转到 'annotation'
    } catch (err) {
      console.warn("Save cancelled or failed", err);
      if (window.confirm("Save cancelled. Do you still want to proceed to the next step?")) {
         setActiveModule('export');
      }
    }
  };

  
// 【修改2】：在 return 之前，计算当前互斥模式下的最终参数
  const isOpacityMode = topBarConfig.mode === 'opacity';
  const isSwipeXMode = topBarConfig.mode === 'swipeX';
  const isSwipeYMode = topBarConfig.mode === 'swipeY';

  // 透明度模式下读取滑块值，否则恢复 100% (1)
  const currentOpacity = isOpacityMode ? topBarConfig.value : 1;
  
  // 卷帘模式下，动态限制裁剪显示的右边界和下边界
  let displayR = activeCrop.r;
  let displayB = activeCrop.b;
  if (isSwipeXMode) displayR = Math.max(activeCrop.l, Math.min(activeCrop.r, topBarConfig.value));
  if (isSwipeYMode) displayB = Math.max(activeCrop.t, Math.min(activeCrop.b, topBarConfig.value));

  // 合成最终内部高亮图像的 clipPath
// 合成最终内部高亮图像的 clipPath
  const innerClipPath = `polygon(${activeCrop.l}% ${activeCrop.t}%, ${displayR}% ${activeCrop.t}%, ${displayR}% ${displayB}%, ${activeCrop.l}% ${displayB}%)`;

  // --- 【新增】：卷帘互斥拦截器 ---
  // 当处于卷帘模式时，点击其他任何功能按钮，都会自动退出卷帘并恢复透明度为 100%
  const withSwipeCancel = (action: () => void) => {
    if (topBarConfig.mode !== 'opacity') {
      setTopBarConfig(p => ({ ...p, mode: 'opacity', value: 1 }));
    }
    action();
  };

  // 专门用于处理布尔值开关的拦截器 (Mask 和 显隐开关)
  const toggleConfigWithSwipeCancel = (key: 'showOutsideCrop' | 'showAugView') => {
    setTopBarConfig(p => {
      const next = { ...p, [key]: !p[key] };
      if (next.mode !== 'opacity') {
        next.mode = 'opacity';
        next.value = 1;
      }
      return next;
    });
  };


  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 font-sans text-neutral-200 select-none">
      
      {/* 顶部视觉控制台 (清爽布局) */}
{/* 顶部视觉控制台 (固定布局重构版) */}
      <div className="h-14 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0 z-50 relative overflow-x-auto">
        
        {/* 左侧 & 中间：模式切换与固定操作区 */}
        <div className="flex items-center gap-3">
          
          {/* 主模式切换 */}
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 shrink-0">
            {/* 加上 withSwipeCancel */}
            <Button variant={mode === 'pan' ? 'default' : 'ghost'} size="sm" className={`h-7 px-3 ${mode === 'pan' ? "bg-blue-600" : "text-neutral-400"}`} onClick={() => withSwipeCancel(() => setMode('pan'))}>
              <Hand className="w-3.5 h-3.5 mr-1.5"/> Pan
            </Button>
            <Button variant={mode === 'align' ? 'default' : 'ghost'} size="sm" className={`h-7 px-3 ${mode === 'align' ? "bg-green-600" : "text-neutral-400"}`} onClick={() => withSwipeCancel(() => setMode('align'))}>
              <Move className="w-3.5 h-3.5 mr-1.5"/> Align
            </Button>
          </div>

          {/* 对齐子模式切换 & 操作面板 */}
          {mode === 'align' && (
            <div className="flex items-center gap-2 ml-2 shrink-0 animate-in fade-in slide-in-from-left-4">
               
               <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                 <Button 
                   variant={alignSubMode === 'crop' ? 'default' : 'ghost'} size="sm" 
                   className={`h-7 px-3 rounded-md ${alignSubMode === 'crop' ? "bg-amber-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
                   onClick={() => withSwipeCancel(() => setAlignSubMode('crop'))}
                 >
                   <Square className="w-3.5 h-3.5 mr-1.5"/> Crop
                 </Button>
                 <Button 
                   variant={alignSubMode === 'transform' ? 'default' : 'ghost'} size="sm" 
                   className={`h-7 px-3 rounded-md ${alignSubMode === 'transform' ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
                   onClick={() => withSwipeCancel(() => setAlignSubMode('transform'))}
                 >
                   <Maximize className="w-3.5 h-3.5 mr-1.5"/> Move/Zoom
                 </Button>
               </div>

               <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-700">
                 
                 {/* Crop 的专属操作 */}
                 <div className="flex items-center gap-0.5 border-r border-neutral-700 pr-1 mr-0.5">
                   <Button 
                     variant={topBarConfig.showOutsideCrop ? 'ghost' : 'secondary'} 
                     size="sm" 
                     className={`h-7 px-2 transition-opacity ${alignSubMode !== 'crop' ? 'opacity-30 cursor-not-allowed' : (!topBarConfig.showOutsideCrop ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white hover:bg-amber-500/20')}`} 
                     disabled={alignSubMode !== 'crop'}
                     onClick={() => toggleConfigWithSwipeCancel('showOutsideCrop')}
                     title="Toggle Mask"
                   >
                     {topBarConfig.showOutsideCrop ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1 text-amber-500" />}
                     Mask
                   </Button>
                   <Button 
                     variant="ghost" size="icon" 
                     className={`h-7 w-7 transition-opacity ${alignSubMode !== 'crop' ? 'opacity-30 cursor-not-allowed' : 'text-neutral-400 hover:text-white hover:bg-amber-500/20'}`} 
                     disabled={alignSubMode !== 'crop'}
                     onClick={() => withSwipeCancel(handleResetCrop)} title="Reset Crop Area"
                   >
                     <RotateCcw className="w-3.5 h-3.5"/>
                   </Button>
                 </div>

                 {/* Move/Zoom 的专属操作 */}
                 <div className="flex items-center gap-0.5">
                   <Button 
                     variant="ghost" size="sm" 
                     className={`h-7 px-2 transition-opacity ${alignSubMode !== 'transform' ? 'opacity-30 cursor-not-allowed' : 'text-blue-400 hover:bg-blue-400/20'}`} 
                     disabled={alignSubMode !== 'transform'}
                     onClick={() => withSwipeCancel(handleFitToMain)}
                     title="Fit Cropped Area to Main View"
                   >
                     <Zap className="w-3.5 h-3.5 mr-1"/> Fit to Main
                   </Button>
                   <Button 
                     variant="ghost" size="icon" 
                     className={`h-7 w-7 transition-opacity ${alignSubMode !== 'transform' ? 'opacity-30 cursor-not-allowed' : 'text-neutral-400 hover:text-white hover:bg-blue-500/20'}`} 
                     disabled={alignSubMode !== 'transform'}
                     onClick={() => withSwipeCancel(handleResetTransform)} title="Reset Position/Scale"
                   >
                     <RotateCcw className="w-3.5 h-3.5"/>
                   </Button>
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* 右侧：视觉滑块控制面板 */}
        <div className="flex items-center gap-3 shrink-0 pl-4">
          <div className="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
            {/* 滑块部分无需包拦截器 */}
            <Select 
              value={topBarConfig.mode} 
              onValueChange={(val: any) => setTopBarConfig(p => ({
                  ...p, mode: val, value: val === 'opacity' ? 0.6 : 100 
              }))}
            >
              <SelectTrigger className="h-7 w-[95px] text-xs bg-transparent border-none focus:ring-0 text-neutral-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opacity">Opacity</SelectItem>
                <SelectItem value="swipeX">H-Swipe</SelectItem>
                <SelectItem value="swipeY">V-Swipe</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="w-[120px] px-2 flex items-center shrink-0">
              <Slider 
                key={topBarConfig.mode} 
                min={0}
                max={topBarConfig.mode === 'opacity' ? 1 : 100} 
                step={topBarConfig.mode === 'opacity' ? 0.01 : 1} 
                value={[topBarConfig.value]} 
                onValueChange={(val) => {
                  const v = Array.isArray(val) ? val[0] : (val as number);
                  setTopBarConfig(p => ({...p, value: v}));
                }}
                className="w-full cursor-pointer relative"
              />
            </div>
            
            <span className="text-[10px] text-neutral-400 w-9 text-right font-mono select-none pr-1 shrink-0">
              {topBarConfig.mode === 'opacity' ? `${Math.round(topBarConfig.value * 100)}%` : `${topBarConfig.value}%`}
            </span>
          </div>

          <Button 
            variant={!topBarConfig.showAugView ? "default" : "outline"} 
            size="icon" 
            className="h-7 w-7 border-neutral-700 shrink-0" 
            onClick={() => toggleConfigWithSwipeCancel('showAugView')}
            title={topBarConfig.showAugView ? "Hide Aug View" : "Show Aug View"}
          >
            {topBarConfig.showAugView ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5 text-blue-400"/>}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧主体：对齐工作区 */}
        <div 
          ref={canvasRef}
          className={`flex-1 relative overflow-hidden bg-black flex items-center justify-center ${mode === 'pan' ? 'cursor-grab active:cursor-grabbing' : (alignSubMode === 'crop' ? 'cursor-default' : 'cursor-move')}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          style={{ touchAction: 'none' }} 
        >
          <div style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`, transformOrigin: 'center center' }} className="relative">
            
            <div className={`relative transition-all duration-300 ${mode === 'pan' ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.85)] border-2 border-dashed border-red-500 z-10' : 'z-0'}`}>
              
              {mode === 'pan' && <span className="absolute -top-6 left-0 text-[10px] text-red-500 font-mono bg-black/50 px-1">MAIN VIEW BORDER</span>}
              
              <img ref={mainImgRef} src={getPreviewUrl(mainView!)} alt="Main View Base" className="pointer-events-none block max-w-none" />

              {activeAugView && (
                <div className={`absolute top-0 left-0 w-full h-full ${mode === 'align' ? 'z-30' : 'z-20 pointer-events-none'}`}>
                  
                  <div 
                    ref={augTransformContainerRef}
                    className="absolute top-0 left-0 max-w-none transition-transform will-change-transform"
                    style={{
                      transformOrigin: 'top left',
                      transform: `translate3d(${activeAugView.transform.offsetX}px, ${activeAugView.transform.offsetY}px, 0) scale(${activeAugView.transform.scaleX}, ${activeAugView.transform.scaleY || activeAugView.transform.scaleX})`,
                    }}
                  >
                     {/* 内部高亮图像 */}
                     {/* 【修改4】：应用计算好的透明度和裁剪路径 */}
                     {/* 内部高亮图像 */}
{/* 【修改3】：移除脉冲动画，使用 showAugView 控制最终透明度 */}
                     {/* 内部高亮图像 */}
                     <img 
                        ref={augImgRef} 
                        src={getPreviewUrl(activeAugView)} 
                        alt="Aug View Inside" 
                        // 去掉了 animate-pulse，增加了透明度过渡动画
                        className="block max-w-none pointer-events-none mix-blend-screen transition-opacity duration-150" 
                        style={{ 
                            // 核心：如果开关关闭，透明度直接设为 0
                            opacity: topBarConfig.showAugView ? currentOpacity : 0,
                            clipPath: innerClipPath
                        }} 
                    />
                     
                     {/* 操作A：裁剪 UI (Crop UI) */}
                     {mode === 'align' && alignSubMode === 'crop' && (
                       <div className="absolute inset-0">
                         {/* 外部低透明度图像：同样受 showAugView 总开关控制 */}
                         <img 
                            src={getPreviewUrl(activeAugView)} 
                            alt="Aug View Outside" 
                            className="absolute top-0 left-0 max-w-none pointer-events-none mix-blend-screen transition-opacity duration-200" 
                            style={{ 
                                // 核心：增加 topBarConfig.showAugView 判断
                                opacity: (topBarConfig.showAugView && topBarConfig.showOutsideCrop && isOpacityMode) ? (currentOpacity * 0.4) : 0, 
                                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${activeCrop.l}% ${activeCrop.t}%, ${activeCrop.l}% ${activeCrop.b}%, ${activeCrop.r}% ${activeCrop.b}%, ${activeCrop.r}% ${activeCrop.t}%, ${activeCrop.l}% ${activeCrop.t}%)`
                            }} 
                        />
                         
                         <div className="absolute border border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                              style={{ top: `${activeCrop.t}%`, bottom: `${100-activeCrop.b}%`, left: `${activeCrop.l}%`, right: `${100-activeCrop.r}%` }}>
                            
                            {/* 操作A：4条边框拖拽控制手柄 */}
                            <div className="absolute top-0 left-0 w-full h-4 -translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 't')} />
                            <div className="absolute bottom-0 left-0 w-full h-4 translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 'b')} />
                            <div className="absolute top-0 left-0 w-4 h-full -translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 'l')} />
                            <div className="absolute top-0 right-0 w-4 h-full translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-amber-500/30" onPointerDown={(e) => startEdgeDrag(e, 'r')} />

                            <span className="absolute -top-6 left-0 text-[10px] text-amber-400 font-bold bg-black/80 px-1.5 py-0.5 border border-amber-500 whitespace-nowrap">
                              AUG RANGE (Drag edges to crop)
                            </span>
                         </div>
                       </div>
                     )}

                     {/* 操作B：高亮范围虚线框 (赋予拉伸能力) */}
                    {/* 操作B：高亮范围虚线框 (全方位拉伸) */}
                     {mode === 'align' && alignSubMode === 'transform' && (
                        <div className="absolute border-2 border-blue-500 pointer-events-none dashed-border"
                             style={{ top: `${activeCrop.t}%`, bottom: `${100-activeCrop.b}%`, left: `${activeCrop.l}%`, right: `${100-activeCrop.r}%` }}>
                            
                            {/* 八向拉伸控制手柄 */}
                            {/* 顶边 */}
                            <div className="absolute top-0 left-0 w-full h-4 -translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 't')} />
                            {/* 底边 */}
                            <div className="absolute bottom-0 left-0 w-full h-4 translate-y-2 cursor-ns-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 'b')} />
                            {/* 左边 */}
                            <div className="absolute top-0 left-0 w-4 h-full -translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 'l')} />
                            {/* 右边 */}
                            <div className="absolute top-0 right-0 w-4 h-full translate-x-2 cursor-ew-resize pointer-events-auto bg-transparent hover:bg-blue-500/30" 
                                 onPointerDown={(e) => startTransformDrag(e, 'r')} />
                            
                            {/* 右下角缩放点 */}
                            <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform" 
                                 onPointerDown={(e) => startTransformDrag(e, 'br')} />

                          <span className="absolute -top-6 left-0 text-[10px] text-blue-400 font-bold bg-black/80 px-1.5 py-0.5 border border-blue-500 whitespace-nowrap">
                            AUG CONTENT (Drag any edge to stretch/snap)
                          </span>
                        </div>
                     )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧面板 (极致紧凑的专业工作流布局) */}
        <div className="w-[340px] bg-neutral-900 flex flex-col shrink-0 border-l border-neutral-800">
          
          {/* 1. 已存在的对齐参数库 (Presets) - 【修改】：高度从 140px 增加到 190px (分配更多空间) */}
          <div className="p-3 border-b border-neutral-800 flex flex-col h-[140px] shrink-0">
             <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Existing Parameters</h2>
             <div className="overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                {/* 默认重置参数 */}
                <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 py-1 px-2 rounded-md">
                   <span className="text-[11px] text-neutral-300 font-mono">Default (Reset)</span>
                   <Button size="sm" variant="secondary" className="h-5 px-2 text-[9px]" 
                     onClick={() => applyAlignmentPreset({ t: 0, r: 100, b: 100, l: 0 }, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 })}>
                     Apply
                   </Button>
                </div>
                {/* 动态生成的已存参数 */}
                {savedAlignments.map((preset) => (
                  <div key={preset.id} className="flex flex-col bg-blue-950/20 border border-blue-900/50 p-1.5 rounded-md space-y-1">
                     <div className="flex items-center justify-between">
                       <span className="text-[11px] text-blue-300 font-bold">{preset.name}</span>
                       <Button size="sm" variant="default" className="h-5 px-2 text-[9px] bg-blue-600 hover:bg-blue-500" 
                         onClick={() => applyAlignmentPreset(preset.crop, preset.transform)}>
                         Apply
                       </Button>
                     </div>
                     <div className="text-[9px] text-neutral-400 font-mono leading-tight flex justify-between">
                       <span>Crop: {preset.crop.t.toFixed(1)}, {preset.crop.r.toFixed(1)}, {preset.crop.b.toFixed(1)}, {preset.crop.l.toFixed(1)}</span>
                       <span>Scale: {preset.transform.scaleX.toFixed(2)}</span>
                     </div>
                  </div>
                ))}
             </div>
          </div>

          {/* 2. Aug View 列表 (滚动选择) - 【修改】：高度从 110px 增加到 150px */}
          <div className="p-3 border-b border-neutral-800 flex flex-col h-[140px] shrink-0">
             <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex justify-between">
               <span>Active Aug Views</span>
               <span className="text-blue-500">{completedViews.size} / {augViews.length}</span>
             </h2>
             <div className="overflow-y-auto pr-1 space-y-1 custom-scrollbar">
               {augViews.map((v, i) => {
                 const isActive = v.id === activeAugId;
                 const isCompleted = completedViews.has(v.id);
                 return (
                   <button 
                     key={v.id}
                     onClick={() => setActiveAugId(v.id)}
                     className={`w-full flex items-center justify-between py-1.5 px-2 rounded-md text-[11px] transition-all border
                       ${isActive ? 'bg-neutral-800 border-neutral-600 shadow-sm text-white' : 'bg-transparent border-transparent hover:bg-neutral-800/50 text-neutral-400'}
                     `}
                   >
                     <span className="font-medium">Aug View {i + 1}</span>
                     {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                   </button>
                 );
               })}
             </div>
          </div>
          
{/* 3. 当前视图实时参数 (极致紧凑，尽量一次性显示) */}
          {/* 【修复1】：最外层加上 min-h-0 防止被内部内容强行撑开 */}
          <div className="flex-1 p-3 flex flex-col bg-neutral-950 overflow-hidden min-h-0">
            <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 shrink-0">Current Parameters</h2>
            
            {/* 【修复2】：加上 flex-1 min-h-0，让它成为一个受限的内部滚动区域！ */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar pb-1">
              
              {/* Crop 控制 */}
              <div className="space-y-1">
                <div className="text-[9px] text-neutral-600 font-bold">CROP (%)</div>
                {['t', 'b', 'l', 'r'].map(edge => (
                  <div key={edge} className="flex items-center gap-1.5">
                    <span className="w-3 text-[9px] uppercase text-neutral-500">{edge}</span>
                    <Slider 
                      min={0} max={100} step={0.1} 
                      value={[activeCrop[edge as 't'|'r'|'b'|'l']]} 
                      onValueChange={(v) => handleManualCropChange(edge as any, Array.isArray(v) ? v[0] : (v as number))} 
                      className="flex-1" 
                    />
                    <Input 
                      type="number" 
                      value={activeCrop[edge as 't'|'r'|'b'|'l']} 
                      onChange={(e) => handleManualCropChange(edge as any, parseFloat(e.target.value) || 0)} 
                      className="w-12 h-5 text-[9px] px-1 bg-neutral-900 border-neutral-700 font-mono focus-visible:ring-1" 
                    />
                  </div>
                ))}
              </div>

              {/* Scale 控制 */}
              <div className="space-y-1">
                <div className="text-[9px] text-neutral-600 font-bold">SCALE</div>
                {['scaleX', 'scaleY'].map(axis => (
                  <div key={axis} className="flex items-center gap-1.5">
                    <span className="w-3 text-[9px] uppercase text-neutral-500">{axis.replace('scale', '')}</span>
                    <Slider 
                      min={0.01} max={10} step={0.01} 
                      value={[tempTransformRef.current[axis as 'scaleX'|'scaleY']]} 
                      onValueChange={(v) => handleManualTransformChange(axis as any, Array.isArray(v) ? v[0] : (v as number))} 
                      className="flex-1" 
                    />
                    <Input 
                      type="number" step="0.01" 
                      value={tempTransformRef.current[axis as 'scaleX'|'scaleY']} 
                      onChange={(e) => handleManualTransformChange(axis as any, parseFloat(e.target.value) || 1)} 
                      className="w-14 h-5 text-[9px] px-1 bg-neutral-900 border-neutral-700 font-mono focus-visible:ring-1" 
                    />
                  </div>
                ))}
              </div>

              {/* Offset 控制 */}
              <div className="space-y-1">
                <div className="text-[9px] text-neutral-600 font-bold">OFFSET (px)</div>
                {['offsetX', 'offsetY'].map(axis => (
                  <div key={axis} className="flex items-center gap-1.5">
                    <span className="w-3 text-[9px] uppercase text-neutral-500">{axis.replace('offset', '')}</span>
                    <Slider 
                      min={-3000} max={3000} step={1} 
                      value={[tempTransformRef.current[axis as 'offsetX'|'offsetY']]} 
                      onValueChange={(v) => handleManualTransformChange(axis as any, Array.isArray(v) ? v[0] : (v as number))} 
                      className="flex-1" 
                    />
                    <Input 
                      type="number" step="1" 
                      value={tempTransformRef.current[axis as 'offsetX'|'offsetY']} 
                      onChange={(e) => handleManualTransformChange(axis as any, parseFloat(e.target.value) || 0)} 
                      className="w-14 h-5 text-[9px] px-1 bg-neutral-900 border-neutral-700 font-mono focus-visible:ring-1" 
                    />
                  </div>
                ))}
              </div>

            </div>

            {/* 【修复3】：加上 shrink-0，确保高级配准按钮死死地固定在底部，绝不被上面的滑块挤出屏幕 */}
            <div className="shrink-0 flex items-center gap-2 pt-2 mt-2 border-t border-neutral-800/50">
              <Button 
                variant="secondary" 
                className="flex-1 h-6 text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                onClick={() => alert("AI Auto Alignment feature is under development.\n\nThis will open a new workspace to automatically extract and match feature points using deep learning.")}
              >
                <Zap className="w-3 h-3 mr-1 text-amber-400" /> AI Auto Align
              </Button>
              <Button 
                variant="secondary" 
                className="flex-1 h-6 text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                onClick={() => alert("Control Point Registration (Georeferencing) is under development.\n\nThis will open a split-screen workspace for manual tie-point selection.")}
              >
                <MousePointer2 className="w-3 h-3 mr-1 text-blue-400" /> Tie Points
              </Button>
            </div>
          </div>

          {/* 4. 底部并排操作按钮 (更名且放置在同一行) */}
          <div className="p-3 border-t border-neutral-800 bg-neutral-900 shrink-0 flex items-center gap-2">
            <Button 
              className={`flex-1 h-8 text-[11px] px-2 ${completedViews.has(activeAugId) ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`} 
              onClick={handleSaveCurrentView}
            >
               View Checked
            </Button>

            <Button 
              className="flex-1 h-8 text-[11px] px-2 bg-white text-black hover:bg-neutral-200 font-bold" 
              onClick={proceedToExport}
              disabled={completedViews.size < augViews.length}
            >
               Views Checked
            </Button>
          </div>

        </div>
      </div>
      
      <style>{`
        .dashed-border {
            background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%233B82F6' stroke-width='4' stroke-dasharray='6%2c 12' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
            border: none;
        }
      `}</style>
    </div>
  );
}


export function SyncAnnotation() {
  const { 
    views, 
    folders,
    annotations, 
    addAnnotation, 
    viewport, 
    setViewport,
    currentStem,
    stems,
    setCurrentStem
  } = useStore();
  
  const [tool, setTool] = useState<'select' | 'bbox' | 'polygon'>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number, y: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [pendingAnnotation, setPendingAnnotation] = useState<any>(null);
  const [classLabel, setClassLabel] = useState('object');
  const [classText, setClassText] = useState('');

  // Grid layout calculation
  const gridCols = Math.ceil(Math.sqrt(Math.max(1, views.length)));
  const gridRows = Math.ceil(Math.max(1, views.length) / gridCols);

  // Filter annotations for current stem
  const currentAnnotations = annotations.filter(a => a.stem === currentStem);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? viewport.zoom * zoomFactor : viewport.zoom / zoomFactor;
    setViewport(newZoom, viewport.panX, viewport.panY);
  };

  const handleMouseDown = (e: React.MouseEvent, viewId: string) => {
    if (tool === 'select') return;
    if (popoverOpen) setPopoverOpen(false);

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

    const view = views.find(v => v.id === viewId);
    let mainX = x;
    let mainY = y;
    if (view && !view.isMain) {
      mainX = (x - view.transform.offsetX) / view.transform.scaleX;
      mainY = (y - view.transform.offsetY) / view.transform.scaleY;
    }

    if (tool === 'bbox') {
      setIsDrawing(true);
      setCurrentPoints([{ x: mainX, y: mainY }, { x: mainX, y: mainY }]);
    } else if (tool === 'polygon') {
      setCurrentPoints([...currentPoints, { x: mainX, y: mainY }]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent, viewId: string) => {
    if (!isDrawing || tool !== 'bbox') return;

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom;
    const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom;

    const view = views.find(v => v.id === viewId);
    let mainX = x;
    let mainY = y;
    if (view && !view.isMain) {
      mainX = (x - view.transform.offsetX) / view.transform.scaleX;
      mainY = (y - view.transform.offsetY) / view.transform.scaleY;
    }

    setCurrentPoints([currentPoints[0], { x: mainX, y: mainY }]);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (tool === 'bbox' && isDrawing) {
      setIsDrawing(false);
      if (currentPoints.length === 2) {
        setPendingAnnotation({
          type: 'bbox',
          points: currentPoints,
        });
        setPopoverPos({ x: e.clientX, y: e.clientY });
        setPopoverOpen(true);
      }
      setCurrentPoints([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && tool === 'polygon' && currentPoints.length > 2) {
      setPendingAnnotation({
        type: 'polygon',
        points: currentPoints,
      });
      // Approximate position for popover (last point)
      const lastPoint = currentPoints[currentPoints.length - 1];
      const screenX = (lastPoint.x * viewport.zoom) + viewport.panX;
      const screenY = (lastPoint.y * viewport.zoom) + viewport.panY;
      
      setPopoverPos({ x: screenX + 300, y: screenY + 100 }); // Rough estimate, ideally relative to container
      setPopoverOpen(true);
      setCurrentPoints([]);
    } else if (e.key === 'Escape') {
      setCurrentPoints([]);
      setIsDrawing(false);
      setPopoverOpen(false);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPoints, tool, viewport]);

  const savePendingAnnotation = () => {
    if (pendingAnnotation && currentStem) {
      addAnnotation({
        id: Math.random().toString(36).substr(2, 9),
        ...pendingAnnotation,
        label: classLabel,
        text: classText,
        stem: currentStem
      });
      setPopoverOpen(false);
      setPendingAnnotation(null);
      setClassText('');
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-neutral-900 text-white relative">
      {/* Left Toolbar */}
      <div className="w-16 border-r border-neutral-800 flex flex-col items-center py-4 space-y-4 bg-neutral-950 shrink-0">
        <Button 
          variant={tool === 'select' ? 'default' : 'ghost'} 
          size="icon" 
          onClick={() => setTool('select')}
          title="Select / Pan"
        >
          <MousePointer2 className="w-5 h-5" />
        </Button>
        <Button 
          variant={tool === 'bbox' ? 'default' : 'ghost'} 
          size="icon" 
          onClick={() => setTool('bbox')}
          title="Bounding Box"
        >
          <Square className="w-5 h-5" />
        </Button>
        <Button 
          variant={tool === 'polygon' ? 'default' : 'ghost'} 
          size="icon" 
          onClick={() => setTool('polygon')}
          title="Polygon (Press Enter to finish)"
        >
          <Hexagon className="w-5 h-5" />
        </Button>
        <div className="flex-grow" />
        <Button variant="ghost" size="icon" title="Save to Disk">
          <Save className="w-5 h-5" />
        </Button>
      </div>

      {/* Grid Workspace */}
      <div 
        className="flex-grow p-4 overflow-hidden relative"
        ref={containerRef}
        onWheel={handleWheel}
      >
        {views.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-lg">
            No views configured. Please go to Data Preload to set up your project.
          </div>
        ) : (
          <div 
            className="w-full h-full grid gap-4"
            style={{ 
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`
            }}
          >
            {views.map((view, index) => (
              <div key={view.id} className="relative border border-neutral-800 bg-black rounded-lg overflow-hidden">
                <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-black/70 text-xs rounded text-neutral-300">
                  {view.isMain ? 'Main View' : `Aug View ${index}`}
                </div>
                <CanvasView 
                  view={view} 
                  annotations={currentAnnotations}
                  currentPoints={currentPoints}
                  tool={tool}
                  onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, view.id)}
                  onMouseMove={(e: React.MouseEvent) => handleMouseMove(e, view.id)}
                  onMouseUp={handleMouseUp}
                />
              </div>
            ))}
          </div>
        )}

        {/* Floating Popover for Class Selection */}
        {popoverOpen && (
          <div 
            className="absolute z-50 bg-card text-card-foreground border shadow-lg rounded-lg p-4 w-64 space-y-4"
            style={{ left: Math.min(popoverPos.x, window.innerWidth - 300), top: Math.min(popoverPos.y, window.innerHeight - 200) }}
          >
            <h4 className="font-semibold text-sm">Annotation Details</h4>
            <div className="space-y-2">
              <Label className="text-xs">Class Label</Label>
              <Input 
                value={classLabel} 
                onChange={(e) => setClassLabel(e.target.value)} 
                placeholder="e.g. car, building"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Additional Text (Optional)</Label>
              <Input 
                value={classText} 
                onChange={(e) => setClassText(e.target.value)} 
                placeholder="Notes..."
                onKeyDown={(e) => e.key === 'Enter' && savePendingAnnotation()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPopoverOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={savePendingAnnotation}>Save</Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Right Panel: Project Meta, Labels, Scene Groups */}
      <div className="w-72 border-l border-neutral-800 bg-neutral-950 flex flex-col shrink-0">
        
        {/* Top: Project Meta */}
        <div className="p-4 border-b border-neutral-800 space-y-3">
          <h3 className="font-semibold text-sm text-neutral-300 flex items-center gap-2">
            <Database className="w-4 h-4" /> Project Meta
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <span className="block text-neutral-500 mb-1">Folders</span>
              <span className="font-mono text-neutral-200">{folders.length}</span>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <span className="block text-neutral-500 mb-1">Views</span>
              <span className="font-mono text-neutral-200">{views.length}</span>
            </div>
          </div>
        </div>

        {/* Middle: Label Info */}
        <div className="flex-grow flex flex-col border-b border-neutral-800 overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="font-semibold text-sm text-neutral-300 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Labels ({currentAnnotations.length})
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 space-y-2">
            {currentAnnotations.length === 0 ? (
              <div className="text-xs text-neutral-600 text-center py-4">No labels in this scene</div>
            ) : (
              currentAnnotations.map((ann, i) => (
                <div key={ann.id} className="p-2 bg-neutral-900 rounded border border-neutral-800 text-sm flex flex-col gap-1 hover:border-primary/50 cursor-pointer transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-neutral-200">{ann.label}</span>
                    <span className="text-[10px] text-neutral-500 uppercase bg-neutral-950 px-1.5 py-0.5 rounded">{ann.type}</span>
                  </div>
                  {ann.text && <span className="text-xs text-neutral-400 truncate">{ann.text}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom: Scene Group Stem List */}
        <div className="h-1/3 flex flex-col overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="font-semibold text-sm text-neutral-300 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Scene Groups
            </h3>
          </div>
          <div className="flex-grow overflow-y-auto p-2 space-y-1">
            {stems.length === 0 ? (
              <div className="text-xs text-neutral-600 text-center py-4">No scenes loaded</div>
            ) : (
              stems.map((stem) => (
                <button
                  key={stem}
                  onClick={() => setCurrentStem(stem)}
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    currentStem === stem 
                      ? 'bg-primary/20 text-primary border border-primary/30' 
                      : 'text-neutral-400 hover:bg-neutral-900 border border-transparent'
                  }`}
                >
                  <span className="font-mono">{stem}</span>
                </button>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// Sub-component to render individual canvas views
function CanvasView({ view, annotations, currentPoints, tool, onMouseDown, onMouseMove, onMouseUp }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport } = useStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match container
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply Viewport
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Apply View Transform (if Aug View)
    if (!view.isMain) {
      ctx.translate(view.transform.offsetX, view.transform.offsetY);
      ctx.scale(view.transform.scaleX, view.transform.scaleY);
    }

    // Draw Mock Image Data
    ctx.fillStyle = view.isMain ? '#333' : 'rgba(255,100,100,0.2)';
    ctx.fillRect(100, 100, 400, 400);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1 / viewport.zoom;
    ctx.strokeRect(100, 100, 400, 400);

    // Draw Annotations
    annotations.forEach((ann: Annotation) => {
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2 / viewport.zoom;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';

      if (ann.type === 'bbox' && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);
        
        // Draw label
        ctx.fillStyle = '#0f0';
        ctx.font = `${12 / viewport.zoom}px Arial`;
        ctx.fillText(ann.label, x, y - 4 / viewport.zoom);
      } else if (ann.type === 'polygon' && ann.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        
        // Draw label
        ctx.fillStyle = '#0f0';
        ctx.font = `${12 / viewport.zoom}px Arial`;
        ctx.fillText(ann.label, ann.points[0].x, ann.points[0].y - 4 / viewport.zoom);
      }
    });

    // Draw Current Drawing
    if (currentPoints.length > 0) {
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2 / viewport.zoom;
      
      if (tool === 'bbox' && currentPoints.length === 2) {
        const [p1, p2] = currentPoints;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
      } else if (tool === 'polygon') {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.stroke();
        
        // Draw points
        ctx.fillStyle = '#ff0';
        currentPoints.forEach((p: any) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 / viewport.zoom, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    ctx.restore();
  }, [viewport, view, annotations, currentPoints, tool]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}



export function DataFormatExchange() {
  const { annotations, views, folders } = useStore();

  const handleExportJSON = () => {
    const data = {
      projectMeta: {
        folders,
        views
      },
      annotations
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multianno_export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportYOLO = () => {
    // Mock YOLO export
    // YOLO format: <class> <x_center> <y_center> <width> <height>
    // Normalized by image width/height (assuming 400x400 for mock)
    const imgW = 400;
    const imgH = 400;
    
    let yoloText = '';
    annotations.forEach(ann => {
      if (ann.type === 'bbox' && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const xMin = Math.min(p1.x, p2.x);
        const yMin = Math.min(p1.y, p2.y);
        const xMax = Math.max(p1.x, p2.x);
        const yMax = Math.max(p1.y, p2.y);
        
        const w = xMax - xMin;
        const h = yMax - yMin;
        const xCenter = xMin + w / 2;
        const yCenter = yMin + h / 2;
        
        // Normalize
        const nx = xCenter / imgW;
        const ny = yCenter / imgH;
        const nw = w / imgW;
        const nh = h / imgH;
        
        yoloText += `0 ${nx.toFixed(6)} ${ny.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}\n`;
      }
    });

    const blob = new Blob([yoloText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'labels.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full space-y-6 p-6 overflow-y-auto max-w-4xl mx-auto">
      <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important: Main-Centric Export</AlertTitle>
        <AlertDescription>
          Export results are strictly based on the Main View coordinate system. 
          For multimodal training, you must use the mapping parameters in the JSON export to align other modalities.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              MultiAnno JSON
            </CardTitle>
            <CardDescription>
              Complete project state including metadata, view alignments, and raw annotation coordinates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportJSON} className="w-full">
              <Download className="w-4 h-4 mr-2" /> Export JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              YOLO Format
            </CardTitle>
            <CardDescription>
              Normalized bounding box coordinates for YOLO training. (Only exports BBox annotations).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportYOLO} variant="secondary" className="w-full">
              <Download className="w-4 h-4 mr-2" /> Export YOLO TXT
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              COCO Format
            </CardTitle>
            <CardDescription>
              Standard COCO JSON format for object detection and instance segmentation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled variant="outline" className="w-full">
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


