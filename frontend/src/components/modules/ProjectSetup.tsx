// src/components/modals/ProjectSetupModals.tsx
import React, { useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { X, FolderPlus, Upload, FileJson, Check, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { readProjectJsonFile } from '../../lib/projectUtils';
import type { ProjectMetaContract } from '../../config/contract';
import { useTranslation } from 'react-i18next'; // 🌟 引入国际化钩子

// ==========================================
// 1. Load Project Modal (加载现有项目)
// ==========================================
export function LoadProject({onClose}: {onClose: () => void}) {
  const { t } = useTranslation();
  // 🌟 引入 resetProject
  const { loadProjectMeta, setActiveModule, resetProject } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 🌟 拦截 1：提醒用户保存
    const confirmMsg = t('createProject.confirmReset', "⚠️ Current workspace will be cleared. Please ensure you have exported your annotations. Continue?");
    if (!window.confirm(confirmMsg)) {
      if (fileInputRef.current) fileInputRef.current.value = ''; // 允许重复选同一文件
      return;
    }

    try {
      setError('');
      const meta = await readProjectJsonFile(file);
      
      resetProject(); // 🌟 拦截 2：彻底清空旧项目
      loadProjectMeta(meta); 
      
      setActiveModule('meta');
    } catch (err: any) {
      setError(err.message || t('loadProject.failLoad'));
    }
  };

  return (
    <div className="p-6 flex flex-col items-center justify-center space-y-4 bg-background h-full">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
        <FileJson className="w-8 h-8 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        {t('loadProject.descPre')} 
        <span className="text-foreground font-mono font-medium">project_meta.json</span> 
        {t('loadProject.descPost')}
      </p>
      
      {error && <div className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {error}</div>}

      <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
      
      <Button onClick={() => fileInputRef.current?.click()} className="w-full mt-2 font-semibold">
        {t('loadProject.browse')}
      </Button>
    </div>
  );
}

// ==========================================
// 2. Create New Project Modal (创建新项目)
// ==========================================
export function CreateProject({onClose }: {onClose: () => void }) {
  const { t } = useTranslation();
  
  // 🌟 引入 resetProject
  const { resetProject, setProjectName, loadProjectMeta, setActiveModule } = useStore();
  const [name, setName] = useState(t('createProject.defaultName'));
  const [importedMeta, setImportedMeta] = useState<ProjectMetaContract | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const meta = await readProjectJsonFile(file);
      setImportedMeta(meta); 
    } catch (err) {
      alert(t('createProject.invalidJson'));
    }
  };

  // 🌟 修复原本有语法冲突的函数，统一走 handleConfirm
  const handleConfirm = () => {
    if (!name.trim()) return;

    // 🌟 拦截 1：提醒用户保存
    const confirmMsg = t('createProject.confirmReset', "⚠️ Current workspace will be cleared. Please ensure you have exported your annotations. Continue?");
    if (!window.confirm(confirmMsg)) return;

    // 🌟 拦截 2：彻底清空旧项目
    resetProject();

    // 🌟 拦截 3：如果有导入的 meta 则加载
    if (importedMeta) {
      loadProjectMeta(importedMeta);
    }
    
    setProjectName(name);
    setActiveModule('preload');
    setImportedMeta(null); 
  };

  return (
    <div className="p-6 space-y-6 bg-background h-full flex flex-col">
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase">
          {t('createProject.nameLabel')}
        </label>
        <Input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="bg-muted border-input focus:border-primary font-medium text-foreground"
          placeholder={t('createProject.namePlaceholder')}
        />
      </div>

      <div className="p-4 rounded-lg border border-border bg-muted/50 space-y-3">
        <label className="text-xs font-bold text-muted-foreground uppercase block">
          {t('createProject.importLabel')}
        </label>
        <p className="text-[10px] text-muted-foreground">
          {t('createProject.importDesc')}
        </p>
        
        <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        
        <Button 
          variant="outline" 
          onClick={() => fileInputRef.current?.click()}
          className={`w-full text-xs transition-colors ${importedMeta ? 'border-primary/50 text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {importedMeta ? (
            <><Check className="w-3 h-3 mr-2" /> {t('createProject.paramsLoaded')}</>
          ) : (
            <><Upload className="w-3 h-3 mr-2" /> {t('createProject.loadJson')}</>
          )}
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-2 mt-auto">
        <Button variant="outline" onClick={onClose}>{t('createProject.cancel')}</Button>
        <Button className="font-semibold" onClick={handleConfirm}>
          {t('createProject.submit')}
        </Button>
      </div>
    </div>
  );
}