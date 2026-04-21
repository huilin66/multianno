// src/components/Modules/LocalVisualization.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, MonitorPlay, Download, Layers, Database, Search, Info, Plus, Trash2, FolderOpen, 
    Cpu, LayoutTemplate, FileText, RefreshCw, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { requestVisPreview, requestVisExportStream, getFileContent, analyzeWorkspaceFolders} from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog'; 
import { SUPPORTED_TASKS, FORMAT_DETAILS, TaskType } from '../../config/supportedFormats';

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
  const [scannedStems, setScannedStems] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [viewMetas, setViewMetas] = useState<ViewMeta[]>([]);
  const [isMetaLoaded, setIsMetaLoaded] = useState(false);
  const [metaExplorerOpen, setMetaExplorerOpen] = useState(false);
  const [currentProjectPath, setCurrentProjectPath] = useState(projectMetaPath || '');
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string, suffix: string }[]>([]);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);

  // 🌟 第二部分：真实标注 (Ground Truth) 状态
  const [enableAnno, setEnableAnno] = useState(false);
  const [annoTaskType, setAnnoTaskType] = useState<TaskType>('object_detection');
  const [annoFormat, setAnnoFormat] = useState('yolo');
  const [annoExtension, setAnnoExtension] = useState('.txt');
  const [annoSuffix, setAnnoSuffix] = useState('');
  const [annoPath, setAnnoPath] = useState('');
  const [annoClassFile, setAnnoClassFile] = useState('');
  const [annoScannedCount, setAnnoScannedCount] = useState<number | null>(null);
  const [isScanningAnno, setIsScanningAnno] = useState(false);

  // --- 3. 预览图与交互状态 ---
  // 🌟 核心修复 1：废弃单一的 previewUrl，使用对象存储多张 Base64 图
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // ==========================================
  // 🌟 第三部分：预测结果 (Predictions) 状态 (支持多组)
  const [enablePred, setEnablePred] = useState(false);
  const [predictions, setPredictions] = useState([{ 
    id: crypto.randomUUID(), 
    name: 'Model A', 
    taskType: 'object_detection' as TaskType,
    format: 'yolo', 
    extension: '.txt',
    path: '', 
    suffix: '', 
    classFile: '',
    scoreThreshold: 0.5,
    scannedCount: null as number | null,
    isScanning: false,
  }]);

  // 🌟 第四部分：保存与排版状态
  const [exportIndependent, setExportIndependent] = useState(true);
  const [exportMerged, setExportMerged] = useState(false);
  const [savePath, setSavePath] = useState('');
  const [exportLayout, setExportLayout] = useState('grid');
  const [exportRows, setExportRows] = useState(2);
  const [exportCols, setExportCols] = useState(2);
  const [mergedPreview, setMergedPreview] = useState<string | null>(null);

  // output
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // ==========================================
  // 🌟 统一的资源管理器调度核心
  // target: 告诉弹窗把选中的路径填给谁
  const [explorerConfig, setExplorerConfig] = useState<{
    open: boolean;
    type: 'dir' | 'file';
    target: 'meta' | 'local_dir' | 'anno_dir' | 'anno_class' | 'pred_dir' | 'pred_class';
    activeId?: string; // 用于标记是哪一行的 pred 或 local 占位符
    initialPath?: string;
  }>({ open: false, type: 'dir', target: 'meta' });
// 🌟 新增：扫描真实标注 (GT) 与图像的匹配情况
  const handleScanAnno = async () => {
    if (!annoPath) return alert("请先指定标注路径！");
    if (scannedStems.length === 0) return alert("请先完成第一部分的图像数据扫描！");
    
    setIsScanningAnno(true);
    try {
      // 针对 COCO 这种单文件格式，前端可以直接跳过目录扫描验证，或者调用专门的解析接口
      if (annoFormat === 'coco') {
        setAnnoScannedCount(scannedStems.length); // 暂时假设 COCO 全匹配
        fetchPreview();
        return;
      }

      // 复用后端的 analyzeWorkspaceFolders 来扫目录
      const result = await analyzeWorkspaceFolders([{ path: annoPath, suffix: annoSuffix }]);
      if (result.commonStems) {
        // 求交集：计算有多少个图像 Stem 在标注文件夹中也找到了对应的文件
        const matched = result.commonStems.filter((stem: string) => scannedStems.includes(stem));
        setAnnoScannedCount(matched.length);

        if (matched.length > 0) {
          fetchPreview();
        }
      }
    } catch (error) {
      alert("标注目录扫描失败，请检查路径。");
    } finally {
      setIsScanningAnno(false);
    }
  };

  // 🌟 新增：扫描单组预测结果 (Pred) 与图像的匹配情况
  const handleScanPred = async (predId: string) => {
    const pred = predictions.find(p => p.id === predId);
    if (!pred || !pred.path) return alert("请先指定预测结果路径！");
    if (scannedStems.length === 0) return alert("请先完成第一部分的图像数据扫描！");

    setPredictions(prev => prev.map(p => p.id === predId ? { ...p, isScanning: true } : p));
    try {
      if (pred.format === 'coco') {
        setPredictions(prev => prev.map(p => p.id === predId ? { ...p, scannedCount: scannedStems.length } : p));
        fetchPreview();
        return;
      }

      const result = await analyzeWorkspaceFolders([{ path: pred.path, suffix: pred.suffix }]);
      if (result.commonStems) {
        const matched = result.commonStems.filter((stem: string) => scannedStems.includes(stem));
        setPredictions(prev => prev.map(p => p.id === predId ? { ...p, scannedCount: matched.length } : p));

        if (matched.length > 0) {
          fetchPreview();
        }
      }
    } catch (error) {
      alert("预测目录扫描失败，请检查路径。");
    } finally {
      setPredictions(prev => prev.map(p => p.id === predId ? { ...p, isScanning: false } : p));
    }
  };
  // 统一的 Explorer 确认处理函数
  const handleUniversalExplorerConfirm = (paths: string[]) => {
    if (paths.length === 0) return;
    const selectedPath = paths[0];
    const { target, activeId } = explorerConfig;

    if (target === 'meta') setCurrentProjectPath(selectedPath);
    else if (target === 'local_dir' && activeId) {
      setPlaceholders(prev => prev.map(p => p.id === activeId ? { ...p, path: selectedPath } : p));
    }
    else if (target === 'anno_dir') setAnnoPath(selectedPath);
    else if (target === 'anno_class') setAnnoClassFile(selectedPath);
    else if (target === 'pred_dir' && activeId) {
      setPredictions(prev => prev.map(p => p.id === activeId ? { ...p, path: selectedPath } : p));
    }
    else if (target === 'pred_class' && activeId) {
      setPredictions(prev => prev.map(p => p.id === activeId ? { ...p, classFile: selectedPath } : p));
    }
    else if (target === 'save_dir') {
      setSavePath(selectedPath);
    }
    setExplorerConfig(prev => ({ ...prev, open: false }));
  };

  useEffect(() => {
    const formats = SUPPORTED_TASKS[annoTaskType]?.formats;
    if (formats && !formats.includes(annoFormat)) {
      setAnnoFormat(formats[0]);
    }
  }, [annoTaskType]);

  useEffect(() => {
    const detail = FORMAT_DETAILS[annoFormat];
    if (detail && !detail.extensions.includes(annoExtension)) {
      setAnnoExtension(detail.defaultExtension);
    }
  }, [annoFormat]);
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
    if (sourceType === 'local' && placeholders.filter(p => p.path.trim() !== '').length === 0) {
    return alert("请至少添加一个有效的本地图像文件夹路径！");
  }

    setIsScanning(true);
    setScannedStems([]);
    setPreviewImages({});

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

  // 🌟 修复：移除所有配置相关的依赖，禁止输入时自动狂刷
  useEffect(() => {
    if (scannedStems.length > 0) {
      fetchPreview();
    }
  }, [currentIndex, scannedStems]);

  const fetchPreview = async () => {
    if (scannedStems.length === 0) return;
    setIsLoading(true);
    try {
      const currentStem = scannedStems[currentIndex];
      const taskApiMap: Record<string, string> = {
        object_detection: 'bbox',
        instance_segmentation: 'instance_seg',
        semantic_segmentation: 'semantic_seg'
      };
      const payload = {
        source_type: sourceType,
        stem: currentStem,
        render_settings: config,
        view_configs: sourceType === 'project' ? viewMetas : null,
        local_configs: sourceType === 'local' ? placeholders.filter(p => p.path) : null,
        anno_config: enableAnno ? {
          task_type: taskApiMap[annoTaskType], 
          format: annoFormat,
          suffix: annoFormat === 'image' ? `${annoSuffix}${annoExtension}` : annoSuffix,
          folder_path: annoPath,
          class_file: annoClassFile
        } : null,
        pred_configs: enablePred ? predictions.filter(p => p.path).map(p => ({
          ...p,
          taskType: taskApiMap[p.taskType], // 🌟 这里映射
          suffix: p.format === 'image' ? `${p.suffix}${p.extension}` : p.suffix
        })) : null
      };

      const res = await requestVisPreview(payload);
      
      // 🌟 核心修复 3：直接读取 JSON 中的 images 字典并设置到状态中
      if (res && res.preview_images) {
        setPreviewImages(res.preview_images);
      }
    } catch (error: any) {
      console.error("预览加载失败:", error);
    } finally {
      setIsLoading(false);
    }
  };
  // 计算当前预览的总图层数 (用于初始化网格)
  const activeViewCount = sourceType === 'project' 
    ? viewMetas.length 
    : placeholders.filter(p => p.path).length;
  const totalLayers = activeViewCount + 
    (enableAnno ? (annoFormat === 'image' ? 1 : activeViewCount) : 0) + 
    (enablePred ? predictions.filter(p => p.path).reduce((acc, pred) => {
      // 如果是语义分割，后端通常只在 Base 上叠一张或者出一张 Mask，算 1
      // 如果是 YOLO/BBox，后端会为每个 View 出一张结果图，算 n
      return acc + (pred.taskType === 'semantic_segmentation' ? 1 : activeViewCount);
    }, 0) : 0);

  // 🌟 自动布局联动逻辑
  useEffect(() => {
    if (exportLayout === 'horizontal') {
      setExportRows(1);
      setExportCols(totalLayers);
    } else if (exportLayout === 'vertical') {
      setExportRows(totalLayers);
      setExportCols(1);
    } else if (exportLayout === 'grid') {
      // 初始网格：尽量接近正方形
      const c = Math.ceil(Math.sqrt(totalLayers));
      const r = Math.ceil(totalLayers / c);
      setExportCols(c);
      setExportRows(r);
    }
  }, [exportLayout, totalLayers]);

  const handleApplyLayout = async () => {
    // 如果没选合并保存，仅仅是普通刷新
    if (!exportMerged) {
        fetchPreview();
        return;
    }
    if (scannedStems.length === 0) return;
    setIsLoading(true);
    try {
      const taskApiMap: Record<string, string> = {
        object_detection: 'bbox',
        instance_segmentation: 'instance_seg',
        semantic_segmentation: 'semantic_seg'
      };

      const payload = {
        source_type: sourceType,
        stem: scannedStems[currentIndex],
        render_settings: config,
        view_configs: sourceType === 'project' ? viewMetas : null,
        local_configs: sourceType === 'local' ? placeholders.filter(p => p.path) : null,
        // 🌟 关键：告诉后端，我们需要一个预览版的合并图
        export_config: {
            preview_only: true, // 标识这只是预览，不写磁盘
            modes: { independent: exportIndependent, merged: exportMerged },
            layout_settings: { 
              layout: exportLayout, 
              rows: exportRows, 
              cols: exportCols 
            }
        },
        anno_config: enableAnno ? {
          task_type: taskApiMap[annoTaskType],
          format: annoFormat,
          suffix: (annoFormat === 'image') ? `${annoSuffix}${annoExtension}` : annoSuffix,
          folder_path: annoPath,
          class_file: annoClassFile
        } : null,
        pred_configs: enablePred ? predictions.filter(p => p.path).map(p => ({
          ...p,
          taskType: taskApiMap[p.taskType],
          suffix: (p.format === 'image') ? `${p.suffix}${p.extension}` : p.suffix
        })) : null
      };

      const res = await requestVisPreview(payload);
      if (res.preview_images) {
        // 分离普通图层和合并图层
        const { fused_result, ...others } = res.preview_images;
        setPreviewImages(others);
        setMergedPreview(fused_result || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleExportAll = async () => {
    if (!savePath) {
      alert("请先选择保存文件夹");
      return;
    }
    if (scannedStems.length === 0) {
      alert("没有可导出的数据");
      return;
    }
    setIsExporting(true);
    setExportProgress(1);

    try {
      const taskApiMap: Record<string, string> = {
        object_detection: 'bbox',
        instance_segmentation: 'instance_seg',
        semantic_segmentation: 'semantic_seg'
      };

      const payload = {
        source_type: sourceType,
        all_stems: scannedStems,
        render_settings: config,
        view_configs: sourceType === 'project' ? viewMetas : null,
        local_configs: sourceType === 'local' ? placeholders.filter(p => p.path) : null,
        anno_config: enableAnno ? {
          task_type: taskApiMap[annoTaskType], 
          format: annoFormat,
          suffix: annoFormat === 'image' ? `${annoSuffix}${annoExtension}` : annoSuffix,
          folder_path: annoPath,
          class_file: annoClassFile
        } : null,
        pred_configs: enablePred ? predictions.filter(p => p.path).map(p => ({
          ...p,
          taskType: taskApiMap[p.taskType], // 🌟 这里映射
          suffix: p.format === 'image' ? `${p.suffix}${p.extension}` : p.suffix
        })) : null,
        export_config: {
          preview_only: false,
          save_path: savePath,
          modes: {
            independent: exportIndependent,
            merged: exportMerged
          },
          layout_settings: {
            layout: exportLayout,
            rows: exportRows, 
            cols: exportCols
          }
        },
      };
      const res = await requestVisExportStream(payload, (percent) => {
        setExportProgress(percent);
      });
      if (res.success) {
        setExportProgress(100);
        alert(`批量导出成功！\n保存路径: ${savePath}\n处理总数: ${scannedStems.length}`);
      }
    } catch (err) {
      alert(`导出失败: ${err}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportProgress(null), 2000);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-neutral-50 dark:bg-neutral-950 w-full overflow-hidden">
      
      {/* 侧边栏：配置区 */}
      <div className="w-full lg:w-[300px] shrink-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col h-full shadow-2xl z-10">
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
          
          {/* 🌟 核心一：数据源扫描区 */}
          <section className="space-y-4">
            <Label className="text-[10px] font-black uppercase text-indigo-500 tracking-widest flex items-center gap-1">
              <Database className="w-3 h-3" /> 1. 数据源配置
            </Label>
            
            {/* 🌟 修改：切换模式时，重置解析状态 isMetaLoaded */}
            <Select 
              value={sourceType} 
              onValueChange={(val: any) => { 
                setSourceType(val); 
                setScannedStems([]); 
                setPreviewImages({}); // 🌟 修复：重置为空字典
                setIsMetaLoaded(false); 
              }}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs bg-white dark:bg-neutral-900">
                <SelectValue placeholder="选择数据来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project Meta</SelectItem>
                <SelectItem value="local">Local Folders</SelectItem>
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
          

          {/* ========================================================= */}
          {/* 🌟 2. 挂载真实标注 (Ground Truth) */}
          <section className={`space-y-3 transition-opacity ${scannedStems.length === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-500 tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> 2. 真实标注 (Ground Truth)
              </Label>
              <Switch checked={enableAnno} onCheckedChange={setEnableAnno} />
            </div>

            {enableAnno && (
              <div className="space-y-3 p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                {/* 统一的提示语块 */}
                <div className="flex items-start gap-2 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/30 p-2 rounded border border-emerald-200/50 dark:border-emerald-800/50">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <p className="leading-relaxed">
                    真实标注将作为基准(GT)展示。系统会自动将其与第一步已扫描的 <strong>{scannedStems.length}</strong> 个图像场景进行文件名对齐。
                  </p>
                </div>

                {/* 🌟 2栏4元素联动排版 */}
                {/* 🌟 优化排版：2栏4元素，改为上下堆叠结构防止拥挤，并接入全局配置 */}
                <div className="grid grid-cols-[1.5fr_1fr] gap-3 pt-1">
                  <div className="space-y-1.5 overflow-hidden">
                    <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">任务类型</Label>
                    <Select value={annoTaskType} onValueChange={(val: TaskType) => setAnnoTaskType(val)}>
                      {/* 🌟 加上 truncate，文字过长时显示省略号，绝不越界 */}
                      <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-neutral-900 truncate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SUPPORTED_TASKS).map(([id, t]) => (
                          <SelectItem key={id} value={id}>{t.label.split(' ')[0]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 overflow-hidden">
                    <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">标注格式</Label>
                    <Select value={annoFormat} onValueChange={setAnnoFormat}>
                      <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-neutral-900 truncate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_TASKS[annoTaskType as TaskType]?.formats.map(fId => (
                          <SelectItem key={fId} value={fId}>{FORMAT_DETAILS[fId].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">场景后缀</Label>
                    <Input value={annoSuffix} onChange={e => setAnnoSuffix(e.target.value)} className="h-8 text-xs font-mono bg-white dark:bg-neutral-900" placeholder="例如: _RGB" />
                  </div>

                  <div className="space-y-1.5 overflow-hidden">
                    <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">扩展名</Label>
                    <Select value={annoExtension} onValueChange={setAnnoExtension}>
                      <SelectTrigger className="h-8 text-xs font-mono bg-white dark:bg-neutral-900 truncate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMAT_DETAILS[annoFormat]?.extensions.map(ext => (
                          <SelectItem key={ext} value={ext}>{ext}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 选择标注路径：只保留这一个！ */}
                <div className="space-y-1.5 pt-2">
                  <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">选择标注路径</Label>
                  <div className="relative">
                    <Input value={annoPath} onChange={e => setAnnoPath(e.target.value)} className="h-8 text-xs pr-8 bg-white dark:bg-neutral-900" placeholder="选择路径..." />
                    <button onClick={() => setExplorerConfig({ open: true, type: annoFormat === 'coco' ? 'file' : 'dir', target: 'anno_dir', initialPath: annoPath })} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-emerald-500">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>

                {annoFormat === 'yolo' && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-[10px] font-bold text-amber-600 dark:text-amber-500">必需的 classes.txt</Label>
                    <div className="relative">
                      <Input value={annoClassFile} onChange={e => setAnnoClassFile(e.target.value)} className="h-8 text-xs pr-8 bg-white dark:bg-neutral-900 border-amber-200 dark:border-amber-900/50" placeholder="选择 classes.txt..." />
                      <button onClick={() => setExplorerConfig({ open: true, type: 'file', target: 'anno_class', initialPath: annoClassFile })} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-amber-500">
                        <FileText size={14} />
                      </button>
                    </div>
                  </div>
                )}


                {/* 统一的扫描结果显示与通栏按钮 */}
                <div className="pt-2 space-y-2">
                  {annoScannedCount !== null && (
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-neutral-900 border border-emerald-100 dark:border-emerald-900/50 rounded text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" /> 扫描完成
                      </span>
                      <span className={annoScannedCount === scannedStems.length ? 'text-emerald-600' : 'text-amber-600'}>
                        已对齐: {annoScannedCount} / {scannedStems.length} 场景
                      </span>
                    </div>
                  )}
                  <Button 
                    onClick={handleScanAnno} 
                    disabled={isScanningAnno || !annoPath} 
                    className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20"
                  >
                    {isScanningAnno ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    扫描并验证基准标注
                  </Button>
                </div>
              </div>
            )}
          </section>
          {/* ========================================================= */}

          <div className="h-px bg-neutral-100 dark:bg-neutral-800" />


          {/* ========================================================= */}
          {/* 🌟 3. 挂载预测结果 (Predictions - 支持多组) */}
          <section className={`space-y-3 transition-opacity ${scannedStems.length === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-500 tracking-widest flex items-center gap-1">
                <Cpu className="w-3 h-3" /> 3. 预测结果对比 (Predictions)
              </Label>
              <Switch checked={enablePred} onCheckedChange={setEnablePred} />
            </div>

            {enablePred && (
              <div className="space-y-3">
                {/* 统一的提示语块 */}
                <div className="flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 p-2 rounded border border-amber-200/50 dark:border-amber-800/50">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <p className="leading-relaxed">
                    支持挂载多组模型预测结果。未匹配到原图的预测文件将被自动忽略。
                  </p>
                </div>

                {predictions.map((pred, idx) => (
                  <div key={pred.id} className="p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-200/50 dark:border-amber-900/50 space-y-3 relative">
                    {/* 删除按钮 */}
                    {predictions.length > 1 && (
                      <button onClick={() => setPredictions(prev => prev.filter(p => p.id !== pred.id))} className="absolute right-2 top-2 text-neutral-400 hover:text-red-500 z-10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                    
                    {/* 🌟 调整 1：模型名称单独成行 (右侧留白防遮挡删除图标) */}
                    <div className="space-y-1.5 pr-6">
                      <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">模型名称</Label>
                      <Input value={pred.name} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, name: e.target.value } : p))} className="h-8 text-xs font-bold bg-white dark:bg-neutral-900" placeholder="如: YOLOv8_Epoch50" />
                    </div>

                    {/* 🌟 优化排版：统一的上下堆叠结构与配置联动 */}
                    {/* 🌟 优化排版：同样改为不对称网格 (1.5 : 1) */}
                    <div className="grid grid-cols-[1.5fr_1fr] gap-3 pt-1">
                      <div className="space-y-1.5 overflow-hidden">
                        <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">任务类型</Label>
                        <Select value={pred.taskType} onValueChange={(val: TaskType) => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, taskType: val } : p))}>
                          {/* 加上 truncate */}
                          <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-neutral-900 truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SUPPORTED_TASKS).map(([id, t]) => (
                              <SelectItem key={id} value={id}>{t.label.split(' ')[0]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5 overflow-hidden">
                        <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">结果格式</Label>
                        <Select value={pred.format} onValueChange={(val) => {
                          const defaultExt = FORMAT_DETAILS[val].defaultExtension;
                          setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, format: val, extension: defaultExt } : p));
                        }}>
                          <SelectTrigger className="h-8 text-xs font-medium bg-white dark:bg-neutral-900 truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_TASKS[pred.taskType as TaskType]?.formats.map(fId => (
                              <SelectItem key={fId} value={fId}>{FORMAT_DETAILS[fId].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">场景后缀</Label>
                        <Input value={pred.suffix} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, suffix: e.target.value } : p))} className="h-8 text-xs font-mono bg-white dark:bg-neutral-900" placeholder="_P" />
                      </div>

                      <div className="space-y-1.5 overflow-hidden">
                        <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">扩展名</Label>
                        <Select value={pred.extension} onValueChange={(val) => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, extension: val } : p))}>
                          <SelectTrigger className="h-8 text-xs font-mono bg-white dark:bg-neutral-900 truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FORMAT_DETAILS[pred.format]?.extensions.map(ext => (
                              <SelectItem key={ext} value={ext}>{ext}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* 选择标注路径：只保留这一个！ */}
                    <div className="space-y-1.5 pt-2">
                      <Label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">选择结果路径</Label>
                      <div className="relative">
                        <Input value={pred.path} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, path: e.target.value } : p))} className="h-8 text-xs pr-8 bg-white dark:bg-neutral-900" placeholder="选择路径..." />
                        <button onClick={() => setExplorerConfig({ open: true, type: pred.format === 'coco' ? 'file' : 'dir', target: 'pred_dir', activeId: pred.id, initialPath: pred.path })} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-amber-500">
                          <FolderOpen size={14} />
                        </button>
                      </div>
                    </div>

                    {/* 必需的 classes 文件 */}
                    {pred.format === 'yolo' && (
                       <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-amber-600 dark:text-amber-500">必需的 classes.txt</Label>
                        <div className="relative">
                          <Input value={pred.classFile} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, classFile: e.target.value } : p))} className="h-8 text-xs pr-8 bg-white dark:bg-neutral-900 border-amber-200 dark:border-amber-900/50" placeholder="预测结果的 classes.txt..." />
                          <button onClick={() => setExplorerConfig({ open: true, type: 'file', target: 'pred_class', activeId: pred.id, initialPath: pred.classFile })} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-amber-500">
                            <FileText size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 统一的扫描结果显示与通栏按钮 */}
                    <div className="pt-2 space-y-2">
                      {pred.scannedCount !== null && (
                        <div className="flex items-center justify-between p-2 bg-white dark:bg-neutral-900 border border-amber-200/50 dark:border-amber-900/50 rounded text-[10px] font-bold">
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                            <CheckCircle2 className="w-3 h-3" /> 验证完成
                          </span>
                          <span className={pred.scannedCount === scannedStems.length ? 'text-emerald-600' : 'text-amber-600'}>
                            已匹配: {pred.scannedCount} / {scannedStems.length} 场景
                          </span>
                        </div>
                      )}
                      <Button 
                        onClick={() => handleScanPred(pred.id)} 
                        disabled={pred.isScanning || !pred.path} 
                        className="w-full h-9 bg-neutral-800 hover:bg-neutral-900 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-bold shadow-md"
                      >
                        {pred.isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                        扫描验证 {pred.name || `模型 ${idx + 1}`}
                      </Button>
                    </div>
                  </div>
                ))}

                {/* 增加模型按钮 */}
                <Button variant="outline" onClick={() => setPredictions([...predictions, { id: crypto.randomUUID(), name: `Model ${predictions.length + 1}`, taskType: 'bbox', format: 'yolo', path: '', suffix: '', classFile: '', scoreThreshold: 0.5, scannedCount: null, isScanning: false }])} className="w-full h-9 text-xs border-dashed border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/30">
                  <Plus className="w-4 h-4 mr-2" /> 添加对比模型
                </Button>
              </div>
            )}
          </section>
          {/* ========================================================= */}


        {/* 🌟 Section 4: 保存与排版设置 */}
        {/* Section 4: 保存与排版设置 */}
        <section className="p-4 space-y-4 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-50/30 dark:bg-indigo-900/10">
          <Label className="text-[10px] font-black uppercase text-indigo-500 tracking-widest flex items-center gap-2">
            <LayoutTemplate size={12} /> 4. 保存与排版预览
          </Label>

          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <Checkbox id="save-indep" checked={exportIndependent} onCheckedChange={(val) => setExportIndependent(!!val)} />
              <Label htmlFor="save-indep" className="text-xs cursor-pointer">独立保存</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="save-merge" checked={exportMerged} onCheckedChange={(val) => setExportMerged(!!val)} />
              <Label htmlFor="save-merge" className="text-xs cursor-pointer">合并拼图</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-neutral-600">保存根目录</Label>
            <div className="relative">
              <Input value={savePath} onChange={e => setSavePath(e.target.value)} className="h-8 text-xs pr-8" placeholder="选择保存路径..." />
              <button onClick={() => setExplorerConfig({ open: true, type: 'dir', target: 'save_dir', initialPath: savePath })} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          {exportMerged && (
            <div className="space-y-4 p-3 rounded-lg bg-white/50 dark:bg-neutral-950/50 border border-indigo-100 dark:border-indigo-900/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-neutral-500">行数 (Rows)</Label>
                  <Input type="number" value={exportRows} onChange={e => setExportRows(Math.max(1, parseInt(e.target.value)))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-neutral-500">列数 (Cols)</Label>
                  <Input type="number" value={exportCols} onChange={e => setExportCols(Math.max(1, parseInt(e.target.value)))} className="h-8 text-xs" />
                </div>
              </div>

              {/* 🌟 实时布局逻辑预览：淡蓝色小网格 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-[9px] font-bold text-neutral-400 uppercase">布局预览 ({totalLayers} 图层)</Label>
                  <span className="text-[9px] font-mono text-indigo-500">{exportRows}×{exportCols}</span>
                </div>
                <div 
                  className="grid gap-1 p-2 bg-neutral-200/50 dark:bg-black/20 rounded border border-dashed border-neutral-300 dark:border-neutral-700"
                  style={{ 
                    gridTemplateColumns: `repeat(${exportCols}, 1fr)`,
                    gridTemplateRows: `repeat(${exportRows}, 1fr)`
                  }}
                >
                  {Array.from({ length: exportRows * exportCols }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`aspect-square rounded-sm border transition-all duration-300 ${i < totalLayers ? 'bg-indigo-400/40 border-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.2)]' : 'bg-transparent border-neutral-300 dark:border-neutral-800'}`}
                    />
                  ))}
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full h-8 text-[11px] font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-100" onClick={handleApplyLayout} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                更新预览
              </Button>
            </div>
          )}
        </section>

          
        </div>
        {/* 底部执行按钮 */}
        <div className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 space-y-3">
          {/* 🌟 只有导出进行中且有进度值时显示 */}
          {isExporting && exportProgress !== null && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between text-[10px] font-black text-emerald-600 uppercase tracking-tighter">
                <span>Processing Scenes...</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-emerald-100 dark:border-emerald-900/30">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                  style={{ width: `${exportProgress}%` }} 
                />
              </div>
            </div>
          )}
          <Button 
            onClick={handleExportAll} 
            disabled={isExporting} 
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-transform"
          >
            {isExporting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 批量任务执行中...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> 启动批量导出任务</>
            )}
          </Button>
        </div>
      </div>

      {/* 主视图：预览区 */}
      <div className="flex-1 relative bg-neutral-900 flex flex-col items-center justify-center overflow-hidden pattern-checkerboard">
  
        {/* 1. 顶部状态指示 (保持不变) */}
        {scannedStems.length > 0 && (
          <div className="absolute top-3 right-4 z-30 px-2.5 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-md shadow-sm">
            <div className="text-[9px] font-mono text-white/80 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-white/40">当前示例:</span> 
              <span className="text-indigo-400 font-bold">{scannedStems[currentIndex]}</span>
            </div>
          </div>
        )}

        {/* 2. 加载等待层 (保持不变) */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-[9px] font-black tracking-[0.2em] text-neutral-400 uppercase">渲染图层数据中...</p>
          </div>
        )}

        {/* 🌟 3. 核心画布区域：支持独立图层 + 合并图层 */}
        <div className="w-full h-full p-4 flex flex-col items-center overflow-y-auto custom-scrollbar">
          
          {/* --- A 部分：独立图层网格 (只有勾选了独立保存时显示) --- */}
          {exportIndependent && Object.keys(previewImages).length > 0 && (
            <div className="w-full max-w-[1600px] mb-8">
              <div className="flex items-center gap-2 mb-3 opacity-50">
                <Layers size={14} className="text-white" />
                <span className="text-[10px] font-bold text-white uppercase tracking-widest">独立图层监控 (Independent Layers)</span>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 w-full">
                {Object.entries(previewImages).map(([layerName, b64Str]) => (
                  <div key={layerName} className="flex flex-col gap-1 bg-black/40 p-1.5 rounded-lg border border-white/10 shadow-xl">
                    <div className="text-white/60 text-[9px] font-mono px-1 uppercase tracking-wider flex justify-between font-bold">
                      <span>{layerName}</span>
                    </div>
                    <div className="relative rounded overflow-hidden bg-black/50 flex items-center justify-center border border-white/5">
                      <img 
                        src={b64Str} 
                        className={`w-full max-h-[60vh] object-contain transition-all duration-500 ${isLoading ? 'opacity-30 blur-sm' : 'opacity-100'}`}
                        alt={layerName} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- B 部分：合并拼图预览 (独占一行，一列显示) --- */}
          {exportMerged && mergedPreview && (
            <div className="w-full max-w-[1600px] pb-16">
              <div className="flex items-center justify-between mb-4 pt-8 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <LayoutTemplate size={16} className="text-indigo-400" />
                  <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">最终排版预览 (Fused Layout)</span>
                </div>
                <div className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-mono border border-indigo-500/30">
                  {exportRows}R × {exportCols}C
                </div>
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border-2 border-indigo-500/20 shadow-2xl shadow-indigo-500/5 transition-all">
                <img 
                  src={mergedPreview} 
                  className={`w-full h-auto rounded shadow-inner transition-all duration-700 ${isLoading ? 'opacity-20 blur-md' : 'opacity-100'}`}
                  alt="Fused Result" 
                />
              </div>
            </div>
          )}

          {/* --- C 部分：空状态提示 --- */}
          {!mergedPreview && Object.keys(previewImages).length === 0 && !isLoading && (
            <div className="text-neutral-700 flex flex-col items-center justify-center h-full gap-3 mt-[-10vh]">
              <MonitorPlay size={40} strokeWidth={1} className="opacity-20" />
              <p className="text-[10px] font-bold opacity-30 tracking-widest uppercase">等待配置应用或渲染</p>
            </div>
          )}
          
        </div>
      </div>
      {/* 1. 用于选择 project_meta.json 的文件浏览器 */}
        <FileExplorerDialog 
        open={explorerConfig.open}
        initialPath={explorerConfig.initialPath || ''}
        onClose={() => setExplorerConfig(prev => ({ ...prev, open: false }))}
        onConfirm={handleUniversalExplorerConfirm}
        selectType={explorerConfig.type} 
      />
    </div>
  );
}