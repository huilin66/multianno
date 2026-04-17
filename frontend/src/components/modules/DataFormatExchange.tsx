import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Download, Upload, Folder, ArrowRightLeft, FileJson, FileImage, Layers } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { Checkbox } from '../ui/checkbox';
import { processDataExchange } from '../../api/client';

export function DataFormatExchange({ initialMode = 'export', onClose }: { initialMode?: 'export' | 'import', onClose?: () => void }) {
  const { folders } = useStore() as any;
  
  // 当前处于导入还是导出模式
  const [mode, setMode] = useState<'export' | 'import'>(initialMode);
  const [format, setFormat] = useState('yolo');
  const [targetDir, setTargetDir] = useState('');
  
  // FileExplorer 弹窗状态
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const safeSaveDirs = folders?.map((f: any) => f.path).filter(Boolean) || [];
  const [generateReport, setGenerateReport] = useState(true); // 🌟 默认勾选

  const handleExecute = async () => {
    if (!targetDir) {
      alert(`请选择${mode === 'export' ? '导出到的目标' : '包含标注数据的来源'}文件夹！`);
      return;
    }
    if (safeSaveDirs.length === 0) {
      alert("当前工作区没有挂载图片文件夹，无法执行操作！");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await processDataExchange({
        source_dirs: safeSaveDirs,
        target_dir: targetDir,
        format,
        mode,
        generate_report: generateReport
      });
      alert(`🎉 操作成功: ${res.message}`);
      if (onClose) onClose();
    } catch (err: any) {
      alert(`操作失败: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950">
      
      {/* 🌟 模式切换 Tabs (类似 macOS 偏好设置) */}
      <div className="flex p-2 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shrink-0 justify-center">
        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
          <Button 
            variant="ghost" 
            className={`h-8 px-6 text-xs font-bold rounded-md ${mode === 'import' ? 'bg-white dark:bg-neutral-900 shadow-sm text-blue-600 dark:text-blue-400' : 'text-neutral-500'}`}
            onClick={() => setMode('import')}
          >
            <Upload className="w-4 h-4 mr-2" /> Import Data
          </Button>
          <Button 
            variant="ghost" 
            className={`h-8 px-6 text-xs font-bold rounded-md ${mode === 'export' ? 'bg-white dark:bg-neutral-900 shadow-sm text-blue-600 dark:text-blue-400' : 'text-neutral-500'}`}
            onClick={() => setMode('export')}
          >
            <Download className="w-4 h-4 mr-2" /> Export Data
          </Button>
        </div>
      </div>

      <div className="p-8 max-w-2xl mx-auto w-full space-y-8 flex-grow overflow-y-auto">
        
        {/* 信息大字报展示区 */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-2">
            <ArrowRightLeft className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-neutral-800 dark:text-neutral-100 tracking-tight">
            Data Format {mode === 'export' ? 'Export' : 'Import'}
          </h2>
          <p className="text-sm text-neutral-500">
            {mode === 'export' 
              ? '将当前工作区的标注数据转化为标准开源格式，用于算法训练。' 
              : '将第三方平台的开源格式标注导入当前工作区，用于修改与微调。'}
          </p>
        </div>

        {/* 格式选择器 */}
        <div className="space-y-3 p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
          <Label className="text-xs font-black uppercase text-neutral-400 tracking-wider">Target Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="h-12 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multianno">
                <div className="flex items-center gap-3 py-1">
                  <Layers className="w-5 h-5 text-blue-500" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold">MultiAnno Native (.json)</span>
                    <span className="text-[10px] text-neutral-500">Perfect lossless native format</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="yolo">
                <div className="flex items-center gap-3 py-1">
                  <FileJson className="w-5 h-5 text-amber-500" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold">YOLOv8 Format (.txt)</span>
                    <span className="text-[10px] text-neutral-500">Normalized coordinates, ready for YOLO training</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="coco">
                <div className="flex items-center gap-3 py-1">
                  <FileJson className="w-5 h-5 text-emerald-500" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold">COCO Format (.json)</span>
                    <span className="text-[10px] text-neutral-500">Standard COCO detection/segmentation dataset</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="image_only">
                <div className="flex items-center gap-3 py-1">
                  <FileImage className="w-5 h-5 text-neutral-500" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold">Pure Image (No Annotations)</span>
                    <span className="text-[10px] text-neutral-500">Extract pure images without any JSON/TXT</span>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 路径选择器 */}
        <div className="space-y-3 p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
          <Label className="text-xs font-black uppercase text-neutral-400 tracking-wider">
            {mode === 'export' ? 'Export Destination Directory' : 'Import Source Directory'}
          </Label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md font-mono text-xs text-neutral-600 dark:text-neutral-400 overflow-hidden text-ellipsis whitespace-nowrap leading-6">
              {targetDir || `Choose a directory to ${mode}...`}
            </div>
            <Button onClick={() => setExplorerOpen(true)} className="shrink-0 font-bold px-6">
              <Folder className="w-4 h-4 mr-2" /> Browse
            </Button>
          </div>
        </div>

        {mode === 'export' && (
        <div className="flex items-center space-x-3 px-2">
          <Checkbox 
            id="report-checkbox" 
            checked={generateReport} 
            onCheckedChange={(checked) => setGenerateReport(!!checked)} 
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
          <div className="space-y-1 leading-none cursor-pointer" onClick={() => setGenerateReport(!generateReport)}>
            <Label htmlFor="report-checkbox" className="text-xs font-bold text-neutral-700 dark:text-neutral-300 cursor-pointer">
              Generate Detailed Export Report
            </Label>
            <p className="text-[10px] text-neutral-500">
              Creates an <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">export_report.txt</code> file detailing converted and discarded shapes per scene.
            </p>
          </div>
        </div>
      )}

        {/* 执行按钮 */}
        <Button 
          size="lg" 
          disabled={isProcessing || !targetDir}
          onClick={handleExecute}
          className={`w-full font-black text-sm shadow-xl transition-all ${
            mode === 'export' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20' 
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
          }`}
        >
          {isProcessing ? 'Processing...' : (mode === 'export' ? 'Start Exporting' : 'Start Importing')}
        </Button>
      </div>

      {/* 复用文件浏览器弹窗 */}
      <FileExplorerDialog 
        open={explorerOpen}
        initialPath="/"
        selectType="dir"
        onClose={() => setExplorerOpen(false)}
        onConfirm={(paths) => {
          if (paths.length > 0) setTargetDir(paths[0]);
          setExplorerOpen(false);
        }}
      />
    </div>
  );
}