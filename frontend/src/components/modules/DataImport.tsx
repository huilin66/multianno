import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Upload, Folder, FileText, AlertTriangle } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { importData } from '../../api/client';

const FORMAT_EN_DISPLAY: Record<string, string> = {
  yolo: 'YOLO Format (.txt)',
  coco: 'COCO Format (.json)',
};

export function DataImport({ onClose }: { onClose?: () => void }) {
  const { folders } = useStore() as any;
  const safeWorkspaceDir = folders?.map((f: any) => f.path).filter(Boolean)[0] || '';

  // --- 状态定义 ---
  const [format, setFormat] = useState('yolo');
  const [mergeStrategy, setMergeStrategy] = useState<'append' | 'overwrite' | 'skip'>('append');
  
  const [sourceDataPath, setSourceDataPath] = useState(''); // YOLO的目录，或COCO的json文件
  const [targetWorkspaceDir, setTargetWorkspaceDir] = useState(safeWorkspaceDir);
  const [externalClassFile, setExternalClassFile] = useState('');
  
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [explorerTarget, setExplorerTarget] = useState<'source' | 'target' | 'yolo_file'>('source');
  const [explorerOpen, setExplorerOpen] = useState(false);

  // --- 动作函数 ---
  const handleExecute = async () => {
    if (!sourceDataPath) return alert("请选择要导入的外部数据源路径！");
    if (!targetWorkspaceDir) return alert("请选择系统目标工作区！");
    if (format === 'yolo' && !externalClassFile) return alert("导入 YOLO 必须提供 classes.txt！");

    const payload = {
      source_path: sourceDataPath,
      target_dir: targetWorkspaceDir,
      format: format,
      merge_strategy: mergeStrategy,
      classes_file: externalClassFile
    };
    
    try {
      const res = await importData(payload); // 🌟 只留这一个干净的调用！
      alert(`导入成功: ${res.message}`);
      if (onClose) onClose();
    } catch (err: any) {
      alert(`导入失败: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 w-full overflow-hidden">
      
      {/* 顶部标题栏 */}
      <div className="shrink-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto w-full">
          <h2 className="text-xl font-black flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
            <Upload className="text-emerald-500" /> 导入外部标注数据
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-5xl mx-auto w-full space-y-6">

          {/* 1. 格式与策略 */}
          <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
            <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">1. 数据格式与合并策略</Label>
            <div className="grid grid-cols-2 gap-8">
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="w-16 text-right text-xs font-bold">外部格式：</Label>
                  <Select value={format} onValueChange={(val) => { setFormat(val); setSourceDataPath(''); }}>
                    <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{FORMAT_EN_DISPLAY[format]}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yolo">YOLO 格式 (.txt 文件夹)</SelectItem>
                      <SelectItem value="coco">COCO 格式 (单一 .json 文件)</SelectItem>
                    </SelectContent>
                  </Select>
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
          </section>

          {/* 2. 路径配置 */}
          <section className="grid grid-cols-2 gap-6">
            
            {/* 左侧：数据源 (外部) */}
            <div className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4 border-emerald-100 dark:border-emerald-900/30">
              <Label className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest flex items-center gap-1">
                <Upload className="w-3 h-3" /> 2. 外部数据源 (Source)
              </Label>
              
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-neutral-500">
                  {format === 'yolo' ? '选择包含 YOLO .txt 文件的文件夹' : '选择 COCO instances.json 文件'}
                </Label>
                <Button variant="outline" className="w-full justify-start text-xs font-bold truncate border-dashed hover:bg-emerald-50 dark:hover:bg-emerald-900/20" 
                  onClick={() => { 
                    setExplorerTarget('source'); 
                    setExplorerMode(format === 'yolo' ? 'dir' : 'file'); 
                    setExplorerOpen(true); 
                  }}>
                  {format === 'yolo' ? <Folder className="w-4 h-4 mr-2 text-emerald-500 shrink-0" /> : <FileText className="w-4 h-4 mr-2 text-emerald-500 shrink-0" />}
                  {sourceDataPath || "点击选择外部路径..."}
                </Button>
              </div>

              {format === 'yolo' && (
                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-1.5">
                  <Label className="text-[11px] font-bold text-neutral-500 flex items-center gap-1">
                    必需的 classes.txt <AlertTriangle className="w-3 h-3 text-amber-500" />
                  </Label>
                  <Button variant="ghost" className="w-full justify-start text-[10px] border-dashed border h-8" 
                    onClick={() => { setExplorerTarget('yolo_file'); setExplorerMode('file'); setExplorerOpen(true); }}>
                    <FileText className="w-3 h-3 mr-2 text-amber-500 shrink-0" />
                    <span className="truncate">{externalClassFile || "必须指定 classes.txt 以还原类别名称"}</span>
                  </Button>
                </div>
              )}
            </div>

            {/* 右侧：目标工作区 (内部) */}
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

          {/* 执行按钮 */}
          <Button 
            size="lg" 
            className="w-full font-black py-7 shadow-xl shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 text-white transition-all mt-4 mb-8" 
            onClick={handleExecute}
          >
            启动数据导入引擎
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