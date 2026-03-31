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
        // 🌟 直接返回内容，使用 bg-background 自动适配弹窗底色
        <div className="p-6 flex flex-col items-center justify-center space-y-4 bg-background h-full">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <FileJson className="w-8 h-8 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
            Select a <span className="text-foreground font-mono font-medium">project_meta.json</span> file to restore your workspace, folders, and view configurations.
        </p>
        
        {error && <div className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {error}</div>}

        <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        
        {/* 🌟 加上 variant="default" ，自动应用你在全局设置的蓝色主色调 */}
        {/* 直接用组件默认样式即可，它会自动读取 --primary */}
        <Button onClick={() => fileInputRef.current?.click()} className="w-full mt-2 font-semibold">
            Browse JSON File
        </Button>
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
        <div className="p-6 space-y-6 bg-background h-full flex flex-col">
        <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Project Name</label>
            <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            // 🌟 使用 bg-muted 呈现出自然的浅灰(日间)/深灰(夜间)输入框
            className="bg-muted border-input focus:border-primary font-medium text-foreground"
            placeholder="Enter project name..."
            />
        </div>

        <div className="p-4 rounded-lg border border-border bg-muted/50 space-y-3">
            <label className="text-xs font-bold text-muted-foreground uppercase block">Optional: Import Parameters</label>
            <p className="text-[10px] text-muted-foreground">
            You can reuse folder paths, view settings, and alignments from an existing project.
            </p>
            
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            
        {/* 导入参数按钮：完美使用 primary 语义颜色 */}
        <Button 
          variant="outline" 
          onClick={() => fileInputRef.current?.click()}
          className={`w-full text-xs transition-colors ${importedMeta ? 'border-primary/50 text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {importedMeta ? <><Check className="w-3 h-3 mr-2" /> Parameters Loaded</> : <><Upload className="w-3 h-3 mr-2" /> Load existing JSON...</>}
        </Button>
      </div>

      {/* 底部创建按钮 */}
      <div className="flex justify-end gap-2 pt-2 mt-auto">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="font-semibold" onClick={handleConfirm}>
          Create Project
        </Button>
      </div>
        </div>
    );
}