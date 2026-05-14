import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { COLOR_MAPS, BAND_COLORS, BAND_BASE_STYLE, BAND_UNSELECTED_STYLE } from '../../config/colors';
import { useTranslation } from 'react-i18next';

import { 
  FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2, History, Save, Eye, LogOut
} from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog'; 
import { Alert, AlertDescription } from '../ui/alert';
import { generateProjectMetaConfig } from '../../lib/projectUtils';
import { saveProjectMeta, analyzeWorkspaceFolders, checkWorkspaceJson } from '../../api/client';

export function DataPreload() {
  const { t } = useTranslation();
  const {folders, views, addFolder, removeFolder, clearFolders, addView, removeView, updateView, clearViews, setActiveModule, editorSettings } = useStore();
  
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string, suffix: string }[]>([]);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceCustom, setIsWorkspaceCustom] = useState(false);
  const [workspaceExplorerOpen, setWorkspaceExplorerOpen] = useState(false);
  const [isWorkspaceConfirming, setIsWorkspaceConfirming] = useState(false);
  const [isGlobalConfirming, setIsGlobalConfirming] = useState(false);

  const [workspaceHasJson, setWorkspaceHasJson] = useState(false);
  const [isCheckingWorkspace, setIsCheckingWorkspace] = useState(false);

  const workspaceStorePath = useStore(s => s.workspacePath);
  const setWorkspaceStorePath = useStore(s => s.setWorkspacePath);

  const mainViewFolder = useMemo(() => {
      const mainView = views.find(v => v.isMain);
      return folders.find(f => f.id === mainView?.folderId);
  }, [views, folders]);

  const maxViews = editorSettings.maxViews || 9;


  // 显示状态
  const workspaceStatus = isWorkspaceCustom ? 'defined' : 'default';

  // 1. 简化初始化逻辑
  useEffect(() => {
    if (workspaceStorePath && workspaceStorePath !== mainViewFolder?.path) {
      // Store 中有自定义路径，恢复 defined 状态
      setWorkspacePath(workspaceStorePath);
      setIsWorkspaceCustom(true);
      checkWorkspaceForJson(workspaceStorePath);
    } else if (mainViewFolder?.path) {
      checkWorkspaceForJson(mainViewFolder.path);
    }
  }, []);

  // 2. 简化 useEffect - 只在 default 状态下跟随 mainViewFolder
  useEffect(() => {
    if (!isWorkspaceCustom && mainViewFolder?.path) {
      setWorkspacePath(mainViewFolder.path);
      checkWorkspaceForJson(mainViewFolder.path);
    }
  }, [mainViewFolder?.path, isWorkspaceCustom]);

  // 加载历史路径
  useEffect(() => {
    const savedHistory = localStorage.getItem('multiAnno_recentPaths');
    if (savedHistory) {
      try {
        setRecentPaths(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);
  const checkWorkspaceForJson = async (path: string) => {
    if (!path) return;
    
    setIsCheckingWorkspace(true);
    try {
      const data = await checkWorkspaceJson(path);
      setWorkspaceHasJson(data.hasJson || false);
    } catch (error) {
      console.error('Failed to check workspace:', error);
      setWorkspaceHasJson(false);
    } finally {
      setIsCheckingWorkspace(false);
    }
  };
  const savePathsToHistory = (paths: string[]) => {
    setRecentPaths(prev => {
        let newHistory = [...prev];
        
        paths.forEach(path => {
            const trimmed = path.trim().replace(/\\/g, '/'); 
            if (trimmed) {
                newHistory = newHistory.filter(p => p !== trimmed); 
                newHistory.unshift(trimmed); 
            }
        });
        
        const updated = newHistory.slice(0, 5);
        localStorage.setItem('multiAnno_recentPaths', JSON.stringify(updated));
        return updated; 
    });
  };

  const handleAddPlaceholder = () => setPlaceholders([...placeholders, { id: Math.random().toString(36).slice(2, 11), path: '', suffix: '' }]);
  const handleAddFromHistory = (path: string) => setPlaceholders(prev => [...prev, { id: Math.random().toString(36).slice(2, 11), path, suffix: '' }]);
  const handleRemovePlaceholder = (id: string) => setPlaceholders(placeholders.filter(p => p.id !== id));
  const handleUpdatePath = (id: string, newPath: string) => setPlaceholders(placeholders.map(p => p.id === id ? { ...p, path: newPath } : p));
  const openExplorerFor = (id: string) => { setActivePlaceholderId(id); setExplorerOpen(true); };

  const handleFolderSelectConfirm = (selectedPaths: string[]) => {
    if (selectedPaths.length === 0 || !activePlaceholderId) return;
    const newPlaceholders = [...placeholders];
    const targetIndex = newPlaceholders.findIndex(p => p.id === activePlaceholderId);

    if (targetIndex !== -1) {
      newPlaceholders[targetIndex].path = selectedPaths[0];
      const extraPlaceholders = selectedPaths.slice(1).map(path => ({
        id: Math.random().toString(36).slice(2, 11),
        path: path
      }));
      newPlaceholders.splice(targetIndex + 1, 0, ...extraPlaceholders);
    }
    setPlaceholders(newPlaceholders);
    setExplorerOpen(false);
    savePathsToHistory(selectedPaths);
  };
  const handleWorkspaceSelectConfirm = (paths: string[]) => {
    if (paths.length > 0) {
      setWorkspacePath(paths[0]);
      setIsWorkspaceCustom(true); // 🆕 手动选择，切换为 defined
    }
    setWorkspaceExplorerOpen(false);
  };
  const cancelFolders = () => {
    if (window.confirm(t('dataPreload.alerts.cancelFolders'))) { // 🌟
      setPlaceholders([]);
      clearFolders();
      clearViews();
    }
  };

  const confirmFolders = async () => {
    const validPlaceholders = placeholders.filter(p => p.path.trim() !== "");
    if (validPlaceholders.length === 0) return;
    setIsConfirming(true);
    
    try {
      const payloadData = validPlaceholders.map(p => ({ path: p.path.trim(), suffix: p.suffix.trim() }));

      const result = await analyzeWorkspaceFolders(payloadData);
      const backendData = result.data;

      if (!backendData || backendData.length === 0) {
        alert(t('dataPreload.alerts.noImagesFound')); // 🌟
        setIsConfirming(false);
        return;
      }

      backendData.forEach((folderMeta: any, index: number) => {
        const originalPath = payloadData[index].path; 
        const originalSuffix = payloadData[index].suffix;
        addFolder({
          id: `folder-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          path: folderMeta.folderPath || originalPath, 
          suffix: originalSuffix,
          files: [], 
          metadata: {
            width: folderMeta.width || 1024,
            height: folderMeta.height || 1024,
            bands: folderMeta.bands || 3,
            fileType: folderMeta.dtype || 'TIFF',
            dataType: "Remote Sensing Imagery",
            sceneGroupsLoaded: folderMeta.group_success || 0, 
            sceneGroupsSkipped: folderMeta.group_fail || 0
          }
        });
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
        useStore.getState().setSceneGroups(result.sceneGroups);
      } else {
        alert(t('dataPreload.alerts.noCommonStems')); // 🌟
      }
      
      savePathsToHistory(payloadData.map(p => p.path));
      setPlaceholders([]);
    } catch (error) {
      console.error("Error connecting to backend:", error);
      alert(t('dataPreload.alerts.backendFailed')); // 🌟
    } finally {
      setIsConfirming(false);
    }
  };

  const handleResetViews = () => {
    if (window.confirm(t('dataPreload.alerts.resetViews'))) { // 🌟
      clearViews();
    }
  };

  const handleAddView = () => {
    if (views.length >= maxViews) return;
    addView({
      id: Math.random().toString(36).slice(2, 11),
      folderId: '',
      bands: [1, 2, 3],
      isMain: views.length === 0,
      opacity: 1,
      transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
    });
  };

  
  // 🆕 Workspace 确认处理
  const handleWorkspaceConfirm = async () => {
    const finalPath = isWorkspaceCustom 
      ? workspacePath 
      : mainViewFolder?.path || '';
      
    if (!finalPath) return;
    
    setIsWorkspaceConfirming(true);
    setWorkspaceStorePath(finalPath);
    await checkWorkspaceForJson(finalPath);
    setIsWorkspaceConfirming(false);
  };

  // 🆕 Workspace 取消/重置
  const handleWorkspaceReset = () => {
    setWorkspacePath(mainViewFolder?.path || '');
    setIsWorkspaceCustom(false);
  };
  // 🆕 全局最终确认 - 进入工作区
  const handleGlobalConfirm = async () => {
    if (folders.length === 0) {
      alert(t('dataPreload.alerts.noFoldersConfigured'));
      return;
    }
    if (!mainViewFolder) {
      alert(t('dataPreload.alerts.noMainView'));
      return;
    }

    setIsGlobalConfirming(true);
    try {
      // 确保 workspace 路径已保存
      const finalPath = isWorkspaceCustom ? workspacePath : mainViewFolder?.path || '';
      if (finalPath) {
        setWorkspaceStorePath(finalPath);
      }

      const projectMeta = generateProjectMetaConfig(useStore.getState());
      const metaPath = useStore.getState().projectMetaPath;
      if (metaPath) {
        await saveProjectMeta({ file_path: metaPath, content: projectMeta });
      }
      
      setActiveModule('extent');
    } catch (err) {
      console.error("Failed to enter workspace:", err);
      alert("配置保存失败，请检查路径权限");
    } finally {
      setIsGlobalConfirming(false);
    }
  };

  // 🆕 退出
  const handleExit = () => {
    if (window.confirm(t('dataPreload.alerts.confirmExit'))) {
      setActiveModule('workspace'); // 或者其他初始模块
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 p-6 overflow-hidden">

      {/* ============ 上半部分：左右两栏 ============ */}
      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">

        {/* 左侧：Folders + Workspace */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Folders Card */}
          <Card className="flex flex-col flex-1 min-h-0 transition-colors">
            <CardHeader className="shrink-0 pb-4 border-b">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" /> 
                  {t('dataPreload.folders.title')}
                </div>
                <Button onClick={handleAddPlaceholder} variant="outline" size="sm" disabled={isConfirming}>
                  <Plus className="w-4 h-4 mr-2" /> 
                  {t('dataPreload.folders.add')}
                </Button>
              </CardTitle>
            </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col custom-scrollbar">
          <div className="flex-1 space-y-3">
            {recentPaths.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 rounded-lg border border-border border-dashed mb-4">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <History className="w-3 h-3"/> {t('dataPreload.folders.recent')}
                </span>
                {recentPaths.map((path) => (
                  <button
                    key={path}
                    onClick={() => handleAddFromHistory(path)}
                    className="text-[10px] bg-secondary hover:bg-secondary/80 text-secondary-foreground px-2 py-1 rounded border border-border transition-colors truncate max-w-[200px]"
                    title={`${t('dataPreload.folders.clickToAdd')} ${path}`} // 🌟 完美翻译
                  >
                    + {path}
                  </button>
                ))}
              </div>
            )}

            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-background rounded-md border"><FolderOpen className="w-6 h-6 text-primary" /></div>
                  <div>
                    <h3 className="font-semibold max-w-[300px]" title={folder.path}>
                        {(() => {
                            const path = folder.path;
                            const len = path.length;
                            const showLen = Math.floor(len * 0.8);
                            const first = path.slice(0, Math.floor(showLen * 0.5));
                            const last = path.slice(-Math.floor(showLen * 0.5));
                            return (
                                <span className="inline-flex items-center min-w-0">
                                    <span className="truncate">{first}</span>
                                    <span className="whitespace-nowrap flex-shrink-0">&nbsp;...&nbsp;</span>
                                    <span className="whitespace-nowrap flex-shrink-0">{last}</span>
                                </span>
                            );
                        })()}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>{t('dataPreload.folders.size')} {folder.metadata.width}x{folder.metadata.height}</span>
                      <span>{t('dataPreload.folders.bands')} {folder.metadata.bands}</span>
                      <span className="text-green-600 dark:text-green-400">{t('dataPreload.folders.loaded')} {folder.metadata.sceneGroupsLoaded}</span>
                      {folder.metadata.sceneGroupsSkipped ? (<span className="text-destructive">{t('dataPreload.folders.skipped')} {folder.metadata.sceneGroupsSkipped}</span>) : null}
                      {folder.suffix && (
                        <span className="text-amber-500 font-mono font-bold bg-amber-500/10 px-1.5 rounded">
                          {t('dataPreload.folders.suffix')} {folder.suffix}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive flex-shrink-0" onClick={() => removeFolder(folder.id)} disabled={isConfirming}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {folders.length === 0 && placeholders.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <UploadCloud className="w-10 h-10 mb-2 opacity-50" />
                <p>{t('dataPreload.folders.emptyHint')}</p>
              </div>
            )}

            {placeholders.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-primary/5 border border-dashed border-primary/50 rounded-lg">
                <button 
                  onClick={() => openExplorerFor(item.id)}
                  className="p-2 bg-background rounded-md border border-dashed border-neutral-600 hover:border-primary hover:text-primary transition-colors group flex-shrink-0"
                  disabled={isConfirming}
                >
                  <FolderOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </button>
                <div className="flex-1 min-w-0">
                  <Input 
                    value={item.path} 
                    onChange={(e) => handleUpdatePath(item.id, e.target.value)}
                    placeholder={t('dataPreload.folders.pathPlaceholder')}
                    className="font-mono text-xs bg-background h-8"
                    disabled={isConfirming}
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Input 
                    value={item.suffix} 
                    onChange={(e) => setPlaceholders(placeholders.map(p => p.id === item.id ? { ...p, suffix: e.target.value } : p))}
                    placeholder={t('dataPreload.folders.suffixPlaceholder')}
                    className="font-mono text-xs bg-background h-8"
                    disabled={isConfirming}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemovePlaceholder(item.id)} className="text-destructive flex-shrink-0" disabled={isConfirming}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Folders 底部按钮 */}
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">
              {placeholders.length} {t('dataPreload.folders.pendingCount')}
            </span>
            <Button onClick={cancelFolders} variant="outline" disabled={(placeholders.length === 0 && folders.length === 0) || isConfirming}>
              <X className="w-4 h-4 mr-2" /> {t('common.reset')}
            </Button>
            <Button onClick={confirmFolders} variant="default" className="text-white" disabled={placeholders.length === 0 || isConfirming}>
              {isConfirming ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('dataPreload.folders.analyzing')}</>
              ) : (
                <><Check className="w-4 h-4 mr-2" /> {t('common.confirm')}</>
              )}
            </Button>
          </div>
        </CardContent>
          </Card>
      
          {/* Workspace Card */}
          <Card className="flex flex-col min-h-0 transition-colors">
            <CardHeader className="shrink-0 pb-3 border-b">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  {t('dataPreload.workspace.title') || 'Workspace'}
                  
                  {/* 🆕 状态标签 - 三种状态 */}
                  {isCheckingWorkspace ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-muted text-muted-foreground">
                      <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                      checking...
                    </span>
                  ) : workspaceHasJson ? (
                    /* 🔒 locked 状态 */
                    <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      locked
                    </span>
                  ) : (
                    /* default 或 defined 状态 */
                    <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${
                      workspaceStatus === 'default'
                        ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    }`}>
                      {workspaceStatus}
                    </span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col custom-scrollbar">
              <div className="flex-1 space-y-3">
                {folders.length > 0 ? (
                  <>
                    <Label className="text-xs text-muted-foreground">
                      {t('dataPreload.workspace.description') || 'Annotation save path'}
                    </Label>

                    {/* 🆕 有 JSON 文件时显示锁定信息 */}
                    {workspaceHasJson && !isCheckingWorkspace ? (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                          <Info className="w-4 h-4 flex-shrink-0" />
                          <span className="text-xs font-medium">
                            Workspace contains annotation files. Path is locked.
                          </span>
                        </div>
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-mono truncate bg-amber-100/50 dark:bg-amber-900/50 px-2 py-1 rounded">
                          {workspacePath || mainViewFolder?.path}
                        </div>
                      </div>
                    ) : (
                      /* 无 JSON 文件，正常可编辑 */
                      <div className="space-y-2">
                        <div className="relative">
                          <Input
                            value={isWorkspaceCustom ? workspacePath : (mainViewFolder?.path || '')}
                            placeholder={mainViewFolder?.path || 'default'}
                            onChange={e => {
                              const val = e.target.value;
                              setWorkspacePath(val);
                              setIsWorkspaceCustom(!!(val && val !== mainViewFolder?.path));
                            }}
                            className={`h-8 text-xs pr-8 font-mono bg-background ${
                              !isWorkspaceCustom ? 'text-muted-foreground' : 'text-foreground'
                            }`}
                            disabled={isWorkspaceConfirming || isCheckingWorkspace}
                          />
                          <button
                            onClick={() => setWorkspaceExplorerOpen(true)}
                            disabled={isWorkspaceConfirming || isCheckingWorkspace}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            <FolderOpen size={13} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t('dataPreload.workspace.default') || 'Default'}:</span>
                          <span className="font-mono truncate" title={mainViewFolder?.path}>
                            {mainViewFolder?.path || t('dataPreload.workspace.notSet') || 'Not set'}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <FolderOpen className="w-10 h-10 mb-2 opacity-50" />
                    <p className="text-sm text-center">
                      {t('dataPreload.workspace.noFoldersHint') || 'Add folders first to configure workspace path'}
                    </p>
                  </div>
                )}
              </div>

              {/* 🆕 底部按钮 - 始终显示，根据状态禁用 */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
                <Button 
                  onClick={handleWorkspaceReset} 
                  variant="outline" 
                  disabled={!isWorkspaceCustom || isWorkspaceConfirming || workspaceHasJson}
                >
                  <X className="w-4 h-4 mr-2" /> 
                  {t('common.reset') || 'Reset'}
                </Button>
                <Button 
                  onClick={handleWorkspaceConfirm} 
                  variant="default"
                  className="text-white" 
                  disabled={isWorkspaceConfirming || isCheckingWorkspace || (!workspacePath && !mainViewFolder?.path)}
                >
                  {isWorkspaceConfirming ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('common.saving') || 'Saving...'}</>
                  ) : (
                    <><Check className="w-4 h-4 mr-2" /> {t('common.confirm') || 'Confirm'}</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>


      {/* 右侧：Views Configuration */}
        <Card className="flex flex-col flex-1 min-h-0">
          <CardHeader className="shrink-0 pb-4 border-b">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5" /> 
                {t('dataPreload.views.title')}
              </div>
              <Button onClick={handleAddView} variant="outline" size="sm" disabled={views.length >= maxViews}>
                <Plus className="w-4 h-4 mr-2" /> 
                {t('dataPreload.views.addView')} 
                {views.length >= maxViews && t('headerSetting.maxViews')}
              </Button>
            </CardTitle>
          </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col custom-scrollbar">
          <div className="flex-1 space-y-4">
            {views.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                {t('dataPreload.views.emptyHint')}
              </div>
            ) : (
              views.map((view, index) => (
                <div key={view.id} className="flex flex-col p-4 border rounded-xl bg-card shadow-sm border-border">
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full shrink-0 ${view.isMain ? 'bg-primary text-white shadow-md' : 'bg-background border border-border text-muted-foreground'}`}>
                      {view.isMain ? t('dataPreload.views.mainView') : `${t('dataPreload.views.augView')} ${index}`}
                    </span>
                    <div className="flex-1 flex items-center gap-3">
                      <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider shrink-0">{t('dataPreload.views.sourceFolder')}</Label>
                      <Select 
                        value={view.folderId} 
                        onValueChange={(val) => {
                          const selectedFolder = folders.find(f => f.id === val);
                          const numBands = selectedFolder?.metadata?.bands || 3;
                          const newBands = numBands >= 3 ? [1, 2, 3] : [1];
                          updateView(view.id, { folderId: val, bands: newBands, colormap: 'gray' });
                        }}
                      >
                        {/* 🌟 修改点：使用 bg-background, text-foreground, bg-popover */}
                        <SelectTrigger className="h-8 w-[200px] bg-background border-input text-foreground text-xs font-medium shadow-sm flex-1 min-w-0 overflow-hidden">
                            <SelectValue placeholder={t('dataPreload.views.selectFolder')}>
                              {view.folderId ? (() => {
                                  const path = folders.find(f => f.id === view.folderId)?.path || '';
                                  if (!path) return t('dataPreload.views.selectFolder');
                                  const len = path.length;
                                  const showLen = Math.floor(len * 0.8);
                                  const first = path.slice(0, Math.floor(showLen * 0.5));
                                  const last = path.slice(-Math.floor(showLen * 0.5));
                                  return (
                                      <span className="inline-flex items-center min-w-0" title={path}>
                                          <span className="truncate">{first}</span>
                                          <span className="whitespace-nowrap flex-shrink-0">&nbsp;...&nbsp;</span>
                                          <span className="whitespace-nowrap flex-shrink-0">{last}</span>
                                      </span>
                                  );
                              })() : t('dataPreload.views.selectFolder')}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {folders.map(f => (
                            <SelectItem key={f.id} value={f.id} className="text-xs text-popover-foreground focus:bg-accent focus:text-accent-foreground">{f.path}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button variant="ghost" size="icon" className="text-neutral-500 dark:text-neutral-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 shrink-0" onClick={() => removeView(view.id)} disabled={view.isMain && views.length > 1} >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {view.folderId && (() => {
                    const selectedFolder = folders.find(f => f.id === view.folderId);
                    const totalBands = selectedFolder?.metadata?.bands || 0;
                    const isNotUint8 = selectedFolder?.metadata?.fileType && !selectedFolder.metadata.fileType.toLowerCase().includes('uint8');

                    return (
                      <div className="mt-4 p-4 bg-background border border-border rounded-lg shadow-sm flex flex-col gap-4">
                        {isNotUint8 && (
                          <Alert variant="warning" className="py-2 px-3 animate-in fade-in [&>svg]:translate-y-0 [&>svg]:mt-[1px]">
                            <Info className="w-3.5 h-3.5" />
                            <AlertDescription className="text-[10px] leading-relaxed">
                              <strong>{t('dataPreload.views.stretchTitle')}</strong> {t('dataPreload.views.stretchDesc1')} <code className="bg-black/5 dark:bg-white/10 px-1 rounded font-mono">{selectedFolder.metadata.fileType}</code>. {t('dataPreload.views.stretchDesc2')}
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="grid grid-cols-2 gap-6 items-center">
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider block">
                              {t('dataPreload.views.selectChannels')}
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => {
                                const isSelected = view.bands.includes(b);
                                const selectedStyle = isSelected ? (BAND_COLORS[(b - 1) % BAND_COLORS.length] + " border-2") : BAND_UNSELECTED_STYLE;
                                return (
                                  <button 
                                    key={b} 
                                    onClick={() => {
                                      let active = [...view.bands];
                                      if (active.includes(b)) active = active.filter(band => band !== b);
                                      else active.push(b);
                                      updateView(view.id, { bands: active });
                                    }} 
                                    className={`${BAND_BASE_STYLE} ${selectedStyle}`}
                                  >
                                    {b}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-l border-neutral-100 pl-6 h-full flex flex-col justify-center">
                            {view.bands.length === 1 ? (
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                              <div className="space-y-1">
                                <Label className="text-xs text-neutral-600">{t('dataPreload.views.displayBand')}</Label>
                                <Select value={view.bands[0].toString()} onValueChange={(val) => updateView(view.id, { bands: [parseInt(val)] })}>
                                  <SelectTrigger className="h-8 bg-background border-input text-foreground text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-popover border-border">
                                    {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => (
                                      <SelectItem key={b} value={b.toString()} className="text-xs text-popover-foreground focus:bg-accent focus:text-accent-foreground">{t('dataPreload.views.band')} {b}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                                <div className="space-y-1">
                                  <Label className="text-xs text-amber-600 font-medium">{t('dataPreload.views.colorMap')}</Label>
                                  <Select value={view.colormap || 'gray'} onValueChange={(val: any) => updateView(view.id, { colormap: val})}>
                                    <SelectTrigger className="h-8 bg-background border-input text-foreground text-xs">
                                      <SelectValue>
                                        {(() => {
                                          // 🌟 统一从 config/colors.ts 引入 COLOR_MAPS
                                          const currentMap = COLOR_MAPS.find(cm => cm.name === (view.colormap || 'gray'));
                                          if (currentMap) {
                                            return (
                                              <div className="flex items-center gap-2">
                                                {/* 🌟 修复：使用 bg-gradient-to-r 和全局定义的 css 类名 */}
                                                <div className={`w-6 h-3 rounded-sm shadow-inner border border-neutral-300 shrink-0 bg-gradient-to-r ${currentMap.css}`} />
                                                <span className="capitalize font-medium">{currentMap.label}</span>
                                              </div>
                                            );
                                          }
                                          return t('dataPreload.views.selectColormap');
                                        })()}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover border-border">
                                      {COLOR_MAPS.map(cm => (
                                        <SelectItem key={cm.name} value={cm.name} className="text-xs text-popover-foreground focus:bg-accent focus:text-accent-foreground">
                                          <div className="flex items-center gap-2">
                                            {/* 🌟 修复：统一使用渐变色预览 */}
                                            <div className={`w-12 h-3.5 rounded-sm shadow-inner border border-neutral-300 shrink-0 bg-gradient-to-r ${cm.css}`} />
                                            <span className="capitalize font-medium">{cm.label}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>


                            </div>
                            ) : view.bands.length === 3 ? (
                            <div className="space-y-2 animate-in fade-in duration-200">
                              <Label className="text-xs text-neutral-600">{t('dataPreload.views.rgbMapping')}</Label>
                              <div className="flex gap-2">
                                {['R', 'G', 'B'].map((channel, idx) => (
                                  <div key={channel} className="flex-1">
                                    <Select 
                                      value={view.bands[idx]?.toString()} 
                                      onValueChange={(val) => {
                                        const newBands = [...view.bands]; 
                                        newBands[idx] = parseInt(val);
                                        updateView(view.id, { bands: newBands });
                                      }}
                                    >
                                      <SelectTrigger className={`h-8 w-full bg-background border-input text-foreground text-xs focus:ring-1 ${channel==='R'?'focus:ring-red-500':channel==='G'?'focus:ring-green-500':'focus:ring-blue-500'}`}>
                                        <div className="flex items-center gap-1.5">
                                          <span className={`font-black text-[11px] ${channel==='R'?'text-red-600':channel==='G'?'text-green-600':'text-blue-600'}`}>
                                            {channel}
                                          </span>
                                          <span className="text-neutral-300">|</span>
                                          <SelectValue />
                                        </div>
                                      </SelectTrigger>
                                      <SelectContent className="bg-popover border-border">
                                        {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => (
                                          <SelectItem key={b} value={b.toString()} className="text-xs text-popover-foreground focus:bg-accent focus:text-accent-foreground">
                                            {t('dataPreload.views.band')} {b}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}
                              </div>
                            </div>
                            ) : (
                              <Alert variant="warning" className="flex items-center justify-center py-2 h-[56px] animate-in fade-in [&>svg]:translate-y-0">
                                <Info className="w-4 h-4 mr-2" />
                                <AlertDescription className="text-xs m-0 font-medium">
                                  {t('dataPreload.views.select1or3')}
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>
              ))
            )}
          </div>
        </CardContent>
        </Card>
    </div>


      {/* ============ 底部：全局操作栏 ============ */}
      <div className="flex items-center justify-between p-4 bg-card border rounded-lg shadow-sm shrink-0">
        {/* 左侧状态信息 */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Folders:</span>
            <span className="font-semibold">{folders.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Views:</span>
            <span className="font-semibold">{views.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Save className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Workspace:</span>
            <span className={`font-semibold ${
              workspaceStatus === 'default' 
                ? 'text-gray-500 dark:text-gray-400' 
                : 'text-blue-600 dark:text-blue-400'
            }`}>
              {workspaceStatus === 'default' ? 'default' : 'defined'}
            </span>
          </div>
        </div>

        {/* 右侧操作按钮 */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleExit}
            variant="outline"
            size="sm"
            disabled={isGlobalConfirming}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t('common.exit') || 'Exit'}
          </Button>
          

          <Button
            onClick={handleGlobalConfirm}
            variant="default"
            size="sm"
            className="text-white font-semibold"
            disabled={folders.length === 0 || isGlobalConfirming}
          >
            {isGlobalConfirming ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Entering...</>
            ) : (
              <><Check className="w-4 h-4 mr-2" /> {t('dataPreload.confirmAndAlign') || 'Confirm & Start Align'}</>
            )}
          </Button>
        </div>
      </div>

      <FileExplorerDialog 
        open={explorerOpen}
        initialPath={activePlaceholderId ? placeholders.find(p => p.id === activePlaceholderId)?.path || '' : ''}
        onClose={() => setExplorerOpen(false)}
        onConfirm={handleFolderSelectConfirm}
        selectType={explorerMode}
      />
      <FileExplorerDialog 
        open={workspaceExplorerOpen}
        initialPath={workspacePath || mainViewFolder?.path || ''}
        onClose={() => setWorkspaceExplorerOpen(false)}
        onConfirm={handleWorkspaceSelectConfirm}
        selectType={explorerMode}
      />
    </div>
  );
}