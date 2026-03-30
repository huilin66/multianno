// src/components/modals/ProjectSetupModals.tsx
import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { X, FolderPlus, Upload, FileJson, Check, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { readProjectJsonFile } from '../lib/projectUtils';
import type { ProjectMetaContract } from '../config/contract';

// ==========================================
// 1. Load Project Modal (加载现有项目)
// ==========================================
export function LoadProject({onClose}: {onClose: () => void}) {
  const { loadProjectMeta, setActiveModule } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');

//   if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError('');
      const meta = await readProjectJsonFile(file);
      loadProjectMeta(meta); // 写入 Store
      
      setActiveModule('meta');
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2"><Upload className="w-4 h-4 text-blue-400"/> Load Project</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="w-6 h-6"><X className="w-4 h-4" /></Button>
        </div>
        
        <div className="p-6 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
            <FileJson className="w-8 h-8 text-blue-400" />
          </div>
          <p className="text-sm text-neutral-400 text-center">
            Select a <span className="text-neutral-200 font-mono">project_meta.json</span> file to restore your workspace, folders, and view configurations.
          </p>
          
          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {error}</div>}

          {/* 🌟 隐藏的文件输入框 */}
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          
          <Button onClick={() => fileInputRef.current?.click()} className="w-full bg-blue-600 hover:bg-blue-700">
            Browse JSON File
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. Create New Project Modal (创建新项目)
// ==========================================
export function CreateProject({onClose }: {onClose: () => void }) {
  const { setProjectName, loadProjectMeta, setActiveModule } = useStore();
  const [name, setName] = useState('multianno project1');
  const [importedMeta, setImportedMeta] = useState<ProjectMetaContract | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
//   if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const meta = await readProjectJsonFile(file);
      setImportedMeta(meta); // 暂存起来，等用户点 Confirm 时再应用
    } catch (err) {
      alert("Invalid JSON file");
    }
  };

  const handleConfirm = () => {
    if (importedMeta) {
      // 如果导入了配置，先全量加载配置
      loadProjectMeta(importedMeta);
    }
    // 无论是否导入配置，都强制覆盖为用户刚刚输入的新名字
    setProjectName(name);
    
    // 🌟 按要求：确认后进入 Data Preload 窗口
    setActiveModule('preload');
    setImportedMeta(null); // 重置状态
  };

return (
    // 🌟 删除了外层的 fixed 遮罩和手写的 Header，只保留内容区域
    <div className="p-6 space-y-6 bg-neutral-900 h-full flex flex-col">
      <div className="space-y-2">
        <label className="text-xs font-bold text-neutral-400 uppercase">Project Name</label>
        <Input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="bg-black/50 border-neutral-700 text-neutral-200 focus:border-emerald-500"
          placeholder="Enter project name..."
        />
      </div>

      <div className="p-4 rounded-lg border border-neutral-800 bg-black/20 space-y-3">
        <label className="text-xs font-bold text-neutral-400 uppercase block">Optional: Import Parameters</label>
        <p className="text-[10px] text-neutral-500">
          You can reuse folder paths, view settings, and alignments from an existing project.
        </p>
        
        <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        
        <Button 
          variant="outline" 
          onClick={() => fileInputRef.current?.click()}
          className={`w-full text-xs transition-colors ${importedMeta ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'}`}
        >
          {importedMeta ? <><Check className="w-3 h-3 mr-2" /> Parameters Loaded</> : <><Upload className="w-3 h-3 mr-2" /> Load existing JSON...</>}
        </Button>
      </div>

      {/* 底部按钮 */}
      <div className="flex justify-end gap-2 pt-2 mt-auto">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirm}>
          Create Project
        </Button>
      </div>
    </div>
  );
}