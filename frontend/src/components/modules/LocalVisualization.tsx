// src/components/Modules/LocalVisualization.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, MonitorPlay, Download, Layers, Database, Search, Info, Plus, Trash2, FolderOpen } from 'lucide-react';
import { requestVisPreview, requestVisExport, getFileContent, analyzeWorkspaceFolders} from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog'; 

interface ViewMeta {
  name: string;
  folder_path: string;
  suffix: string;
  bands: number[];
  render_type: string;
  transform: any;
}

export function LocalVisualization() {
  const { stems, projectMetaPath } = useStore() as any;
  const [sourceType, setSourceType] = useState<'project' | 'local'>('project');
  const [localPath, setLocalPath] = useState('');
  const [suffix, setSuffix] = useState('');
  const [scannedStems, setScannedStems] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [viewMetas, setViewMetas] = useState<ViewMeta[]>([]);
  const [isMetaLoaded, setIsMetaLoaded] = useState(false);
  const [metaExplorerOpen, setMetaExplorerOpen] = useState(false);
  const [currentProjectPath, setCurrentProjectPath] = useState(projectMetaPath || '');
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string, suffix: string }[]>([]);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);

  // 页面加载时，默认给一个空的输入行
  useEffect(() => {
    if (sourceType === 'local' && placeholders.length === 0) {
      setPlaceholders([{ id: crypto.randomUUID(), path: '', suffix: '' }]);
    }
  }, [sourceType]);

  const addPlaceholder = () => {
    setPlaceholders([...placeholders, { id: crypto.randomUUID(), path: '', suffix: '' }]);
  };

  const removePlaceholder = (id: string) => {
    if (placeholders.length <= 1) return; // 至少保留一行
    setPlaceholders(placeholders.filter(p => p.id !== id));
  };

  const updatePlaceholder = (id: string, field: 'path' | 'suffix', value: string) => {
    setPlaceholders(placeholders.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // 处理资源管理器返回
  // 🌟 修复：处理资源管理器返回，确保更新到正确的行
  const handleExplorerConfirm = (selectedPaths: string[]) => {
  if (activePlaceholderId && selectedPaths.length > 0) {
    const newPath = selectedPaths[0];
    
    setPlaceholders(prev => prev.map(p => 
      p.id === activePlaceholderId ? { ...p, path: newPath } : p
    ));
    
    // 🌟 额外同步：如果以后还要用 localPath，可以顺便同步一下
    setLocalPath(newPath);
  }
  setExplorerOpen(false);
  setActivePlaceholderId(null); 
};

    const getInitialDirectory = (fullPath: string) => {
    if (!fullPath) return '';
    // 兼容 Windows 和 Linux 的路径分隔符，去掉文件名部分
    const normalizedPath = fullPath.replace(/\\/g, '/');
    const lastIndex = normalizedPath.lastIndexOf('/');
    if (lastIndex > 0) {
        return fullPath.substring(0, lastIndex); // 返回父文件夹路径
    }
    return fullPath;
    };
  // --- 2. 可视化配置状态 ---
  const [config, setConfig] = useState({
    mode: 'merged', 
    layout: 'grid', 
    columns: 2,
    resolution: 'main_view', 
    showComparison: false,
    thickness: 2,
    alpha: 0.3
  });

  // --- 3. 预览图与交互状态 ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleMetaFileConfirm = (selectedPaths: string[]) => {
    if (selectedPaths.length > 0) {
        setCurrentProjectPath(selectedPaths[0]); // 取第一个选中的文件
    }
    setMetaExplorerOpen(false);
  };
  
  // 🌟 修正：解析 Meta 的函数
  const handleLoadMeta = async () => {
    if (!currentProjectPath) return alert("请输入项目文件路径！");
    setIsLoading(true);
    try {
      // 1. 获取后端返回的包裹对象: { content: "{\"projectName\": ...}" }
      const responseData = await getFileContent(currentProjectPath);
      
      if (!responseData || !responseData.content) {
        throw new Error("后端返回的数据格式异常，缺少 content 字段");
      }

      // 2. 提取真实的文件内容字符串，并解析为 JSON 对象
      const data = JSON.parse(responseData.content);

      // 3. 验证必备字段
      if (!data.views || !data.folders) {
        throw new Error("项目文件缺少 views 或 folders 字段");
      }

      // 4. 执行映射
      const mappedViews: ViewMeta[] = data.views.map((view: any) => {
        const matchedFolder = data.folders.find((f: any) => f.Id === view["folder id"]);
        return {
          name: view.id || "未命名视图",
          folder_path: matchedFolder ? matchedFolder.path : "路径未找到",
          suffix: matchedFolder ? (matchedFolder.suffix || "") : "",
          bands: view.bands || [],
          render_type: view.renderMode || "unknown",
          transform: view.transform || {}
        };
      });

      setViewMetas(mappedViews);
      setIsMetaLoaded(true);
    } catch (err: any) {
      console.error("Meta 解析错误:", err);
      // 优化了报错提示，把具体错误信息弹出来方便排查
      alert(`无法解析项目文件: ${err.message}`); 
    } finally {
      setIsLoading(false);
    }
  };
  // ==========================================

  // --- 4. 扫描数据源逻辑 ---
  const handleScan = async () => {
    if (sourceType === 'project' && !isMetaLoaded) {
      return alert("请先解析并确认项目配置！");
    }
    if (sourceType === 'local' && !localPath) {
      return alert("请选择本地文件夹路径！");
    }

    setIsScanning(true);
    setScannedStems([]);
    setPreviewUrl(null);

    try {
      if (sourceType === 'project') {
        // ==========================================
        // 🌟 核心修复：抛弃内存死缓存，执行真实的硬盘扫描！
        // ==========================================
        if (viewMetas.length === 0) {
          throw new Error("视图配置为空，无法扫描");
        }
        
        // 1. 从刚才解析好的 viewMetas 中提取所有文件夹的真实路径和后缀
        const payloadData = viewMetas.map(view => ({ 
          path: view.folder_path, 
          suffix: view.suffix || '' 
        }));

        // 2. 调用后端进行真实的物理扫描和求交集
        const result = await analyzeWorkspaceFolders(payloadData);
        
        if (!result.commonStems || result.commonStems.length === 0) {
          alert("项目中未扫描到合法数据！(请检查硬盘文件是否被删除)");
        } else {
          // 3. 拿到最新鲜、最准确的硬盘扫描结果
          setScannedStems(result.commonStems);
        }

      } else {
        // 🌟 快速可视化模式：构建带有后缀的 Payload
        const validPayload = placeholders
          .filter(p => p.path.trim() !== '') // 过滤掉空行
          .map(p => ({ 
            path: p.path.trim(), 
            suffix: p.suffix.trim() // 确保这里的 suffix 传给了后端
          }));

        if (validPayload.length === 0) {
          throw new Error("请至少添加一个有效的文件夹路径");
        }

        // 调用后端接口
        const result = await analyzeWorkspaceFolders(validPayload);
        
        if (!result.commonStems || result.commonStems.length === 0) {
          alert("未在该目录下扫描到符合条件的公共场景！请检查后缀匹配是否正确。");
        } else {
          setScannedStems(result.commonStems);
        }
      }
    } catch (err: any) {
      alert(`扫描出错: ${err.message || "后端接口调用失败"}`);
    } finally {
      setIsScanning(false);
    }
  };


  // --- 5. 触发预览 (依赖 scannedStems 和 config) ---
  useEffect(() => {
    if (scannedStems.length === 0) return;

    const timer = setTimeout(() => {
      fetchPreview(scannedStems[0]);
    }, 600); 
    
    return () => clearTimeout(timer);
  }, [config, scannedStems]);

  const fetchPreview = async (firstStem: string) => {
    setIsLoading(true);
    try {
      const payload = {
        source_type: sourceType,
        project_meta: sourceType === 'project' ? projectMetaPath : null,
        local_path: sourceType === 'local' ? localPath : null,
        suffix: suffix,
        preview_stem: firstStem, // 告诉后端只渲染这张图
        config: config
      };
      const blob = await requestVisPreview(payload);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error: any) {
      console.error("预览加载失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportAll = async () => {
    if (scannedStems.length === 0) return alert("请先扫描数据源！");
    const outputDir = prompt("请输入导出目标文件夹的绝对路径:", "");
    if (!outputDir) return;

    setIsExporting(true);
    try {
      // 导出逻辑 ...
      await new Promise(r => setTimeout(r, 2000)); // 模拟请求
      alert(`成功导出 ${scannedStems.length} 组可视化结果！`);
    } catch (error: any) {
      alert(`导出失败: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-neutral-50 dark:bg-neutral-950 w-full overflow-hidden">
      
      {/* 侧边栏：配置区 */}
      <div className="w-full lg:w-[360px] shrink-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col h-full">
        
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <h2 className="text-xl font-black flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
            <MonitorPlay className="text-indigo-500 w-5 h-5" /> 本地可视化引擎
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8">
          
          {/* 🌟 核心一：数据源扫描区 */}
          <section className="space-y-4">
            <Label className="text-[10px] font-black uppercase text-indigo-500 tracking-widest flex items-center gap-1">
              <Database className="w-3 h-3" /> 1. 数据来源与扫描
            </Label>
            
            {/* 🌟 修改：切换模式时，重置解析状态 isMetaLoaded */}
            <Select value={sourceType} onValueChange={(val: any) => { setSourceType(val); setScannedStems([]); setPreviewUrl(null); setIsMetaLoaded(false); }}>
              <SelectTrigger className="font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">📁 系统项目文件 (Project Meta)</SelectItem>
                <SelectItem value="local">🚀 快速本地模式 (加载单图文件夹)</SelectItem>
              </SelectContent>
            </Select>

            {/* ========================================== */}
            {/* 🌟 新增：项目模式下的配置解析与只读面板 */}
            {sourceType === 'project' && (
              <div className="space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/30 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold">Project Meta 路径：</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Input 
                        value={currentProjectPath} 
                        onChange={(e) => setCurrentProjectPath(e.target.value)} 
                        className="h-8 text-xs font-mono pr-8" 
                        placeholder="/path/to/project_meta.json"
                      />
                      {/* 在 Input 内部放置一个小的浏览按钮 */}
                      <button 
                        type="button" // 显式指定类型防止表单提交
                        onClick={() => setMetaExplorerOpen(true)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-indigo-500 transition-colors"
                        >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                    
                    <Button 
                      onClick={handleLoadMeta} 
                      disabled={isLoading} 
                      className="h-8 px-3 shrink-0 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "解析"}
                    </Button>
                  </div>
                </div>

                {isMetaLoaded && (
                  <div className="mt-2 space-y-2 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                    <Label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1">
                      ✓ 项目约束已锁定 (不可修改)
                    </Label>
                    <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                      {viewMetas.map((view, idx) => (
                        <div key={idx} className="p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-[10px] space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-neutral-700 dark:text-neutral-300">{view.name}</span>
                            <span className="text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 rounded">{view.render_type}</span>
                          </div>
                          <p className="truncate opacity-60 font-mono" title={view.folder_path}>{view.folder_path}</p>
                          <div className="flex gap-2">
                            <span className="text-indigo-500 font-medium bg-indigo-50 dark:bg-indigo-900/20 px-1 rounded">
                              Bands: {view.bands.join(', ')}
                            </span>
                            {view.suffix && (
                              <span className="text-amber-600 dark:text-amber-500 font-medium bg-amber-50 dark:bg-amber-900/20 px-1 rounded">
                                后缀: {view.suffix}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* ========================================== */}

           {sourceType === 'local' && (
                <div className="space-y-4 p-3 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                    {/* 🌟 按照你的要求修改的提示词 */}
                    <div className="flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded border border-amber-100 dark:border-amber-900/30">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                        <strong>快速可视化模式：</strong> 每个图像目录对应一个 View。图像必须为 <strong>3波段、Int8</strong> 格式。同一组 Scene Group 中所有图像的 Shape 应该保持一致，以避免错误可视化。
                    </p>
                    </div>

                    {/* 🌟 移植自 DataPreload: 动态文件夹列表 */}
                    <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">待绑定文件夹列表</Label>
                        <Button variant="ghost" size="sm" onClick={addPlaceholder} className="h-6 text-[10px] text-indigo-600 hover:text-indigo-700">
                        <Plus className="w-3 h-3 mr-1" /> 添加文件夹
                        </Button>
                    </div>

                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                        {placeholders.map((p) => (
                        <div key={p.id} className="flex gap-1.5 items-start">
                            <div className="flex-1 space-y-1">
                            <div className="relative">
                                <Input
                                value={p.path}
                                onChange={(e) => updatePlaceholder(p.id, 'path', e.target.value)}
                                className="h-8 text-[11px] pr-8 bg-white dark:bg-neutral-900"
                                placeholder="文件夹路径..."
                                />
                                <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-indigo-500"
                                onClick={() => { setActivePlaceholderId(p.id); setExplorerOpen(true); }}
                                >
                                <FolderOpen size={14} />
                                </button>
                            </div>
                            </div>
                            <div className="w-24">
                            <Input
                                value={p.suffix}
                                onChange={(e) => updatePlaceholder(p.id, 'suffix', e.target.value)}
                                className="h-8 text-[11px] font-mono bg-white dark:bg-neutral-900"
                                placeholder="后缀(可选)"
                            />
                            </div>
                            <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-neutral-400 hover:text-red-500"
                            onClick={() => removePlaceholder(p.id)}
                            >
                            <Trash2 size={14} />
                            </Button>
                        </div>
                        ))}
                    </div>
                    </div>
                </div>
                )}

            {/* 🌟 修改：扫描按钮被独立出来，变成通用的底部大按钮 */}
            <div className="pt-2">
              <Button 
                onClick={handleScan} 
                disabled={isScanning || (sourceType === 'project' && !isMetaLoaded)} 
                className="w-full h-9 bg-neutral-800 hover:bg-neutral-900 text-white font-bold shadow-md"
              >
                {isScanning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                {sourceType === 'project' ? '扫描项目场景' : '扫描本地场景'}
              </Button>
            </div>

            {/* 扫描结果指示器 */}
            {scannedStems.length > 0 && (
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded">
                <span>扫描就绪：共解析到 {scannedStems.length} 组场景</span>
              </div>
            )}
          </section>

          {/* 分割线 */}
          <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

          {/* 🌟 核心二：可视化渲染配置 (扫描后才可用) */}
          <section className={`space-y-6 transition-opacity ${scannedStems.length === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <Label className="text-[10px] font-black uppercase text-indigo-500 tracking-widest flex items-center gap-1">
              <Layers className="w-3 h-3" /> 2. 渲染策略配置
            </Label>

            {/* 这里保留之前的配置：Mode, Layout, Resolution, Slider, Switch ... (为了代码简洁省略了前面写过的 UI) */}
            <div className="space-y-3">
              <Label className="text-[11px] font-bold">排版模式</Label>
              <Select value={config.mode} onValueChange={(val) => setConfig({ ...config, mode: val })}>
                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merged">🖼️ 合并大图 (每组1个文件)</SelectItem>
                  <SelectItem value="separate">📄 独立文件 (每组N个文件)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 假设之前的线条粗细、透明度等滑块代码在这里... */}

          </section>
        </div>

        {/* 底部执行按钮 */}
        <div className="p-5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
          <Button 
            size="lg" 
            disabled={isExporting || scannedStems.length === 0}
            className="w-full font-black shadow-xl shadow-indigo-500/20 bg-indigo-600 hover:bg-indigo-700 text-white" 
            onClick={handleExportAll}
          >
            {isExporting ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> 正在导出...</>
            ) : (
              <><Download className="w-5 h-5 mr-2" /> 启动批量导出任务</>
            )}
          </Button>
        </div>
      </div>

      {/* 主视图：预览区 */}
      <div className="flex-1 relative bg-neutral-200/50 dark:bg-black/50 p-8 flex flex-col items-center justify-center overflow-auto pattern-checkerboard">
        {/* 状态提示... */}
        {scannedStems.length > 0 && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
            <div className="px-4 py-1.5 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-mono shadow-lg border border-white/10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Preview: {scannedStems[0]}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
            <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300">正在生成渲染流...</p>
          </div>
        )}

        {previewUrl ? (
          <img 
            src={previewUrl} 
            className="max-w-full max-h-full object-contain shadow-2xl rounded-sm ring-1 ring-white/10" 
            style={{ opacity: isLoading ? 0.3 : 1 }}
            alt="Vis Preview" 
          />
        ) : (
          <div className="text-neutral-400 dark:text-neutral-600 flex flex-col items-center gap-4">
            <MonitorPlay className="w-16 h-16 opacity-20" />
            <p className="text-sm font-medium">请先完成左侧数据源扫描</p>
          </div>
        )}
      </div>
      {/* 1. 用于选择 project_meta.json 的文件浏览器 */}
        <FileExplorerDialog 
        open={metaExplorerOpen}
        // 🌟 核心修复：这里不再直接传文件路径，而是传父目录路径
        initialPath={getInitialDirectory(currentProjectPath || projectMetaPath || '')}
        onClose={() => setMetaExplorerOpen(false)}
        onConfirm={handleMetaFileConfirm}
        selectType="file" 
        />

        {/* 2. 用于快速模式选择图像目录的文件夹浏览器 */}
        <FileExplorerDialog 
        open={explorerOpen}
        // 建议：这里 initialPath 也可以动态获取当前选中行的路径
        initialPath={activePlaceholderId ? placeholders.find(p => p.id === activePlaceholderId)?.path || '' : localPath}
        onClose={() => { setExplorerOpen(false); setActivePlaceholderId(null); }}
        // 🌟 核心修复：这里必须指向 handleExplorerConfirm
        onConfirm={handleExplorerConfirm} 
        selectType="dir"
        />
    </div>
  );
}