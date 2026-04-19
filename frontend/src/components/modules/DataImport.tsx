import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
// 🌟 1. 补全 Loader2 图标
import { Upload, Folder, FileText, AlertTriangle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
// 🌟 2. 引入读取配置和扫描目录的 API
import { importData, loadProjectMetaFromServer, analyzeWorkspaceFolders } from '../../api/client';
// 🌟 3. 引入全量加载引擎
import { loadAllProjectAnnotations } from '../../lib/projectUtils';

const FORMAT_EN_DISPLAY: Record<string, string> = {
  yolo: 'YOLO 目标检测/实例分割 (.txt)',
  coco: 'COCO 标注格式 (instances.json)',
  multianno: 'MultiAnno 原生标注 (.json)',
  images_only: '语义分割掩码图 (Mask Images)',
};

export function DataImport({ onClose }: { onClose?: () => void }) {
  const { folders, views } = useStore() as any;
  const mainViewFolder = folders?.find((f: any) => 
    f.id === views?.find((v: any) => v.isMain)?.folderId
  ) || folders?.[0];
  
  const safeWorkspaceDir = mainViewFolder?.path || '';

  const [format, setFormat] = useState('yolo');
  const [mergeStrategy, setMergeStrategy] = useState<'append' | 'overwrite' | 'skip'>('append');
  const [sourceDataPath, setSourceDataPath] = useState(''); 
  const [targetWorkspaceDir, setTargetWorkspaceDir] = useState(safeWorkspaceDir);
  const [externalClassFile, setExternalClassFile] = useState('');
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [explorerTarget, setExplorerTarget] = useState<'source' | 'target' | 'yolo_file'>('source');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [customSuffix, setCustomSuffix] = useState('');
  
  // 🌟 增加一个 Loading 状态
  const [isImporting, setIsImporting] = useState(false);

  const handleExecute = async () => {
    if (!sourceDataPath) return alert("请选择要导入的外部数据源路径！");
    if (!targetWorkspaceDir) return alert("请选择系统目标工作区！");
    
    if ((format === 'yolo' || format === 'images_only') && !externalClassFile) {
      return alert("导入当前格式必须提供 classes.txt 以还原类别名称！");
    }

    setIsImporting(true);

    const payload = {
      source_path: sourceDataPath,
      target_dir: targetWorkspaceDir,
      format: format,
      merge_strategy: mergeStrategy,
      classes_file: externalClassFile,
      custom_suffix: customSuffix 
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
              
              if (mainFolder && mainFolder.path) {
                // 后台并发抓取所有更新后的 JSON 标注文件
                loadAllProjectAnnotations(analyzeResult.commonStems, mainFolder.path);
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
          <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
            <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">1. 数据格式与匹配规则</Label>
            <div className="grid grid-cols-2 gap-8">
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-xs font-bold">外部格式：</Label>
                  <Select value={format} onValueChange={(val) => { setFormat(val); setSourceDataPath(''); }}>
                    <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{FORMAT_EN_DISPLAY[format]}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yolo">YOLO 格式 (.txt 文件夹)</SelectItem>
                      <SelectItem value="coco">COCO 格式 (单 .json 文件)</SelectItem>
                      <SelectItem value="multianno">MultiAnno 原生 (.json 文件夹)</SelectItem>
                      <SelectItem value="images_only">语义分割掩码图 (图像文件夹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-[11px] font-bold">Scene Suffix：</Label>
                  <Input 
                    placeholder="例如: _RGB" 
                    value={customSuffix} 
                    onChange={(e) => setCustomSuffix(e.target.value)} 
                    className="flex-1 h-9 text-xs font-bold" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-xs font-bold">冲突策略：</Label>
                  <Select value={mergeStrategy} onValueChange={(val: any) => setMergeStrategy(val)}>
                    <SelectTrigger className="flex-1 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">🟢 融合追加 (保留原标注，合并新标注)</SelectItem>
                      <SelectItem value="overwrite">🔴 强制覆盖 (清空原标注，只留新标注)</SelectItem>
                      <SelectItem value="skip">🟡 安全跳过 (若图片已有标注，则跳过导入)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </div>
            
            <div className="p-2.5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-md border border-emerald-100 dark:border-emerald-900/30 text-[10px] text-neutral-500 font-mono text-center">
              匹配预览: 剥离外部 <code className="text-emerald-600 dark:text-emerald-400">scene001{customSuffix || '_RGB'}</code> ➔ 匹配工作区基础组 <code>scene001.json</code>
            </div>
          </section>

          {/* 2. 路径配置 */}
          <section className="grid grid-cols-2 gap-6">
            <div className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4 border-emerald-100 dark:border-emerald-900/30">
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
            </div>

            <div className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
              <Label className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest flex items-center gap-1">
                <Folder className="w-3 h-3" /> 3. 系统目标工作区 (Target)
              </Label>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-neutral-500">选择包含图像素材的系统工作区</Label>
                <Button variant="outline" className="w-full justify-start text-xs font-bold truncate border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20" 
                  onClick={() => { setExplorerTarget('target'); setExplorerMode('dir'); setExplorerOpen(true); }}>
                  <Folder className="w-4 h-4 mr-2 text-blue-500 shrink-0" /> 
                  {targetWorkspaceDir || "选择写入目标文件夹..."}
                </Button>
              </div>
              <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-100 dark:border-blue-900/30">
                <p className="text-[10px] text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                  系统会自动在此文件夹中寻找同名图像以获取绝对物理尺寸，并将逆向计算后的原生 <code>.json</code> 文件保存在此。
                </p>
              </div>
            </div>
          </section>

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