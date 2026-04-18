import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Upload, Folder, FileJson, Layers } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { processDataExchange } from '../../api/client';

export function DataImport({ onClose }: { onClose?: () => void }) {
  const { folders } = useStore() as any;
  const safeSaveDirs = folders?.map((f: any) => f.path).filter(Boolean) || [];

  const [format, setFormat] = useState('yolo');
  const [sourceDir, setSourceDir] = useState('');
  
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleExecute = async () => {
    if (!sourceDir) return alert("Please select a source directory to import from.");
    
    setIsProcessing(true);
    try {
      const res = await processDataExchange({
        source_dirs: [sourceDir], // 告诉后端数据在哪里
        target_dir: safeSaveDirs[0], // 导入到当前工作区的第一个文件夹
        format,
        mode: 'import'
      });
      alert(`🎉 Import Success: ${res.message}`);
      if (onClose) onClose();
    } catch (err: any) {
      alert(`Import Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 p-8 max-w-xl mx-auto w-full overflow-y-auto space-y-8">
      
      <div className="text-center space-y-2 mb-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 mb-2">
          <Upload className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-black text-neutral-800 dark:text-neutral-100">Import Annotations</h2>
        <p className="text-sm text-neutral-500">Load external dataset formats into your current workspace.</p>
      </div>

      <div className="space-y-3 p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <Label className="text-xs font-black uppercase text-neutral-400 tracking-wider">Source Format</Label>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="h-12 font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yolo">YOLOv8 Format (.txt)</SelectItem>
            <SelectItem value="coco">COCO Format (.json)</SelectItem>
            <SelectItem value="multianno">Native (.json)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <Label className="text-xs font-black uppercase text-neutral-400 tracking-wider">Source Directory</Label>
        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md font-mono text-xs text-neutral-600 overflow-hidden text-ellipsis whitespace-nowrap leading-6">
            {sourceDir || 'Choose a directory containing labels...'}
          </div>
          <Button onClick={() => setExplorerOpen(true)} className="shrink-0 font-bold px-6">
            <Folder className="w-4 h-4 mr-2" /> Browse
          </Button>
        </div>
      </div>

      <Button size="lg" disabled={isProcessing || !sourceDir} onClick={handleExecute} className="w-full font-black bg-emerald-600 hover:bg-emerald-700 text-white">
        {isProcessing ? 'Processing...' : 'Start Importing'}
      </Button>

      <FileExplorerDialog open={explorerOpen} initialPath="/" selectType="dir" onClose={() => setExplorerOpen(false)} onConfirm={(paths) => { if (paths.length > 0) setSourceDir(paths[0]); setExplorerOpen(false); }} />
    </div>
  );
}