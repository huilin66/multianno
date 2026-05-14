import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Upload, Folder, FileText, AlertTriangle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { importData, loadProjectMetaFromServer, analyzeWorkspaceFolders } from '../../api/client';
import { loadAllProjectAnnotations } from '../../lib/projectUtils';
import { SUPPORTED_TASKS, FORMAT_DETAILS, TaskType } from '../../config/supportedFormats';

export function DataImport({ onClose }: { onClose?: () => void }) {
  const { folders, views } = useStore() as any;
  const mainViewFolder = folders?.find((f: any) => 
    f.id === views?.find((v: any) => v.isMain)?.folderId
  ) || folders?.[0];
  
  const workspacePath = useStore(s => s.workspacePath);
  const safeWorkspaceDir = workspacePath || mainViewFolder?.path || '';

  const [taskType, setTaskType] = useState('object_detection');
  const [format, setFormat] = useState('yolo');
  const [extension, setExtension] = useState('.txt');
  const [mergeStrategy, setMergeStrategy] = useState<'append' | 'overwrite' | 'skip' | 'mirror'>('append');
  const [sourceDataPath, setSourceDataPath] = useState(''); 
  const [targetWorkspaceDir, setTargetWorkspaceDir] = useState(safeWorkspaceDir);
  const [externalClassFile, setExternalClassFile] = useState('');
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [explorerTarget, setExplorerTarget] = useState<'source' | 'target' | 'yolo_file'>('source');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [customSuffix, setCustomSuffix] = useState('');
  const [importZeroClass, setImportZeroClass] = useState(false);
  const [cocoMode, setCocoMode] = useState<'polygon' | 'bbox'>('polygon');
  const [isImporting, setIsImporting] = useState(false);

 
  React.useEffect(() => {
    const available = SUPPORTED_TASKS[taskType as TaskType].formats;
    if (available && !available.includes(format)) setFormat(available[0]);
  }, [taskType]);

  React.useEffect(() => {
    const detail = FORMAT_DETAILS[format];
    if (detail && !detail.extensions.includes(extension)) {
      setExtension(detail.defaultExtension);
    }
  }, [format]);

  const handleExecute = async () => {
    if (!sourceDataPath) return alert("请选择要导入的外部数据源路径！");

    if ((format === 'yolo' || format === 'images_only') && !externalClassFile) {
      return alert("导入当前格式必须提供 classes.txt 以还原类别名称！");
    }
    if (!targetWorkspaceDir) return alert("错误：无法获取当前项目的默认工作区路径。");
        
    setIsImporting(true);

    const payload = {
      source_path: sourceDataPath,
      target_dir: targetWorkspaceDir,
      format: format,
      merge_strategy: mergeStrategy,
      classes_file: externalClassFile,
      custom_suffix: customSuffix,
      import_zero_class: importZeroClass,
      coco_mode: cocoMode,
    };

    try {
      // 1. 调用后端执行导入
      const res = await importData(payload);
      
      // 🌟 2. 核心大招：后端导入成功后，前端触发全量热重载！
      const { projectMetaPath } = useStore.getState();
      if (projectMetaPath) {
        try {
          // A. 重新拉取 Project Meta (把导入过程中可能新增的 Taxonomy 类别同步到内存)
          const meta = await loadProjectMetaFromServer(projectMetaPath);
          useStore.getState().loadProjectMeta(meta);

          // B. 重新静默扫描文件夹 (同步可能发生变化的图片列表)
          if (meta.folders && meta.folders.length > 0) {
            const analyzePayload = meta.folders.map((f: any) => ({
              path: f.path,
              suffix: f.suffix || ''
            }));
            
            const analyzeResult = await analyzeWorkspaceFolders(analyzePayload);
            
            if (analyzeResult.commonStems && analyzeResult.commonStems.length > 0) {
              useStore.getState().setStems(analyzeResult.commonStems);
              useStore.getState().setSceneGroups(analyzeResult.sceneGroups);
              useStore.getState().setCurrentStem(analyzeResult.commonStems[0]);

              // C. 定位主视图，重新触发安全全量加载引擎！
              const mainViewFolderId = meta.views.find((v:any) => v.isMain)?.["folder id"];
              const mainFolder = meta.folders.find((f:any) => f.Id === mainViewFolderId) || meta.folders[0];

              const state = useStore.getState();
              const loadPath = state.workspacePath || mainFolder?.path || '';
              if (loadPath) {
                  loadAllProjectAnnotations(analyzeResult.commonStems, loadPath);
              }
            }
          }
        } catch (refreshErr) {
          console.error("工作区数据热更新失败:", refreshErr);
        }
      }

      alert(`导入成功: ${res.message}`);
      if (onClose) onClose();
    } catch (err: any) {
      alert(`导入失败: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const getSourceDisplayInfo = () => {
    switch (format) {
      case 'yolo': return { label: '选择包含 YOLO .txt 的文件夹', icon: <Folder className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> };
      case 'coco': return { label: '选择 COCO instances.json 文件', icon: <FileText className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> };
      case 'multianno': return { label: '选择包含原生 .json 的文件夹', icon: <Folder className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> };
      case 'images_only': return { label: '选择包含灰度 Mask 图像的文件夹', icon: <ImageIcon className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> };
      default: return { label: '选择数据源...', icon: <Folder className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> };
    }
  };

  const sourceInfo = getSourceDisplayInfo();

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 w-full overflow-hidden">
      
      <div className="shrink-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto w-full">
          <h2 className="text-xl font-black flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
            <Upload className="text-emerald-500" /> 导入外部标注数据
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-5xl mx-auto w-full space-y-6">

          {/* 1. 格式、策略与后缀 */}
          {/* 1. 任务与格式配置 (对齐导出面板的完美交互) */}
          <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
            <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">1. 任务与格式配置 (Task & Format)</Label>
            <div className="grid grid-cols-2 gap-8">
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-xs font-bold">任务：</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{SUPPORTED_TASKS[taskType as TaskType]?.label}</span></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUPPORTED_TASKS).map(([id, t]) => (
                        <SelectItem key={id} value={id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-xs font-bold">格式：</Label>
                  <Select value={format} onValueChange={(val) => { setFormat(val); setSourceDataPath(''); }}>
                    <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{FORMAT_DETAILS[format]?.label}</span></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_TASKS[taskType as TaskType]?.formats.map(fId => (
                        <SelectItem key={fId} value={fId}>{FORMAT_DETAILS[fId].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-[11px] font-bold">场景后缀：</Label>
                  <Input 
                    placeholder="例如: _RGB" 
                    value={customSuffix} 
                    onChange={(e) => setCustomSuffix(e.target.value)} 
                    className="flex-1 h-9 text-xs font-bold" 
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-[11px] font-bold">扩展名：</Label>
                  <Select value={extension} onValueChange={setExtension}>
                    <SelectTrigger className="flex-1 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMAT_DETAILS[format]?.extensions.map(ext => (
                        <SelectItem key={ext} value={ext}>{ext}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </div>
            
            <div className="flex items-center justify-between p-2.5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-md border border-emerald-100 dark:border-emerald-900/30">
              <div className="flex items-center gap-3">
                <Label className="text-xs font-bold text-emerald-800 dark:text-emerald-300">策略设置：</Label>
                <Select value={mergeStrategy} onValueChange={(val: any) => setMergeStrategy(val)}>
                  <SelectTrigger className="w-[300px] h-8 text-xs font-bold border-emerald-200 dark:border-emerald-800 bg-white dark:bg-neutral-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="append">🟢 融合追加 (保留原标注，合并新标注)</SelectItem>
                    <SelectItem value="overwrite">🔴 强制覆盖 (用新标注替换原同名标注)</SelectItem>
                    <SelectItem value="skip">🟡 安全跳过 (图片已有标注则跳过)</SelectItem>
                    <SelectItem value="mirror">🟣 镜像同步 (清空原标注，完全以新标注为准)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                预览寻找: <code className="text-emerald-600 dark:text-emerald-400">scene001{customSuffix}{extension}</code>
              </span>
            </div>
          </section>

          {/* 2. 路径配置 */}
          <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">

              <Label className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest flex items-center gap-1">
                <Upload className="w-3 h-3" /> 2. 外部数据源 (Source)
              </Label>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-neutral-500">{sourceInfo.label}</Label>
                <Button variant="outline" className="w-full justify-start text-xs font-bold truncate border-dashed hover:bg-emerald-50 dark:hover:bg-emerald-900/20" 
                  onClick={() => { 
                    setExplorerTarget('source'); 
                    setExplorerMode(format === 'coco' ? 'file' : 'dir'); 
                    setExplorerOpen(true); 
                  }}>
                  {sourceInfo.icon}
                  {sourceDataPath || "点击选择外部路径..."}
                </Button>
              </div>

              {(format === 'yolo' || format === 'images_only') && (
                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-1.5">
                  <Label className="text-[11px] font-bold text-neutral-500 flex items-center gap-1">
                    必需的 classes.txt 映射文件 <AlertTriangle className="w-3 h-3 text-amber-500" />
                  </Label>
                  <Button variant="ghost" className="w-full justify-start text-[10px] border-dashed border h-8" 
                    onClick={() => { setExplorerTarget('yolo_file'); setExplorerMode('file'); setExplorerOpen(true); }}>
                    <FileText className="w-3 h-3 mr-2 text-amber-500 shrink-0" />
                    <span className="truncate">{externalClassFile || "必须指定 classes.txt 以还原类别名称"}</span>
                  </Button>
                </div>
              )}

              {/* 🌟 3. 新增：只有选择 images_only 时才显示该开关 */}
                {format === 'images_only' && (
                  <div className="flex items-center gap-3 pt-2">
                    <Label className="w-16 text-right text-[11px] font-bold">背景类：</Label>
                    <div className="flex items-center space-x-2 flex-1 bg-neutral-100 dark:bg-neutral-800/50 p-1.5 rounded-md border border-neutral-200 dark:border-neutral-800">
                      <Switch 
                        id="import-zero" 
                        checked={importZeroClass} 
                        onCheckedChange={setImportZeroClass} 
                      />
                      <Label htmlFor="import-zero" className="text-[11px] text-neutral-500 cursor-pointer">
                        提取像素值为 <code className="text-neutral-700 dark:text-neutral-300 font-bold">0</code> 的区域作为多边形
                      </Label>
                    </div>
                  </div>
                )}

                {/* 🌟 新增：只有选择 coco 时才显示该提取模式 */}
                {format === 'coco' && (
                  <div className="flex items-center gap-3 pt-2">
                    <Label className="w-16 text-right text-[11px] font-bold">提取策略：</Label>
                    <Select value={cocoMode} onValueChange={(val: any) => setCocoMode(val)}>
                      <SelectTrigger className="flex-1 h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="polygon">🔷 优先多边形 (无多边形则降级为矩形)</SelectItem>
                        <SelectItem value="bbox">🔲 强制矩形框 (仅提取 Bounding Box)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

          </section>
          <p className="text-[10px] text-neutral-400 mt-2 px-1">
            数据将自动同步至当前工作区：<span className="font-mono text-neutral-500">{safeWorkspaceDir}</span>
          </p>
          {/* 🌟 体验升级：带 Loading 状态的按钮 */}
          <Button 
            size="lg" 
            disabled={isImporting}
            className="w-full font-black py-7 shadow-xl shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 text-white transition-all mt-4 mb-8" 
            onClick={handleExecute}
          >
            {isImporting ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> 正在导入并同步工作区...</>
            ) : (
              "启动数据导入引擎"
            )}
          </Button>
        </div>
      </div>

      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath="/" 
        selectType={explorerMode}
        onClose={() => setExplorerOpen(false)} 
        onConfirm={async (paths) => {
          if (explorerTarget === 'source') setSourceDataPath(paths[0]);
          else if (explorerTarget === 'target') setTargetWorkspaceDir(paths[0]);
          else if (explorerTarget === 'yolo_file') setExternalClassFile(paths[0]);
          setExplorerOpen(false);
        }} 
      />
    </div>
  );
}