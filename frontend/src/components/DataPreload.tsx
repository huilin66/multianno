import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { COLOR_MAPS, BAND_COLORS, BAND_BASE_STYLE, BAND_UNSELECTED_STYLE } from '../config/colors';
import type { ProjectMetaContract } from '../config/contract';

import { 
  FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2, History
} from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog'; 
import { Alert, AlertDescription } from './ui/alert';

export function DataPreload() {
  const {projectName, folders, views, addFolder, removeFolder, clearFolders, addView, removeView, updateView, clearViews, setActiveModule } = useStore();
  
  // --- 占位符与资源管理器状态 ---
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string, suffix: string }[]>([]);
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


  // --- 占位符操作逻辑 ---
  const handleAddPlaceholder = () => {
    setPlaceholders([...placeholders, { id: Math.random().toString(36).substr(2, 9), path: '', suffix: '' }]);
  };
  const handleAddFromHistory = (path: string) => {
    setPlaceholders(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), path, suffix: '' }]);
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

  const cancelFolders = () => {
      if (window.confirm("Are you sure you want to cancel all pending folders? (确定要取消所有未确认的路径吗？)")) {
        setPlaceholders([]);
        clearFolders();
        clearViews();
      }
    };
  const handleResetViews = () => {
      if (window.confirm("Are you sure you want to reset all View configurations? (确定要清空所有视图配置吗？)")) {
        clearViews();
      }
    };
  // --- 确认并上传给后端分析 ---
  const confirmFolders = async () => {
    const validPlaceholders = placeholders.filter(p => p.path.trim() !== "");
    if (validPlaceholders.length === 0) return;
    
    setIsConfirming(true);
    
    try {
      // 🚀 删除了 getFullPath，直接使用用户输入或选择的绝对路径
      const payloadData = validPlaceholders.map(p => ({
        path: p.path.trim(),
        suffix: p.suffix.trim()
      }));

      const response = await fetch('http://localhost:8080/api/project/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders: payloadData }), // 注意这里改成了 folders 数组
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
        // 🌟 修改 1：从新的 payloadData 中提取 path
        const originalPath = payloadData[index].path; 
        const originalSuffix = payloadData[index].suffix;
        
        addFolder({
          id: `folder-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
          path: folderMeta.folderPath || originalPath, 
          suffix: originalSuffix,
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
      
      // 🌟 修改 2：用 map 提取出所有的 path 字符串，传给历史记录保存函数
      savePathsToHistory(payloadData.map(p => p.path));
      
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
// 🌟 新增：处理 View Confirm 的分发逻辑
  const handleConfirmViews = async () => {
    if (views.length === 0) return;

    // 情况 A：多个视图，进入配准阶段
    if (views.length > 1) {
      if (window.confirm("确定要以当前的视图配置进入 View Extent Check (多图配准) 阶段吗？\n(Are you sure you want to proceed to the View Extent Check stage with the current settings?)")) {
        setActiveModule('extent');
      }
      return;
    }

    // 情况 B：只有 1 个视图，跳过配准，直接生成 Meta 并进入标注
    if (views.length === 1) {
      if (!window.confirm("当前只配置了 1 个视图。确定要以此配置直接开始标注吗？\n(这将会跳过配准阶段，直接保存项目配置并进入工作区)")) {
        return;
      }

      // 1. 生成项目元数据 (与 ViewExtentCheck 中保持一致)
      const projectMeta: ProjectMetaContract = {
        projectName: projectName || "Untitled Project",
        folders: folders.map((f, i) => ({
          Id: i + 1,
          path: f.path,
          suffix: f.suffix || "",
          "files in sceneGroups": f.metadata?.sceneGroupsLoaded || 0,
          "files Skipped": f.metadata?.sceneGroupsSkipped || 0,
          "files total": f.files ? f.files.length : 0,
          "image meta": {
            width: f.metadata?.width || 'Unknown',
            height: f.metadata?.height || 'Unknown',
            bands: f.metadata?.bands || 'Unknown',
            "data type": f.metadata?.fileType || 'uint8'
          }
        })),
        views: views.map((v, i) => {
          const fIndex = folders.findIndex(f => f.id === v.folderId);
          const currentRenderMode = v.bands.length === 3 
            ? 'rgb' 
            : (v.colormap || 'gray');
          return {
            id: v.isMain ? 'main view' : `aug view ${i}`, 
            "folder id": fIndex >= 0 ? fIndex + 1 : 'Unknown',
            bands: v.bands,
            // 🌟 核心新增：只有当波段数为 1 时，才把 colormap 写入配置
            renderMode: currentRenderMode,
            isMain: v.isMain,
            // 单视图默认没有偏移和缩放
            transform: {
              crop: v.crop || { t: 0, r: 100, b: 100, l: 0 },
              scaleX: v.transform?.scaleX ?? 1,
              scaleY: v.transform?.scaleY ?? (v.transform?.scaleX ?? 1),
              offsetX: v.transform?.offsetX ?? 0,
              offsetY: v.transform?.offsetY ?? 0
            }
          };
        })
      };

      const jsonStr = JSON.stringify(projectMeta, null, 2);

      // 2. 触发下载
      try {
        if ('showSaveFilePicker' in window) {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: 'project_meta.json',
            types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
        } else {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'project_meta.json';
          a.click();
          URL.revokeObjectURL(url);
        }
        
        // 3. 成功反馈并跳转
        alert("✅ 导出成功！\n\nproject_meta.json 已保存到本地。\n即将为您进入标注工作区...");
        setActiveModule('workspace'); 
        
      } catch (err) {
        console.warn("Save cancelled or failed", err);
        if (window.confirm("导出已取消或失败。是否仍要强制进入标注工作区？")) {
           setActiveModule('workspace');
        }
      }
    }
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
            // {/* 🌟 边框改为 border-border */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 rounded-lg border border-border border-dashed mb-4">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <History className="w-3 h-3"/> Recent:
                </span>
                {recentPaths.map((path) => (
                  <button
                    key={path}
                    onClick={() => handleAddFromHistory(path)}
                    // {/* 🌟 使用 secondary 语义，日间是柔和的浅灰，夜间是深灰 */}
                    className="text-[10px] bg-secondary hover:bg-secondary/80 text-secondary-foreground px-2 py-1 rounded border border-border transition-colors truncate max-w-[200px]"
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
                      {folder.suffix && (
                        <span className="text-amber-500 font-mono font-bold bg-amber-500/10 px-1.5 rounded">
                          Suffix: {folder.suffix}
                        </span>
                      )}
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
                {/* 🌟 新增：后缀规则输入框 */}
                <div className="w-24 shrink-0">
                  <Input 
                    value={item.suffix} 
                    onChange={(e) => setPlaceholders(placeholders.map(p => p.id === item.id ? { ...p, suffix: e.target.value } : p))}
                    placeholder="Suffix (e.g. _T)"
                    className="font-mono text-xs bg-background h-8"
                    title="Optional: String to ignore at the end of filenames for alignment"
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
            <Button 
              onClick={cancelFolders} 
              variant="outline" 
              disabled={(placeholders.length === 0 && folders.length === 0) || isConfirming}
            >
              <X className="w-4 h-4 mr-2" /> Cancel All
            </Button>
            {/* 🌟 强制追加 text-white */}
            <Button onClick={confirmFolders} variant="default" className="text-white" disabled={placeholders.length === 0 || isConfirming}>
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
                // {/* 🌟 1. 卡片底色改为 bg-card，边框改为 border-border */}
                <div key={view.id} className="flex flex-col p-4 border rounded-xl bg-card shadow-sm border-border">
                  
                  <div className="flex items-center gap-4">
                    {/* 🌟 2. 标签改为 bg-primary 和强制 text-white，副视图改为自适应颜色 */}
                    <span className={`px-3 py-1 text-xs font-bold rounded-full shrink-0 ${view.isMain ? 'bg-primary text-white shadow-md' : 'bg-background border border-border text-muted-foreground'}`}>
                      {view.isMain ? 'Main View' : `Aug View ${index}`}
                    </span>
                    {/* Source Folder 选择框 */}
                    <div className="flex-1 flex items-center gap-3">
                      <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider shrink-0">Source Folder</Label>
                      <Select 
                        value={view.folderId} 
                        onValueChange={(val) => {
                          const selectedFolder = folders.find(f => f.id === val);
                          const numBands = selectedFolder?.metadata?.bands || 3;
                          const newBands = numBands >= 3 ? [1, 2, 3] : [1];
                          updateView(view.id, { folderId: val, bands: newBands, colormap: 'gray' });
                        }}
                      >
                        {/* 强制白底和亮色边框 */}
                        <SelectTrigger className="h-8 bg-white border-neutral-200 text-neutral-900 text-xs font-medium shadow-sm flex-1">
                          <SelectValue placeholder="Select folder...">
                            {view.folderId ? folders.find(f => f.id === view.folderId)?.path : "Select folder..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-white border-neutral-200">
                          {folders.map(f => (
                            <SelectItem key={f.id} value={f.id} className="text-xs text-neutral-800 focus:bg-neutral-100">{f.path}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 删除按钮 */}
                    <Button variant="ghost" size="icon" className="text-neutral-500 dark:text-neutral-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 shrink-0" onClick={() => removeView(view.id)} disabled={view.isMain && views.length > 1} >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {/* 🌟 第二层：内部配置面板 (白底，左右两栏并排) */}
{/* 🌟 第二层：内部配置面板 (白底，左右两栏并排) */}
                  {view.folderId && (() => {
                    // 统一获取当前选中的 folder 数据，避免下面重复写 find
                    const selectedFolder = folders.find(f => f.id === view.folderId);
                    const totalBands = selectedFolder?.metadata?.bands || 0;
                    
                    // 判断是否为非 uint8 数据 (如 uint16, float32 等)
                    const isNotUint8 = selectedFolder?.metadata?.fileType && 
                                       !selectedFolder.metadata.fileType.toLowerCase().includes('uint8');

                    return (
                      // <div className="mt-4 p-4 bg-white border border-neutral-200 rounded-lg shadow-sm flex flex-col gap-4">
                      <div className="mt-4 p-4 bg-background border border-border rounded-lg shadow-sm flex flex-col gap-4">
                        {/* 🌟 新增：非 uint8 数据的动态拉伸提示 */}
                        {isNotUint8 && (
                          // 🌟 1. 加上 [&>svg]:translate-y-0 强制取消底层的图标下沉，并加上 [&>svg]:mt-[1px] 手动完美对齐第一行
                          <Alert variant="warning" className="py-2 px-3 animate-in fade-in [&>svg]:translate-y-0 [&>svg]:mt-[1px]">
                            {/* 🌟 2. 缩小图标尺寸 (w-3.5 h-3.5)，使其和 10px 的文字比例更协调 */}
                            <Info className="w-3.5 h-3.5" />
                            {/* 🌟 3. 加上 leading-relaxed，让拥挤的多行小字呼吸感更好 */}
                            <AlertDescription className="text-[10px] leading-relaxed">
                              <strong>Data Stretch Applied:</strong> Original source is <code className="bg-black/5 dark:bg-white/10 px-1 rounded font-mono">{selectedFolder.metadata.fileType}</code>. The display preview has been auto-scaled to 8-bit for visualization.
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="grid grid-cols-2 gap-6 items-center">
                          
                          {/* 左栏：Select Channels (彩色方块) */}
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider block">
                              Select Channels (Click 1 or 3)
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => {
                                const isSelected = view.bands.includes(b);
                                
                                // 🌟 核心修改：极其清爽的判断逻辑，完全依赖于外部引入的配置
                                const selectedStyle = isSelected 
                                  ? (BAND_COLORS[(b - 1) % BAND_COLORS.length] + " border-2") 
                                  : BAND_UNSELECTED_STYLE;
                                
                                return (
                                  <button 
                                    key={b} 
                                    onClick={() => {
                                      let active = [...view.bands];
                                      if (active.includes(b)) active = active.filter(band => band !== b);
                                      else active.push(b);
                                      updateView(view.id, { bands: active });
                                    }} 
                                    className={`${BAND_BASE_STYLE} ${selectedStyle}`}
                                  >
                                    {b}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 右栏：动态参数配置区 (Channel Mapping 下拉框) */}
                          <div className="border-l border-neutral-100 pl-6 h-full flex flex-col justify-center">
                            {view.bands.length === 1 ? (
                              // 模式 A：单波段模式
// 🌟 模式 A：单波段模式 (带可视化色带)
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                              <div className="space-y-1">
                                <Label className="text-xs text-neutral-600">Display Band</Label>
                                <Select value={view.bands[0].toString()} onValueChange={(val) => updateView(view.id, { bands: [parseInt(val)] })}>
                                  <SelectTrigger className="h-8 bg-neutral-50 border-neutral-200 text-neutral-900 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white border-neutral-200">
                                    {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => (
                                      <SelectItem key={b} value={b.toString()} className="text-xs text-neutral-800 focus:bg-neutral-100">Band {b}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-amber-600 font-medium">Color Map</Label>
                                <Select value={view.colormap || 'gray'} onValueChange={(val: any) => updateView(view.id, { colormap: val })}>
                                  <SelectTrigger className="h-8 bg-neutral-50 border-neutral-200 text-neutral-900 text-xs">
                                    
                                    {/* 🌟 核心修复：强制自定义 SelectValue，确保闭合状态下色带也能完美显示 */}
                                    <SelectValue>
                                      {(() => {
                                        const currentMap = COLOR_MAPS.find(cm => cm.name === (view.colormap || 'gray'));
                                        if (currentMap) {
                                          return (
                                            <div className="flex items-center gap-2">
                                              {/* 闭合时的迷你色带 */}
                                              <div 
                                                className="w-6 h-3 rounded-sm shadow-inner border border-neutral-300 shrink-0" 
                                                style={{ background: currentMap.gradient }}
                                              />
                                              <span className="capitalize font-medium">{currentMap.name}</span>
                                            </div>
                                          );
                                        }
                                        return "Select Colormap";
                                      })()}
                                    </SelectValue>
                                    
                                  </SelectTrigger>
                                  <SelectContent className="bg-white border-neutral-200">
                                    {COLOR_MAPS.map(cm => (
                                      <SelectItem key={cm.name} value={cm.name} className="text-xs text-neutral-800 focus:bg-neutral-100">
                                        <div className="flex items-center gap-2">
                                          {/* 展开列表时的长色带 */}
                                          <div 
                                            className="w-12 h-3.5 rounded-sm shadow-inner border border-neutral-300 shrink-0" 
                                            style={{ background: cm.gradient }}
                                          />
                                          <span className="capitalize font-medium">{cm.name}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            ) : view.bands.length === 3 ? (
                              // 模式 B：RGB 三波段模式
                            <div className="space-y-2 animate-in fade-in duration-200">
                              <Label className="text-xs text-neutral-600">RGB Channel Mapping</Label>
                              <div className="flex gap-2">
                                {['R', 'G', 'B'].map((channel, idx) => (
                                  <div key={channel} className="flex-1">
                                    <Select 
                                      value={view.bands[idx]?.toString()} 
                                      onValueChange={(val) => {
                                        const newBands = [...view.bands]; 
                                        newBands[idx] = parseInt(val);
                                        updateView(view.id, { bands: newBands });
                                      }}
                                    >
                                      <SelectTrigger className={`h-8 w-full bg-neutral-50 border-neutral-200 text-neutral-900 text-xs focus:ring-1 ${channel==='R'?'focus:ring-red-500':channel==='G'?'focus:ring-green-500':'focus:ring-blue-500'}`}>
                                        <div className="flex items-center gap-1.5">
                                          {/* 🌟 核心修改：用粗体彩色字母明确标示 R/G/B，并加一条浅色竖线分隔 */}
                                          <span className={`font-black text-[11px] ${channel==='R'?'text-red-600':channel==='G'?'text-green-600':'text-blue-600'}`}>
                                            {channel}
                                          </span>
                                          <span className="text-neutral-300">|</span>
                                          <SelectValue />
                                        </div>
                                      </SelectTrigger>
                                      <SelectContent className="bg-white border-neutral-200">
                                        {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => (
                                          <SelectItem key={b} value={b.toString()} className="text-xs text-neutral-800 focus:bg-neutral-100">
                                            Band {b}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}
                              </div>
                            </div>
                            ) : (
                              // 模式 C：错误提示
                              // 🌟 加上 [&>svg]:translate-y-0 取消平移
                              <Alert variant="warning" className="flex items-center justify-center py-2 h-[56px] animate-in fade-in [&>svg]:translate-y-0">
                                {/* 图标也稍微改小一点点匹配 text-xs */}
                                <Info className="w-4 h-4 mr-2" />
                                <AlertDescription className="text-xs m-0 font-medium">
                                  Please select exactly 1 or 3 blocks.
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>
              ))
            )}
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">
              {views.length} view(s) configured
            </span>
            <Button onClick={handleResetViews} variant="outline" disabled={views.length === 0}>
              <X className="w-4 h-4 mr-2" /> Reset
            </Button>
            {/* 🌟 改用 variant="default" 并追加 text-white，去除硬编码的 blue */}
            <Button 
              onClick={handleConfirmViews} 
              disabled={views.length === 0} 
              variant="default"
              className="text-white font-medium"
            >
              <Check className="w-4 h-4 mr-2" /> 
              {views.length > 1 ? "Confirm & Map Extents" : "Confirm & Start Annotation"}
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