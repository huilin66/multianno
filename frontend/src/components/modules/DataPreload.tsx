// src/components/modules/DataPreload.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert } from '../ui/alert';
import { Legend } from '../ui/legend';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { COLOR_MAPS, BAND_COLORS, BAND_UNSELECTED_STYLE } from '../../config/colors';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../../config/supportedFormats';
import { generateProjectMetaConfig } from '../../lib/projectUtils';
import { saveProjectMeta, analyzeWorkspaceFolders, checkWorkspaceJson, inferSuffix } from '../../api/client';
import {
  FolderOpen, Plus, Trash2, Info, UploadCloud, History,
  ChevronRight, RotateCcw, Search
} from 'lucide-react';

export function DataPreload({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const {
    folders, views, addFolder, removeFolder, clearFolders, updateFolder,
    addView, removeView, updateView, clearViews,
    setActiveModule, editorSettings
  } = useStore();

  const [activeStep, setActiveStep] = useState('folders');
  const [placeholders, setPlaceholders] = useState<{ id: string; path: string; suffix: string }[]>([]);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [inferredData, setInferredData] = useState<Record<string, { suffix: string; extension: string; sample: string }>>({});
  const [newFolderPath, setNewFolderPath] = useState('');

  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceCustom, setIsWorkspaceCustom] = useState(false);
  const [workspaceExplorerOpen, setWorkspaceExplorerOpen] = useState(false);
  const [isWorkspaceConfirming, setIsWorkspaceConfirming] = useState(false);
  const [workspaceHasJson, setWorkspaceHasJson] = useState(false);
  const [isCheckingWorkspace, setIsCheckingWorkspace] = useState(false);

  const [isGlobalConfirming, setIsGlobalConfirming] = useState(false);

  const maxViews = editorSettings.maxViews || 9;
  const workspaceStorePath = useStore(s => s.workspacePath);
  const setWorkspaceStorePath = useStore(s => s.setWorkspacePath);

  const mainViewFolder = useMemo(() => {
    const mainView = views.find(v => v.isMain);
    return folders.find(f => f.id === mainView?.folderId);
  }, [views, folders]);

  const workspaceStatus = isWorkspaceCustom ? 'defined' : 'default';

  const originalPaths = useRef<Record<string, string>>({});

  // ==========================================
  // 初始化
  // ==========================================
  useEffect(() => {
    if (workspaceStorePath && workspaceStorePath !== mainViewFolder?.path) {
      setWorkspacePath(workspaceStorePath);
      setIsWorkspaceCustom(true);
      checkWorkspaceForJson(workspaceStorePath);
    } else if (mainViewFolder?.path) {
      checkWorkspaceForJson(mainViewFolder.path);
    }
  }, []);

  useEffect(() => {
    if (!isWorkspaceCustom && mainViewFolder?.path) {
      setWorkspacePath(mainViewFolder.path);
      checkWorkspaceForJson(mainViewFolder.path);
    }
  }, [mainViewFolder?.path, isWorkspaceCustom]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('multiAnno_recentPaths');
    if (savedHistory) {
      try { setRecentPaths(JSON.parse(savedHistory)); }
      catch (e) { console.error("Failed to parse history", e); }
    }
  }, []);

  useEffect(() => {
    folders.forEach(f => {
      if (!originalPaths.current[f.id]) {
        originalPaths.current[f.id] = f.path;
      }
    });
  }, [folders]);

  // ==========================================
  // 步骤定义
  // ==========================================
  const steps = useMemo(() => [
    { id: 'folders', label: t('dataPreload.steps.folders'), required: true },
    { id: 'views', label: t('dataPreload.steps.views'), required: true },
    { id: 'workspace', label: t('dataPreload.steps.workspace'), required: true },
  ], [t]);

  const getStepStatus = (stepId: string): 'current' | 'done' | 'pending' => {
    if (activeStep === stepId) return 'current';
    switch (stepId) {
      case 'folders': return folders.length > 0 ? 'done' : 'pending';
      case 'views': return views.length > 0 ? 'done' : 'pending';
      case 'workspace': return workspaceHasJson || isWorkspaceCustom ? 'done' : 'pending';
      default: return 'pending';
    }
  };

  // ==========================================
  // Folder 操作
  // ==========================================
  const checkWorkspaceForJson = async (path: string) => {
    if (!path) return;
    setIsCheckingWorkspace(true);
    try {
      const data = await checkWorkspaceJson(path);
      setWorkspaceHasJson(data.hasJson || false);
    } catch { setWorkspaceHasJson(false); }
    finally { setIsCheckingWorkspace(false); }
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

  const handleAddFolder = async (path: string) => {
    if (!path.trim()) return;
    setIsConfirming(true);
    try {
      await handleAutoAnalyze({ id: Math.random().toString(36).slice(2, 11), path: path.trim(), suffix: '' });
      setNewFolderPath('');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleFolderSelectConfirm = (selectedPaths: string[]) => {
    setExplorerOpen(false);
    if (selectedPaths.length > 0) {
      if (activePlaceholderId) {
        updateFolder(activePlaceholderId, { path: selectedPaths[0] });
      } else {
        handleAddFolder(selectedPaths[0]);
      }
    }
  };

  const handleAddFromHistory = (path: string) => {
    handleAddFolder(path);
  };

  const handleAutoAnalyze = async (item: { id: string; path: string; suffix: string }) => {
    if (!item.path.trim()) return;
    setIsConfirming(true);
    try {
      const existingFolders = folders.map(f => ({ path: f.path, suffix: f.suffix || '' }));
      const allFolders = [...existingFolders, { path: item.path.trim(), suffix: item.suffix.trim() }];

      const inferenceResult = await inferSuffix(allFolders);
      const infNew = inferenceResult.results?.find((r: any) => r.folder_index === allFolders.length - 1) || {};

      let cleanSuffix = item.suffix || infNew.suffix || '';
      let detectedExt = infNew.extension || '';
      const KNOWN_EXTS = [...SUPPORTED_IMAGE_EXTENSIONS].sort((a, b) => b.length - a.length);
      for (const ext of KNOWN_EXTS) {
        if (cleanSuffix.toLowerCase().endsWith(ext.toLowerCase())) {
          cleanSuffix = cleanSuffix.slice(0, -ext.length);
          detectedExt = ext;
          break;
        }
      }

      const analysisPayload = allFolders.map((f, i) => {
        const inf = inferenceResult.results?.find((r: any) => r.folder_index === i);
        const suffix = i === allFolders.length - 1 ? cleanSuffix : (inf?.suffix || f.suffix || '');
        return { path: f.path, suffix };
      });
      const result = await analyzeWorkspaceFolders(analysisPayload);
      const backendData = result.data;

      if (!backendData || backendData.length === 0) {
        alert(t('dataPreload.alerts.noImagesFound'));
        return;
      }

      const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newFolderMeta = backendData.find((m: any) =>
        m.folderPath === item.path.trim() || m.folderPath === allFolders[allFolders.length - 1].path
      ) || backendData[backendData.length - 1];

      addFolder({
        id: newFolderId,
        path: newFolderMeta.folderPath || item.path,
        suffix: cleanSuffix,
        extension: detectedExt || newFolderMeta.dtype || 'tif',
        files: [],
        metadata: {
          width: newFolderMeta.width || 1024,
          height: newFolderMeta.height || 1024,
          bands: newFolderMeta.bands || 3,
          fileType: detectedExt || newFolderMeta.dtype || 'TIFF',
          dataType: "Remote Sensing Imagery",
          sceneGroupsLoaded: newFolderMeta.group_success || 0,
          sceneGroupsSkipped: newFolderMeta.group_fail || 0
        },
      });

      backendData.forEach((meta: any) => {
        const existingFolder = folders.find(f => f.path === meta.folderPath);
        if (existingFolder) {
          updateFolder(existingFolder.id, {
            metadata: {
              ...existingFolder.metadata,
              width: meta.width || existingFolder.metadata.width,
              height: meta.height || existingFolder.metadata.height,
              bands: meta.bands || existingFolder.metadata.bands,
              sceneGroupsLoaded: meta.group_success || 0,
              sceneGroupsSkipped: meta.group_fail || 0,
            }
          });
        }
      });

      const newInferred: Record<string, any> = {};
      const pathToId: Record<string, string> = {};
      folders.forEach(f => { pathToId[f.path] = f.id; });
      pathToId[item.path.trim()] = newFolderId;

      inferenceResult.results?.forEach((r: any) => {
        const targetPath = allFolders[r.folder_index]?.path;
        const targetId = pathToId[targetPath];
        if (targetId) {
          newInferred[targetId] = {
            suffix: r.suffix || '',
            extension: r.extension || '',
            sample: r.sample_file || '',
          };
        }
      });
      setInferredData(prev => ({ ...prev, ...newInferred }));

      inferenceResult.results?.forEach((r: any) => {
        if (r.folder_index !== allFolders.length - 1) {
          const targetPath = allFolders[r.folder_index]?.path;
          const existingFolder = folders.find(f => f.path === targetPath);
          if (existingFolder && !existingFolder.suffix && r.suffix) {
            updateFolder(existingFolder.id, {
              suffix: r.suffix || '',
              extension: r.extension || existingFolder.extension,
            });
          }
        }
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
        useStore.getState().setSceneGroups(result.sceneGroups);
      }

      setPlaceholders(prev => prev.filter(p => p.id !== item.id));
      savePathsToHistory([item.path]);
    } catch (error) {
      console.error("Auto analyze error:", error);
      alert(t('dataPreload.alerts.backendFailed'));
    } finally {
      setIsConfirming(false);
    }
  };

  const reAnalyzeFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder?.path) return;
    setIsConfirming(true);
    try {
      const allFolders = folders.map(f => ({ path: f.path, suffix: f.suffix || '' }));
      const result = await analyzeWorkspaceFolders(allFolders);

      result.data?.forEach((meta: any) => {
        const existingFolder = folders.find(f => f.path === meta.folderPath);
        if (existingFolder) {
          updateFolder(existingFolder.id, {
            metadata: {
              ...existingFolder.metadata,
              width: meta.width || existingFolder.metadata.width,
              height: meta.height || existingFolder.metadata.height,
              bands: meta.bands || existingFolder.metadata.bands,
              sceneGroupsLoaded: meta.group_success || 0,
              sceneGroupsSkipped: meta.group_fail || 0,
            }
          });
        }
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
        useStore.getState().setSceneGroups(result.sceneGroups);
      }
    } catch (error) {
      console.error("Re-analyze error:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  // ==========================================
  // Workspace 操作
  // ==========================================
  const handleWorkspaceConfirm = async () => {
    const finalPath = isWorkspaceCustom ? workspacePath : mainViewFolder?.path || '';
    if (!finalPath) return;
    setIsWorkspaceConfirming(true);
    setWorkspaceStorePath(finalPath);
    await checkWorkspaceForJson(finalPath);
    setIsWorkspaceConfirming(false);
  };

  const handleWorkspaceReset = () => {
    setWorkspacePath(mainViewFolder?.path || '');
    setIsWorkspaceCustom(false);
  };

  const handleWorkspaceSelectConfirm = (paths: string[]) => {
    if (paths.length > 0) {
      setWorkspacePath(paths[0]);
      setIsWorkspaceCustom(true);
    }
    setWorkspaceExplorerOpen(false);
  };

  // ==========================================
  // Views 操作
  // ==========================================
  const handleAddView = () => {
    if (views.length >= maxViews) return;
    addView({
      id: Math.random().toString(36).slice(2, 11),
      folderId: '',
      bands: [1, 2, 3],
      isMain: views.length === 0,
      opacity: 1,
      crop: { t: 0, r: 100, b: 100, l: 0 },
      transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
    });
  };

  const handleResetViews = () => {
    if (window.confirm(t('dataPreload.alerts.resetViews'))) clearViews();
  };

  // ==========================================
  // 全局操作
  // ==========================================
  const handleGlobalConfirm = async () => {
    if (folders.length === 0) { alert(t('dataPreload.alerts.noFoldersConfigured')); return; }
    if (!mainViewFolder) { alert(t('dataPreload.alerts.noMainView')); return; }

    setIsGlobalConfirming(true);
    try {
      const finalPath = isWorkspaceCustom ? workspacePath : mainViewFolder?.path || '';
      if (finalPath) setWorkspaceStorePath(finalPath);
      const projectMeta = generateProjectMetaConfig(useStore.getState());
      const metaPath = useStore.getState().projectMetaPath;
      if (metaPath) await saveProjectMeta({ file_path: metaPath, content: projectMeta });
      setActiveModule('extent');
    } catch (err) {
      console.error("Failed:", err);
      alert(t('dataPreload.alerts.saveFailed'));
    } finally {
      setIsGlobalConfirming(false);
    }
  };

  const handleExit = () => {
    if (window.confirm(t('dataPreload.alerts.confirmExit'))) {
      setActiveModule('workspace');
    }
  };

  // ==========================================
  // 渲染
  // ==========================================
  const renderStepContent = () => {
    switch (activeStep) {
      case 'folders':
        return (
          <div className="space-y-5">
            {recentPaths.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 rounded-lg border border-dashed">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <History className="w-3 h-3" /> {t('dataPreload.folders.recent')}
                </span>
                {recentPaths.map((path) => {
                  const maxLen = 30;
                  const displayPath = path.length > maxLen ? '...' + path.slice(-maxLen) : path;
                  return (
                    <button key={path} onClick={() => handleAddFromHistory(path)}
                      className="text-[10px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded border truncate max-w-[200px]"
                      title={path}>+ {displayPath}</button>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Input
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFolder(newFolderPath)}
                placeholder={t('dataPreload.folders.pathPlaceholder')}
                className="font-mono text-xs h-9 pr-9"
                disabled={isConfirming}
              />
              <button
                onClick={() => { setExplorerMode('dir'); setExplorerOpen(true); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled={isConfirming}
              >
                <FolderOpen size={14} />
              </button>
            </div>

            {folders.map((folder: any) => {
              const inf = inferredData[folder.id] || { suffix: '', extension: '', sample: '' };
              const suffixChanged = folder.suffix !== inf.suffix;
              const extChanged = folder.extension !== inf.extension;

              return (
                <div key={folder.id} className="p-4 border rounded-lg bg-muted/20 space-y-3">
                  <div className="relative">
                    <Input
                      value={folder.path}
                      onChange={(e) => updateFolder(folder.id, { path: e.target.value })}
                      onBlur={() => reAnalyzeFolder(folder.id)}
                      className="font-mono text-xs h-8 pr-9"
                    />
                    <button
                      onClick={() => { setActivePlaceholderId(folder.id); setExplorerMode('dir'); setExplorerOpen(true); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-[10px] text-muted-foreground shrink-0">{t('dataPreload.folders.suffix')}:</Label>
                      <Input value={folder.suffix || ''}
                        onChange={(e) => updateFolder(folder.id, { suffix: e.target.value })}
                        onBlur={() => reAnalyzeFolder(folder.id)}
                        className="h-7 text-[11px] font-mono w-24" />
                      <span className="text-muted-foreground text-[10px]">.</span>
                      <Label className="text-[10px] text-muted-foreground shrink-0">{t('dataPreload.folders.ext')}:</Label>
                      <Input value={folder.extension || ''}
                        onChange={(e) => updateFolder(folder.id, { extension: e.target.value })}
                        onBlur={() => reAnalyzeFolder(folder.id)}
                        className="h-7 text-[11px] font-mono w-16" />
                      <Button variant="ghost" size="icon" className="text-destructive h-7 w-7 shrink-0 ml-auto"
                        onClick={() => removeFolder(folder.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {inf.sample ? (
                      <div className="flex items-center gap-2 text-[9px]">
                        <Search size={10} className="text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">
                          {t('dataPreload.folders.autoInferred')}
                          {inf.suffix && <span> {t('dataPreload.folders.inferredSuffix')}: <span className="font-mono text-amber-500">{inf.suffix || '(empty)'}</span></span>}
                          {inf.extension && <span>{t('dataPreload.folders.inferredExt')}: <span className="font-mono text-primary">{inf.extension}</span></span>}
                          {' '}{t('dataPreload.folders.inferredFrom')}{' '}
                          <span className="font-mono text-foreground/70">
                            {inf.sample.split('/').pop() || inf.sample.split('\\').pop()}
                          </span>
                        </span>
                        {(suffixChanged || extChanged) && (
                          <button
                            onClick={() => updateFolder(folder.id, { suffix: inf.suffix, extension: inf.extension })}
                            className="text-primary hover:underline ml-1"
                          >
                            {t('dataPreload.folders.restoreAuto')}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[9px] text-muted-foreground/50">{t('dataPreload.folders.noInferenceData')}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground border-t border-border pt-2">
                    <span>📐 {folder.metadata.width}×{folder.metadata.height}</span>
                    <span>🎨 {folder.metadata.bands} bands</span>
                    <span>📄 {folder.metadata.fileType}</span>
                    <span className="text-green-600">✓ {folder.metadata.sceneGroupsLoaded} loaded</span>
                    {folder.metadata.sceneGroupsSkipped > 0 && (
                      <span className="text-destructive">✗ {folder.metadata.sceneGroupsSkipped} skipped</span>
                    )}
                  </div>
                </div>
              );
            })}

            {folders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">{t('dataPreload.folders.emptyHint')}</p>
              </div>
            )}
          </div>
        );

      case 'views':
        return (
          <div className="space-y-4">
            {views.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                {t('dataPreload.views.emptyHint')}
              </div>
            ) : (
              views.map((view, index) => {
                const selectedFolder = folders.find(f => f.id === view.folderId);
                const totalBands = selectedFolder?.metadata?.bands || 0;
                const isNotUint8 = selectedFolder?.metadata?.fileType && !selectedFolder.metadata.fileType.toLowerCase().includes('uint8');

                return (
                  <div key={view.id} className="p-4 border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${view.isMain ? 'bg-primary text-white' : 'bg-background border'}`}>
                        {view.isMain ? t('view.mainView') : `${t('view.augView')} ${index}`}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => removeView(view.id)} disabled={view.isMain && views.length > 1}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-3">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">{t('dataPreload.views.sourceFolder')}</Label>
                      <Select value={view.folderId} onValueChange={(val) => {
                        const sf = folders.find(f => f.id === val);
                        const numBands = sf?.metadata?.bands || 3;
                        updateView(view.id, { folderId: val, bands: numBands >= 3 ? [1, 2, 3] : [1], colormap: 'gray' });
                      }}>
                        <SelectTrigger className="h-8 text-xs flex-1" title={selectedFolder?.path}>
                          <SelectValue placeholder={t('dataPreload.views.selectFolder')}>
                            {(() => {
                              const sf = folders.find(f => f.id === view.folderId);
                              if (!sf) return t('dataPreload.views.selectFolder');
                              const path = sf.path;
                              const maxLen = 70;
                              return path.length > maxLen ? '...' + path.slice(-maxLen) : path;
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {folders.map(f => (
                            <SelectItem key={f.id} value={f.id} className="text-xs" title={f.path}>{f.path}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {view.folderId && (
                      <div className="space-y-2">
                        {isNotUint8 && (
                          <Alert variant="warning" className="py-1.5 px-3 text-[10px]">
                            <Info className="w-3 h-3" />{t('dataPreload.views.nonUint8')}: {selectedFolder?.metadata.fileType}
                          </Alert>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground uppercase">{t('dataPreload.views.channels')}</Label>
                            <div className="flex flex-wrap gap-1">
                              {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => {
                                const isSelected = view.bands.includes(b);
                                return (
                                  <button key={b} onClick={() => {
                                    let active = [...view.bands];
                                    if (active.includes(b)) active = active.filter(x => x !== b);
                                    else active.push(b);
                                    updateView(view.id, { bands: active });
                                  }}
                                    className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                      isSelected ? BAND_COLORS[(b - 1) % BAND_COLORS.length] + " border-2" : BAND_UNSELECTED_STYLE
                                    }`}>{b}</button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            {view.bands.length === 1 && (
                              <div className="space-y-1.5">
                                <Label className="text-[10px] text-muted-foreground">{t('dataPreload.views.colormap')}</Label>
                                <Select value={view.colormap || 'gray'} onValueChange={(val) => updateView(view.id, { colormap: val })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {COLOR_MAPS.map(cm => (
                                      <SelectItem key={cm.name} value={cm.name} className="text-xs">
                                        <div className="flex items-center gap-2">
                                          <div className={`w-8 h-3 rounded bg-gradient-to-r ${cm.css}`} />
                                          {cm.label}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {view.bands.length === 3 && (
                              <div className="space-y-1.5">
                                <Label className="text-[10px] text-muted-foreground">{t('dataPreload.views.rgbMapping')}</Label>
                                <div className="flex gap-1.5">
                                  {['R', 'G', 'B'].map((ch, idx) => (
                                    <React.Fragment key={ch}>
                                      <Select value={view.bands[idx]?.toString()}
                                        onValueChange={(val) => {
                                          const newBands = [...view.bands];
                                          newBands[idx] = parseInt(val);
                                          updateView(view.id, { bands: newBands });
                                        }}>
                                        <SelectTrigger className="h-8 text-xs w-full">
                                          <span className={`font-bold text-[10px] ${ch === 'R' ? 'text-red-500' : ch === 'G' ? 'text-green-500' : 'text-blue-500'}`}>{ch}</span>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => (
                                            <SelectItem key={b} value={b.toString()} className="text-xs">Band {b}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );

      case 'workspace':
        return (
          <div className="space-y-5">
            <Label className="text-xs text-muted-foreground">{t('dataPreload.workspace.description')}</Label>

            {workspaceHasJson && !isCheckingWorkspace ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-amber-700">
                  <Info className="w-4 h-4" />
                  <span className="text-xs font-medium">{t('dataPreload.workspace.locked')}</span>
                </div>
                <div className="text-xs font-mono truncate">{workspacePath || mainViewFolder?.path}</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Input value={isWorkspaceCustom ? workspacePath : (mainViewFolder?.path || '')}
                    placeholder={mainViewFolder?.path || 'default'}
                    onChange={e => { setWorkspacePath(e.target.value); setIsWorkspaceCustom(!!(e.target.value && e.target.value !== mainViewFolder?.path)); }}
                    className="h-9 text-xs pr-9 font-mono" disabled={isWorkspaceConfirming || isCheckingWorkspace} />
                  <button onClick={() => setWorkspaceExplorerOpen(true)} disabled={isWorkspaceConfirming || isCheckingWorkspace}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <FolderOpen size={14} />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('dataPreload.workspace.default')}: <span className="font-mono">{mainViewFolder?.path || t('dataPreload.workspace.notSet')}</span>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // ==========================================
  // 主渲染
  // ==========================================
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {steps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <button key={step.id} onClick={() => setActiveStep(step.id)}
                  className={`w-full flex items-stretch text-left transition-all mb-0.5 rounded-lg overflow-hidden ${
                    status === 'current' ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}>
                  <div className={`w-1 shrink-0 rounded-full my-1.5 ml-1 transition-colors ${
                    status === 'done' ? 'bg-emerald-400' : status === 'current' ? 'bg-primary' : 'bg-muted-foreground/25'
                  }`} />
                  <div className={`flex-1 py-2.5 px-3 min-w-0 text-xs truncate transition-colors ${
                    status === 'current' ? 'text-primary font-semibold' : status === 'done' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}>
                    <span className="flex items-center gap-2">{step.label}</span>
                  </div>
                  {status === 'current' && <ChevronRight className="w-3 h-3 text-primary shrink-0 my-auto mr-2" />}
                </button>
              );
            })}
          </div>
          <Legend items={[
            { color: 'bg-emerald-400', label: t('dataPreload.legend.configured') },
            { color: 'bg-primary', label: t('dataPreload.legend.current') },
            { color: 'bg-muted-foreground/25', label: t('dataPreload.legend.pending') },
          ]} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold">{steps.find(s => s.id === activeStep)?.label}</h3>
                <div className="flex items-center gap-2">
                  {activeStep === 'views' && (
                    <Button onClick={handleAddView} variant="outline" size="sm" disabled={views.length >= maxViews}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />{t('dataPreload.views.addView')}
                    </Button>
                  )}
                                                  {activeStep === 'workspace' && workspaceHasJson && (
                    <Button variant="ghost" size="sm" onClick={() => { setWorkspaceHasJson(false); handleWorkspaceReset(); }}>
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Clear
                    </Button>
                  )}
                  <Button variant="ghost" size="sm"
                    disabled={(activeStep === 'folders' && folders.length === 0) || (activeStep === 'views' && views.length === 0)}
                    onClick={() => {
                      if (activeStep === 'folders') { clearFolders(); setInferredData({}); }
                      else if (activeStep === 'views') clearViews();
                      else if (activeStep === 'workspace') handleWorkspaceReset();
                    }}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t('common.reset')}
                  </Button>
                </div>
              </div>

              <div key={activeStep}>
                {renderStepContent()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部全局按钮 */}
      <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('dataPreload.steps.folders')}:</span>
            <span className="font-semibold">{folders.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('dataPreload.steps.views')}:</span>
            <span className="font-semibold">{views.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('dataPreload.steps.workspace')}:</span>
            <span className={`font-semibold ${
              workspaceStatus === 'default' 
                ? 'text-gray-500 dark:text-gray-400' 
                : 'text-blue-600 dark:text-blue-400'
            }`}>
              {workspaceStatus === 'default' ? 'default' : 'defined'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleExit} disabled={isGlobalConfirming}>
            {t('common.exit')}
          </Button>
          <Button size="sm" className="text-white font-semibold"
            onClick={handleGlobalConfirm}
            disabled={folders.length === 0 || isGlobalConfirming}>
            {isGlobalConfirming ? (
              <>{t('common.processing')}</>
            ) : (
              <>{t('dataPreload.confirmAndAlign')}</>
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
        selectType="dir"
      />
    </div>
  );
}
