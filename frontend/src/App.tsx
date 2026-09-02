import './i18n';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import {
  LoadProject,
  CreateProject,
  DataPreload,
  ViewExtentCheck,
  SyncAnnotation,
  ProjectMetaDashboard,
  TaxonomyDashboard,
  DataExport,
  DataImport
} from './components/Modules';
import { Button } from '@/components/ui/button';
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Menu, Settings, Airplay, CloudLightning, Tag, Download, FolderDown, FolderCog, Folders, Database, FolderPlus, Upload, Sun, Moon, Tags, Keyboard, LayoutTemplate, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import { useAnnotationAutoSave } from './hooks/useAnnotationAutoSave';
import { ShortcutSettingsModal } from './components/modals/settings/ShortcutSettingsModal';
import { AISettingsModal } from './components/modals/settings/AISettingsModal';
import { useMetaAutoSave } from './hooks/useMetaAutoSave';
import { LocalVisualization } from './components/modules/LocalVisualization';
import { GlobalConfirmDialog } from './components/modals/GlobalConfirmDialog';
import { ViewLayoutSettingsModal } from './components/modals/settings/ViewLayoutSettingsModal';
import { ToastContainer } from './components/ui/toast';
import { useBackendHealth } from './hooks/useBackendHealth';
import { loadAllProjectAnnotations } from './lib/annotationUtils';
import { hasAnnotationAttributeContent } from './lib/annotationAttributeUtils';
import { showDialog } from './store/useDialogStore';
import { toast } from './store/useToastStore';

export default function App() {
  const { t, i18n } = useTranslation();
  const {
    folders,
    activeModule,
    setActiveModule,
    currentStem,
    projectName,
    theme,
    setTheme,
    language,
    setLanguage,
    editorSettings,
    updateEditorSettings,
    projectMetaPath,
    annotations,
    taxonomyAttributes,
    workspacePath,
    stems,
    views,
  } = useStore();
  const annotationLastSavedTime = useStore((s) => s.annotationLastSavedTime);
  const hasAttributeContent = hasAnnotationAttributeContent(annotations, taxonomyAttributes);
  const attributeDisplayEnabled = editorSettings.att_show === true && hasAttributeContent;
  const startupAnnotationReloadKey = useRef<string | null>(null);
  const { annotationSaveStatus, autoSave } = useAnnotationAutoSave();
  const { metaSaveStatus, metaLastSavedTime, isDirty: isMetaDirty } = useMetaAutoSave();
  
  useBackendHealth();
  const [viewLayoutModalOpen, setViewLayoutModalOpen] = useState(false);
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [aiSettingsModalOpen, setAiSettingsModalOpen] = useState(false);
  const [isReloadingAll, setIsReloadingAll] = useState(false);
  const [reloadProgress, setReloadProgress] = useState({ current: 0, total: 0 });

  // A persisted workspace can contain an incomplete annotation cache when a
  // previous import was interrupted. Reconcile that cache once on startup if
  // the project has an attribute taxonomy but the restored annotations have
  // no attribute values. Projects with a valid cached attribute payload are
  // left untouched, so local edits are not replaced on every restart.
  useEffect(() => {
    if (
      activeModule !== 'workspace'
      || !projectMetaPath
      || stems.length === 0
      || taxonomyAttributes.length === 0
      || hasAttributeContent
    ) {
      return;
    }

    const mainFolder = folders.find(
      (folder) => folder.id === views.find((view) => view.isMain)?.folderId,
    ) || folders[0];
    const saveDir = workspacePath || mainFolder?.path || '';
    if (!saveDir) return;

    const reloadKey = `${projectMetaPath}|${saveDir}|${stems.length}`;
    if (startupAnnotationReloadKey.current === reloadKey) return;
    startupAnnotationReloadKey.current = reloadKey;

    void loadAllProjectAnnotations(stems, saveDir, undefined, 10).catch((error) => {
      console.warn('Startup annotation reconciliation failed:', error);
    });
  }, [
    activeModule,
    projectMetaPath,
    folders,
    views,
    workspacePath,
    stems,
    taxonomyAttributes,
    hasAttributeContent,
  ]);

  const handleReloadAll = async () => {
    if (isReloadingAll) return;

    const state = useStore.getState();
    const mainFolder = state.folders.find(
      (folder) => folder.id === state.views.find((view) => view.isMain)?.folderId,
    ) || state.folders[0];
    const saveDir = state.workspacePath || mainFolder?.path || '';

    if (state.stems.length === 0 || !saveDir) {
      toast.warning(t('headerSetting.reloadAllNoProject'));
      return;
    }

    if (state.isAnnotationDirty) {
      const confirmed = await showDialog({
        type: 'warning',
        title: t('headerSetting.reloadAllTitle'),
        description: t('headerSetting.reloadAllDirtyDesc'),
        confirmText: t('common.confirm'),
        cancelText: t('common.cancel'),
      });
      if (!confirmed) return;
    }

    setIsReloadingAll(true);
    setReloadProgress({ current: 0, total: state.stems.length });
    useStore.setState({
      annotations: [],
      hiddenAnnotations: [],
      activeAnnotationId: null,
      isAnnotationDirty: false,
    });

    try {
      const result = await loadAllProjectAnnotations(
        state.stems,
        saveDir,
        (current, total) => setReloadProgress({ current, total }),
        10,
      );

      if (result) {
        toast.success(t('headerSetting.reloadAllSuccess', {
          scenes: result.loadedSceneCount,
          count: result.annotationCount,
        }));
      }
    } catch (error: any) {
      toast.error(t('headerSetting.reloadAllError', {
        message: error?.message || String(error),
      }));
    } finally {
      setIsReloadingAll(false);
    }
  };

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language, i18n]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0 h-14">
        {/* Start Menu */}
        <div className="flex items-center gap-4 w-1/3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors outline-none cursor-pointer shrink-0 text-neutral-700 dark:text-neutral-200">
              <Menu className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => setActiveModule('createproject')}>
                <FolderPlus className="w-4 h-4 mr-2" /> {t('menu.createProject')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('loadproject')}>
                <FolderDown className="w-4 h-4 mr-2" /> {t('menu.loadProject')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('preload')}>
                <FolderCog className="w-4 h-4 mr-2" /> {t('menu.dataPreload')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('extent')}>
                <Folders className="w-4 h-4 mr-2" /> {t('menu.viewExtentCheck')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                void autoSave().then(
                  () => setActiveModule('taxonomy'),
                  () => setActiveModule('taxonomy'),
                );
              }}>
                <Tags className="w-4 h-4 mr-2" /> {t('menu.taxonomyManager')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('exchange_import')}>
                <Download className="w-4 h-4 mr-2" /> {t('menu.importData')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('exchange_export')}>
                <Upload className="w-4 h-4 mr-2" /> {t('menu.exportData')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('local_visualization')}>
                <Airplay className="w-4 h-4 mr-2" /> {t('menu.localVisualization')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('meta')}>
                <Database className="w-4 h-4 mr-2" /> {t('menu.projectMeta')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Top Navigation Bar：Logo + app name + project name + scene group + 2 save status */}
        <div className="flex items-center justify-center gap-3 w-1/2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold shadow-sm cursor-default" title={t('header.appName')}>
            MA
          </div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white transition-colors cursor-default" title={t('header.appName')}>
            MultiAnno
          </h1>
          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 transition-colors mx-2" />

          <span
            className="inline-flex items-center text-sm font-semibold text-primary tracking-wide max-w-[200px] transition-colors cursor-default"
            title={t('header.projectName') + projectName}
          >
            <span className="truncate">
              {projectName.slice(0, Math.ceil(projectName.length / 2)) + ' '}
            </span>
            <span className="whitespace-nowrap flex-shrink-0">
              {' ' + projectName.slice(Math.ceil(projectName.length / 2))}
            </span>
          </span>
          <div className="h-4 w-[1px] bg-neutral-100 dark:bg-neutral-900 transition-colors mx-1" />
          {currentStem && (
            <>
              <span
                className="inline-flex items-center max-w-[200px] px-3 py-1 bg-neutral-200 dark:bg-neutral-800 rounded-full text-xs font-mono text-neutral-700 dark:text-neutral-300 transition-colors cursor-default"
                title={t('header.sceneGroupName') + currentStem}
              >
                <span className="truncate min-w-0">
                  {currentStem.slice(0, Math.ceil(currentStem.length / 2))}
                </span>
                <span className="whitespace-nowrap flex-shrink-0">
                  {currentStem.slice(Math.ceil(currentStem.length / 2))}
                </span>
              </span>
            </>
          )}
          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 transition-colors mx-2" />

          <div className="flex items-center gap-0">
            {folders && folders.length > 0 && projectMetaPath && (
              <div
                title={metaSaveStatus === 'error' 
                  ? t('header.projectMetaNotSaved') 
                  : metaSaveStatus === 'saving'
                    ? t('header.projectMetaSaving')
                    : metaSaveStatus === 'saved'
                      ? t('header.projectMetaSaved') + metaLastSavedTime
                      : isMetaDirty
                        ? t('header.projectMetaUnsaved') 
                        : metaLastSavedTime
                          ? t('header.projectMetaSaved') + metaLastSavedTime
                          : t('header.projectMetaMiss')
                }
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-all duration-300 ${
                  metaSaveStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
                    : metaSaveStatus === 'saving'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 text-yellow-600 dark:text-yellow-400'
                      : metaSaveStatus === 'saved'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-600 dark:text-green-400'
                        : isMetaDirty
                          ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400'
                          : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500'
                }`}
              >
                {metaSaveStatus === 'saving' ? (
                  <CloudLightning className="w-3 h-3 animate-pulse" />
                ) : (
                  <Database className={`w-3 h-3 ${isMetaDirty ? 'animate-pulse' : 'opacity-70'}`} />
                )}
                <span className="hidden sm:inline">
                  {metaSaveStatus === 'error'
                    ? 'Error'
                    : metaSaveStatus === 'saving'
                      ? 'Saving...'
                      : metaSaveStatus === 'saved'
                        ? 'Saved'
                        : isMetaDirty
                          ? 'Unsaved'
                          : metaLastSavedTime
                            ? 'Meta ' + metaLastSavedTime
                            : 'Meta'
                  }
                </span>
              </div>
            )}
            <div className="h-4 w-[1px] bg-neutral-100 dark:bg-neutral-900 transition-colors mx-1" />
            {currentStem && (annotationSaveStatus !== 'idle' || annotationLastSavedTime) && (
              <div
                title={annotationSaveStatus === 'error' 
                  ? t('header.annotationNotSaved') 
                  : annotationSaveStatus === 'saving'
                    ? t('header.annotationSaving')
                    : annotationSaveStatus === 'saved'
                      ? t('header.annotationSaved') + annotationLastSavedTime
                      : annotationLastSavedTime
                        ? t('header.annotationSaved') + annotationLastSavedTime
                        : t('header.annotationMiss')
                }
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-all duration-300 ${
                  annotationSaveStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
                    : annotationSaveStatus === 'saving'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 text-yellow-600 dark:text-yellow-400'
                      : annotationSaveStatus === 'saved'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-600 dark:text-green-400'
                        : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500'
                }`}
              >
                {annotationSaveStatus === 'saving' ? (
                  <CloudLightning className="w-3 h-3 animate-pulse" />
                ) : (
                  <Tag className={`w-3 h-3 ${annotationSaveStatus !== 'idle' ? 'animate-pulse' : 'opacity-70'}`} />
                )}
                <span className="hidden sm:inline">
                  {annotationSaveStatus === 'error'
                    ? 'Error'
                    : annotationSaveStatus === 'saving'
                      ? 'Saving...'
                      : annotationSaveStatus === 'saved'
                        ? 'Saved'
                        : annotationLastSavedTime
                          ? 'Anno ' + annotationLastSavedTime
                          : 'Anno'
                  }
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Menu: Settings + Theme Switch + Language Switch */}
        <div className="w-1/3 flex justify-end items-center gap-2">
          <Popover>
            <PopoverTrigger className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none cursor-pointer text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              title={t('header.settings')}
            >
              <Settings className="w-4 h-4" />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-neutral-200 dark:border-neutral-800">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.showCrosshair')}</Label>
                  <Switch
                    checked={editorSettings.showCrosshair}
                    onCheckedChange={(v) => updateEditorSettings({ showCrosshair: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.showPixelValue')}</Label>
                  <Switch
                    checked={editorSettings.showPixelValue}
                    onCheckedChange={(v) => updateEditorSettings({ showPixelValue: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.showLongCrosshair')}</Label>
                  <Switch
                    checked={editorSettings.showLongCrosshair}
                    onCheckedChange={(v) => updateEditorSettings({ showLongCrosshair: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.continuousDrawing')}</Label>
                  <Switch
                    checked={editorSettings.continuousDrawing}
                    onCheckedChange={(v) => updateEditorSettings({ continuousDrawing: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.fillShapes')}</Label>
                  <Switch
                    checked={editorSettings.fillAnnotationShapes}
                    onCheckedChange={(v) => updateEditorSettings({ fillAnnotationShapes: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.showAnnotationToolLabel')}</Label>
                  <Switch
                    checked={editorSettings.showToolLabels}
                    onCheckedChange={(v) => updateEditorSettings({ showToolLabels: v })}
                  />
                </div>
                <div className={`space-y-1 ${!hasAttributeContent ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{t('headerSetting.attShow')}</Label>
                    <Switch
                      checked={editorSettings.att_show === true}
                      disabled={!hasAttributeContent}
                      onCheckedChange={(v) => updateEditorSettings({ att_show: v })}
                    />
                  </div>
                  {!hasAttributeContent && (
                    <p className="text-[10px] leading-tight text-neutral-500 dark:text-neutral-400">
                      {t('headerSetting.attShowUnavailable')}
                    </p>
                  )}
                </div>
                <div className={`flex items-center justify-between ${!attributeDisplayEnabled ? 'opacity-60' : ''}`}>
                  <Label className="text-xs">{t('headerSetting.attHideNo')}</Label>
                  <Switch
                    checked={editorSettings.att_hide_no === true}
                    disabled={!editorSettings.att_show || !hasAttributeContent}
                    onCheckedChange={(v) => updateEditorSettings({ att_hide_no: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.autoRefreshStats')}</Label>
                  <Switch
                    checked={editorSettings.autoRefreshStats}
                    onCheckedChange={(v) => updateEditorSettings({ autoRefreshStats: v })}
                  />
                </div>
                <div className="border-t border-neutral-300 dark:border-neutral-700 pt-1" />
                <button
                  type="button"
                  onClick={handleReloadAll}
                  disabled={isReloadingAll}
                  className="flex items-center justify-between w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-0.5 py-1 transition-colors disabled:opacity-60"
                  title={t('headerSetting.reloadAll')}
                >
                  <span className="text-xs cursor-pointer">
                    {isReloadingAll && reloadProgress.total > 0
                      ? `${t('headerSetting.reloadAll')} (${reloadProgress.current}/${reloadProgress.total})`
                      : t('headerSetting.reloadAll')}
                  </span>
                  <RefreshCw className={`w-4 h-4 ${isReloadingAll ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setViewLayoutModalOpen(true)}
                  className="flex items-center justify-between w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-0.5 py-1 transition-colors"
                >
                  <Label className="text-xs cursor-pointer">{t('headerSetting.viewLayout')}</Label>
                  <LayoutTemplate className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShortcutModalOpen(true)}
                  className="flex items-center justify-between w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-0.5 py-0.5 transition-colors"
                >
                  <Label className="text-xs cursor-pointer">{t('headerSetting.shortcutSetting')}</Label>
                  <Keyboard className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setAiSettingsModalOpen(true)}
                  className="flex items-center justify-between w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-0.5 py-0.5 transition-colors"
                >
                  <Label className="text-xs cursor-pointer">{t('headerSetting.aiSetting')}</Label>
                  <CloudLightning className="w-4 h-4" />
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-full font-bold text-xs"
            title={t('header.switchLang')}
          >
            {language === 'en' ? '中' : 'EN'}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-full"
            title={theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 transition-all" /> : <Moon className="w-5 h-5 transition-all" />}
          </Button>
        </div>
      </header>

      {/* Main Content Area - Always Workspace */}
      <main className="flex-grow overflow-hidden relative">
        <SyncAnnotation autoSave={autoSave} />
      </main>

      {/* ============== Dialog Containers ============== */}

      <Dialog
        open={activeModule === 'createproject'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-xl sm:max-w-xl p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle>{t('menu.createProject')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <CreateProject onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'loadproject'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-xl sm:max-w-xl p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle>{t('menu.loadProject')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <LoadProject onClose={() => setActiveModule('workspace')}/>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'preload'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-4xl sm:max-w-4xl h-[90vh] flex flex-col p-0 border-border">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.dataPreload')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataPreload onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'extent'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-border">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.viewExtentCheck')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ViewExtentCheck onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'taxonomy'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.taxonomyManager')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <TaxonomyDashboard onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'exchange_import'}
        disablePointerDismissal
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-4xl sm:max-w-4xl h-[90vh] flex flex-col p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.importData')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataImport onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'exchange_export'}
        disablePointerDismissal
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-4xl sm:max-w-4xl h-[90vh] flex flex-col p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.exportData')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden relative">
            <DataExport onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'local_visualization'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-border overflow-hidden shadow-2xl">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.localVisualization')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <LocalVisualization onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeModule === 'meta'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.projectMeta')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ProjectMetaDashboard onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      <ViewLayoutSettingsModal
        open={viewLayoutModalOpen}
        onClose={() => setViewLayoutModalOpen(false)}
      />
      <ShortcutSettingsModal
        open={shortcutModalOpen}
        onClose={() => setShortcutModalOpen(false)}
      />
      <AISettingsModal
        open={aiSettingsModalOpen}
        onClose={() => setAiSettingsModalOpen(false)}
      />
      <GlobalConfirmDialog />
      <ToastContainer />

    </div>
  );
}
