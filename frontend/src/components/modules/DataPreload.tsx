import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { COLOR_MAPS, BAND_COLORS, BAND_BASE_STYLE, BAND_UNSELECTED_STYLE } from '../../config/colors';
import { useTranslation } from 'react-i18next';

import { 
  FolderOpen, Plus, Trash2, Info, Check, X, UploadCloud, Loader2, History
} from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog'; 
import { Alert, AlertDescription } from '../ui/alert';
import { generateProjectMetaConfig } from '../../lib/projectUtils';
import { API_BASE_URL } from '../../api/client';
import { saveProjectMeta, analyzeWorkspaceFolders } from '../../api/client';

export function DataPreload() {
  const { t } = useTranslation();
  const {projectName, folders, views, addFolder, removeFolder, clearFolders, addView, removeView, updateView, clearViews, setActiveModule, editorSettings } = useStore();
  
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string, suffix: string }[]>([]);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const maxViews = editorSettings.maxViews || 9;
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

  const savePathsToHistory = (paths: string[]) => {
    let newHistory = [...recentPaths];
    paths.forEach(path => {
      const trimmed = path.trim().replace(/\\/g, '/'); 
      if (trimmed) {
        newHistory = newHistory.filter(p => p !== trimmed); 
        newHistory.unshift(trimmed); 
      }
    });
    newHistory = newHistory.slice(0, 5);
    setRecentPaths(newHistory);
    localStorage.setItem('multiAnno_recentPaths', JSON.stringify(newHistory));
  };

  const handleAddPlaceholder = () => setPlaceholders([...placeholders, { id: Math.random().toString(36).substr(2, 9), path: '', suffix: '' }]);
  const handleAddFromHistory = (path: string) => setPlaceholders(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), path, suffix: '' }]);
  const handleRemovePlaceholder = (id: string) => setPlaceholders(placeholders.filter(p => p.id !== id));
  const handleUpdatePath = (id: string, newPath: string) => setPlaceholders(placeholders.map(p => p.id === id ? { ...p, path: newPath } : p));
  const openExplorerFor = (id: string) => { setActivePlaceholderId(id); setExplorerOpen(true); };

  const handleExplorerConfirm = (selectedPaths: string[]) => {
    if (selectedPaths.length === 0 || !activePlaceholderId) return;
    const newPlaceholders = [...placeholders];
    const targetIndex = newPlaceholders.findIndex(p => p.id === activePlaceholderId);

    if (targetIndex !== -1) {
      newPlaceholders[targetIndex].path = selectedPaths[0];
      const extraPlaceholders = selectedPaths.slice(1).map(path => ({
        id: Math.random().toString(36).substr(2, 9),
        path: path
      }));
      newPlaceholders.splice(targetIndex + 1, 0, ...extraPlaceholders);
    }
    setPlaceholders(newPlaceholders);
    setExplorerOpen(false);
    savePathsToHistory(selectedPaths);
  };

  const cancelFolders = () => {
    if (window.confirm(t('dataPreload.alerts.cancelFolders'))) { // 🌟
      setPlaceholders([]);
      clearFolders();
      clearViews();
    }
  };

  const handleResetViews = () => {
    if (window.confirm(t('dataPreload.alerts.resetViews'))) { // 🌟
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
          id: `folder-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
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

  const handleAddView = () => {
    if (views.length >= 9) return;
    addView({
      id: Math.random().toString(36).substr(2, 9),
      folderId: '',
      bands: [1, 2, 3],
      isMain: views.length === 0,
      opacity: 1,
      transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
    });
  };

  const handleConfirmViews = async () => {
    if (views.length === 0) return;

    if (views.length > 1) {
      if (window.confirm(t('dataPreload.alerts.confirmExtent'))) { 
        setActiveModule('extent');
      }
      return;
    }

    if (views.length === 1) {
      if (!window.confirm(t('dataPreload.alerts.confirmSingleView'))) return; 
      
      const projectMeta = generateProjectMetaConfig(useStore.getState());
      const metaPath = useStore.getState().projectMetaPath;
      
      try {
        // 🌟 如果路径存在，静默写入硬盘
        if (metaPath) {
          await saveProjectMeta({ file_path: metaPath, content: projectMeta });
        }
        // 直接进入工作区，把下面的 showSaveFilePicker 全删了！
        setActiveModule('workspace'); 
      } catch (err) {
        alert("配置保存失败，请检查路径权限");
        // 失败的话也可以强行进入或者让用户检查
        setActiveModule('workspace');
      }
    }
  };
  
  return (
    <div className="grid grid-cols-2 h-full gap-6 p-6 overflow-hidden">
      {/* 左侧：Folders Section */}
      <Card className="flex flex-col flex-1 min-h-0 transition-colors">
        <CardHeader className="shrink-0 pb-4 border-b">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2"><FolderOpen className="w-5 h-5" /> {t('dataPreload.folders.title')}</div>
            <Button onClick={handleAddPlaceholder} variant="outline" size="sm" disabled={isConfirming}>
              <Plus className="w-4 h-4 mr-2" /> {t('dataPreload.folders.add')}
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
                    <h3 className="font-semibold" title={folder.path}>{folder.path}</h3>
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

          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">{placeholders.length} {t('dataPreload.folders.pendingCount')}</span>
            <Button onClick={cancelFolders} variant="outline" disabled={(placeholders.length === 0 && folders.length === 0) || isConfirming}>
              <X className="w-4 h-4 mr-2" /> {t('dataPreload.folders.cancelAll')}
            </Button>
            <Button onClick={confirmFolders} variant="default" className="text-white" disabled={placeholders.length === 0 || isConfirming}>
              {isConfirming ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('dataPreload.folders.analyzing')}</> : <><Check className="w-4 h-4 mr-2" /> {t('dataPreload.folders.confirmUpload')}</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 右侧：Views Configuration Section */}
      <Card className="flex flex-col flex-1 min-h-0">
        <CardHeader className="shrink-0 pb-4 border-b">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Info className="w-5 h-5" /> {t('dataPreload.views.title')}</div>
            <Button onClick={handleAddView} variant="outline" size="sm" disabled={views.length >= maxViews}>
              <Plus className="w-4 h-4 mr-2" /> {t('dataPreload.views.addView')} {views.length >= maxViews && t('headerSetting.maxViews')}
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
                        <SelectTrigger className="h-8 bg-background border-input text-foreground text-xs font-medium shadow-sm flex-1">
                          <SelectValue placeholder={t('dataPreload.views.selectFolder')}>
                            {view.folderId ? folders.find(f => f.id === view.folderId)?.path : t('dataPreload.views.selectFolder')}
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
          
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t shrink-0">
            <span className="text-sm text-muted-foreground mr-auto">
              {views.length} {t('dataPreload.views.configuredCount')}
            </span>
            <Button onClick={handleResetViews} variant="outline" disabled={views.length === 0}>
              <X className="w-4 h-4 mr-2" /> {t('dataPreload.views.reset')}
            </Button>
            <Button 
              onClick={handleConfirmViews} 
              disabled={views.length === 0} 
              variant="default"
              className="text-white font-medium"
            >
              <Check className="w-4 h-4 mr-2" /> 
              {views.length > 1 ? t('dataPreload.views.confirmMap') : t('dataPreload.views.confirmStart')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <FileExplorerDialog 
        open={explorerOpen}
        initialPath={activePlaceholderId ? placeholders.find(p => p.id === activePlaceholderId)?.path || '' : ''}
        onClose={() => setExplorerOpen(false)}
        onConfirm={handleExplorerConfirm}
        selectType={explorerMode}
      />
    </div>
  );
}