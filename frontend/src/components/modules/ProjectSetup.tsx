// src/components/modals/ProjectSetupModals.tsx
import React, { useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { X, FolderPlus, Upload, FileJson, Check, AlertCircle, FolderSearch } from 'lucide-react';
import { saveProjectMeta, loadProjectMetaFromServer, analyzeWorkspaceFolders } from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog'; // 引入你的文件选择器
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { readProjectJsonFile } from '../../lib/projectUtils';
import type { ProjectMetaContract } from '../../config/contract';
import { useTranslation } from 'react-i18next'; // 🌟 引入国际化钩子
import { loadAllProjectAnnotations } from '../../lib/projectUtils';

// ==========================================
// Create New Project Modal
// ==========================================
export function CreateProject({onClose }: {onClose: () => void }) {
  const { t } = useTranslation();
  const { resetProject, setProjectName, loadProjectMeta, setProjectMetaPath, setActiveModule } = useStore();
  const [name, setName] = useState(t('createProject.defaultName'));
  const [metaPath, setMetaPath] = useState(''); // 🌟 用户指定的保存路径
  const [explorerOpen, setExplorerOpen] = useState(false);
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
  const handleConfirm = async () => {
    if (!name.trim() || !metaPath.trim()) return alert("请填写项目名称并选择保存位置！");
    
    resetProject();
    setProjectName(name);
    setProjectMetaPath(metaPath);

    try {
      await saveProjectMeta({
        file_path: metaPath,
        content: {
          projectName: name,
          folders: [], views: [], taxonomyClasses: [], taxonomyAttributes: []
        }
      });
      setActiveModule('preload');
    } catch (e) {
      alert("无法在目标路径创建项目文件！");
    }
  };

  return (
    <div className="p-6 space-y-6 bg-background h-full flex flex-col">
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase">{t('createProject.nameLabel')}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-muted" />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase">项目元数据保存位置</label>
        <Button variant="outline" className="w-full justify-start text-xs font-mono truncate" onClick={() => setExplorerOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> {metaPath || "点击选择存放路径..."}
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-2 mt-auto">
        <Button variant="outline" onClick={onClose}>{t('createProject.cancel')}</Button>
        <Button className="font-semibold" onClick={handleConfirm}>{t('createProject.submit')}</Button>
      </div>

      <FileExplorerDialog 
        open={explorerOpen} initialPath="/" 
        selectType="save" 
        defaultSaveName={`${name.replace(/\s+/g, '_')}_meta.json`} // 自动生成默认名
        onClose={() => setExplorerOpen(false)}
        onConfirm={(paths) => { setMetaPath(paths[0]); setExplorerOpen(false); }}
      />
    </div>
  );
}


// ==========================================
// 2. Load Project Modal (加载现有项目)
// ==========================================
export function LoadProject({onClose}: {onClose: () => void}) {
  const { t } = useTranslation();
  // 🌟 引入 resetProject
  const { loadProjectMeta, setActiveModule, resetProject } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');
  const [explorerOpen, setExplorerOpen] = useState(false);

  const handleScanDirectory = async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    const targetDir = paths[0];

    const confirmMsg = t('createProject.confirmReset', "⚠️ 当前工作区将被清空，请确保已保存数据。继续？");
    if (!window.confirm(confirmMsg)) return;

    try {
      setError('');
      // 去后端查这个目录下有没有 project_meta.json
      const meta = await loadProjectMetaFromServer(targetDir);
      
      if (!meta) {
        setError(`在目录 ${targetDir} 中未发现 project_meta.json，这是一个新项目。请使用"Create Project"创建。`);
        return;
      }

      resetProject();
      loadProjectMeta(meta); 
      setActiveModule('meta');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || t('loadProject.failLoad'));
    }
  };

  const handleLoadFile = async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    const filePath = paths[0];

    try {
      // 1. 读取并恢复配置
      const meta = await loadProjectMetaFromServer(filePath);
      resetProject();
      useStore.getState().setProjectMetaPath(filePath); 
      loadProjectMeta(meta); 

      // 🌟 2. 核心：调用统一的 API 进行静默扫描
      if (meta.folders && meta.folders.length > 0) {
        try {
          const payloadData = meta.folders.map((f: any) => ({
            path: f.path,
            suffix: f.suffix || ''
          }));

          // 使用刚刚封装的 API，代码一目了然
          const result = await analyzeWorkspaceFolders(payloadData);
          
          if (result.commonStems && result.commonStems.length > 0) {
            useStore.getState().setStems(result.commonStems);
            useStore.getState().setSceneGroups(result.sceneGroups);
            useStore.getState().setCurrentStem(result.commonStems[0]);

            const mainViewFolderId = meta.views.find((v:any) => v.isMain)?.["folder id"];
            const mainFolder = meta.folders.find((f:any) => f.Id === mainViewFolderId) || meta.folders[0];
            
            if (mainFolder && mainFolder.path) {
               // 不用 await 阻塞它，让它在后台默默去扫，我们直接进入工作区即可！
               loadAllProjectAnnotations(result.commonStems, mainFolder.path);
            }
          }
        } catch (analyzeError) {
          console.warn("静默扫描文件夹失败，可能是移动了硬盘或目录:", analyzeError);
        }
      }

      // 3. 进入工作区
      setActiveModule('workspace');
      if (onClose) onClose();
    } catch (err: any) {
      setError("读取项目失败，请确保选择了合法的 meta.json 文件");
    }
  };
  return (
    <div className="p-6 flex flex-col items-center justify-center space-y-4 bg-background h-full">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
        <FolderSearch className="w-8 h-8 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        选择包含 
        <span className="text-foreground font-mono font-medium mx-1">project_meta.json</span> 
        的工作区文件夹，系统将自动恢复您的所有图层、类别和属性设置。
      </p>
      
      {error && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded flex items-start gap-1 text-left w-full"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> {error}</div>}
      
      {/* 🌟 核心：改为打开目录选择器 */}
      <Button onClick={() => setExplorerOpen(true)} className="w-full mt-2 font-semibold">
        扫描并加载工作区 (Scan Workspace)
      </Button>

      {/* 复用你已有的文件浏览器组件 */}
      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath="/" 
        selectType="file"
        onClose={() => setExplorerOpen(false)} 
        onConfirm={(paths) => {
          setExplorerOpen(false);
          handleLoadFile(paths);
        }} 
      />
    </div>
  );
}