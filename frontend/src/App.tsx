import './i18n';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import {
  LoadProject,
  DataPreload,
  ViewExtentCheck,
  SyncAnnotation,
  ProjectMetaDashboard,
  TaxonomyDashboard,
  DataExport,
  DataImport
} from './components/Modules';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const getDisplayLocale = (language: string) => language.startsWith('zh') ? 'zh-CN' : 'en-US';

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span className="shrink-0">{title}</span>
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

const parseSavedTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  if (!Number.isNaN(date.getTime()) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}|T/.test(timestamp)) {
    return date;
  }

  // Older cached states stored only HH:mm:ss. The original date cannot be
  // recovered, so keep the saved time and attach today's date for display.
  const timeMatch = timestamp.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!timeMatch) return null;

  const legacyDate = new Date();
  legacyDate.setHours(
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] || 0),
    0,
  );
  return legacyDate;
};

const formatSavedTimestamp = (
  timestamp: string | null,
  language: string,
  includeDate = false,
) => {
  if (!timestamp) return '';

  const date = parseSavedTimestamp(timestamp);
  if (!date) return timestamp;

  const locale = getDisplayLocale(language);
  const timeText = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  if (!includeDate) return timeText;

  const dateText = date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${timeText} ${dateText}`;
};

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
    resetProject,
  } = useStore();
  const annotationLastSavedTime = useStore((s) => s.annotationLastSavedTime);
  const hasAttributeContent = hasAnnotationAttributeContent(annotations, taxonomyAttributes);
  const attributeDisplayEnabled = editorSettings.att_show === true && hasAttributeContent;
  const startupAnnotationReloadKey = useRef<string | null>(null);
  const { annotationSaveStatus, autoSave } = useAnnotationAutoSave();
  const { metaSaveStatus, metaLastSavedTime, isDirty: isMetaDirty } = useMetaAutoSave();

  const metaDisplayTime = formatSavedTimestamp(metaLastSavedTime, i18n.language);
  const metaTooltipTime = formatSavedTimestamp(metaLastSavedTime, i18n.language, true);
  const annotationDisplayTime = formatSavedTimestamp(annotationLastSavedTime, i18n.language);
  const annotationTooltipTime = formatSavedTimestamp(annotationLastSavedTime, i18n.language, true);

  const metaStatusText = metaSaveStatus === 'error'
    ? 'Error'
    : metaSaveStatus === 'saving'
      ? 'Saving...'
      : metaSaveStatus === 'saved'
        ? 'Saved'
        : isMetaDirty
          ? 'Unsaved'
          : metaDisplayTime
            ? `Meta ${metaDisplayTime}`
            : 'Meta';
  const metaCompactText = !isMetaDirty && metaSaveStatus === 'idle' && metaDisplayTime
    ? metaDisplayTime
    : metaStatusText;

  const annotationStatusText = annotationSaveStatus === 'error'
    ? 'Error'
    : annotationSaveStatus === 'saving'
      ? 'Saving...'
      : annotationDisplayTime
        ? `Anno ${annotationDisplayTime}`
        : 'Anno';
  const annotationCompactText = annotationSaveStatus === 'idle' && annotationDisplayTime
    ? annotationDisplayTime
    : annotationStatusText;
  
  useBackendHealth();
  const [viewLayoutModalOpen, setViewLayoutModalOpen] = useState(false);
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [aiSettingsModalOpen, setAiSettingsModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isReloadingAll, setIsReloadingAll] = useState(false);
  const [reloadProgress, setReloadProgress] = useState({ current: 0, total: 0 });

  const handleCreateProject = () => {
    resetProject();
    setIsCreatingProject(true);
    setActiveModule('preload');
  };

  const handleOpenPreload = () => {
    setIsCreatingProject(false);
    setActiveModule('preload');
  };

  const handleClosePreload = () => {
    setIsCreatingProject(false);
    setActiveModule('workspace');
  };

  useEffect(() => {
    if (activeModule !== 'preload') {
      setIsCreatingProject(false);
    }
  }, [activeModule]);

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
      <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0 h-14">
        {/* Start Menu */}
        <div className="flex flex-1 min-w-0 items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors outline-none cursor-pointer shrink-0 text-neutral-700 dark:text-neutral-200">
              <Menu className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('menu.projectGroup')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleCreateProject}>
                  <FolderPlus className="w-4 h-4 mr-2" /> {t('menu.createProject')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveModule('loadproject')}>
                  <FolderDown className="w-4 h-4 mr-2" /> {t('menu.loadProject')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveModule('meta')}>
                  <Database className="w-4 h-4 mr-2" /> {t('menu.projectMeta')}
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('menu.dataPreparationGroup')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleOpenPreload}>
                  <FolderCog className="w-4 h-4 mr-2" /> {t('menu.dataPreload')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveModule('extent')}>
                  <Folders className="w-4 h-4 mr-2" /> {t('menu.viewExtentCheck')}
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('menu.annotationGroup')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => {
                  void autoSave().then(
                    () => setActiveModule('taxonomy'),
                    () => setActiveModule('taxonomy'),
                  );
                }}>
                  <Tags className="w-4 h-4 mr-2" /> {t('menu.taxonomyManager')}
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('menu.dataExchangeGroup')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setActiveModule('exchange_import')}>
                  <Download className="w-4 h-4 mr-2" /> {t('menu.importData')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveModule('exchange_export')}>
                  <Upload className="w-4 h-4 mr-2" /> {t('menu.exportData')}
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('menu.reviewGroup')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setActiveModule('local_visualization')}>
                  <Airplay className="w-4 h-4 mr-2" /> {t('menu.localVisualization')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Top Navigation Bar：Logo + app name + project name + scene group + 2 save status */}
        <div className="flex flex-[2] min-w-0 items-center justify-center gap-3">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold shadow-sm cursor-default" title={t('header.appName')}>
            MA
          </div>
          <h1 className="hidden 2xl:block shrink-0 text-xl font-bold tracking-tight text-neutral-900 dark:text-white transition-colors cursor-default" title={t('header.appName')}>
            MultiAnno
          </h1>
          <div className="hidden 2xl:flex min-w-0 items-center">
            <div className="h-4 w-[1px] shrink-0 bg-neutral-300 dark:bg-neutral-700 transition-colors mx-2" />
            <span
              className="inline-flex min-w-0 max-w-[200px] shrink items-center text-sm font-semibold text-primary tracking-wide transition-colors cursor-default"
              title={t('header.projectName') + projectName}
            >
              <span className="truncate min-w-0">{projectName}</span>
            </span>
            <div className="h-4 w-[1px] shrink-0 bg-neutral-100 dark:bg-neutral-900 transition-colors mx-1" />
          </div>
          {currentStem && (
            <>
              <div className="h-4 w-[1px] shrink-0 bg-neutral-100 dark:bg-neutral-900 transition-colors mx-1" />
              <span
                className="inline-flex min-w-0 max-w-[200px] shrink items-center px-3 py-1 bg-neutral-200 dark:bg-neutral-800 rounded-full text-xs font-mono text-neutral-700 dark:text-neutral-300 transition-colors cursor-default"
                title={t('header.sceneGroupName') + currentStem}
              >
                <span className="truncate min-w-0">{currentStem}</span>
              </span>
            </>
          )}
          </div>
          <div className="h-4 w-[1px] bg-neutral-300 dark:bg-neutral-700 transition-colors mx-2" />

          <div className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap">
            {folders && folders.length > 0 && projectMetaPath && (
              <div
                title={metaSaveStatus === 'error' 
                  ? t('header.projectMetaNotSaved') 
                  : metaSaveStatus === 'saving'
                    ? t('header.projectMetaSaving')
                    : metaSaveStatus === 'saved'
                      ? t('header.projectMetaSaved') + (metaTooltipTime || metaLastSavedTime || '')
                      : isMetaDirty
                        ? t('header.projectMetaUnsaved') 
                        : metaTooltipTime
                          ? t('header.projectMetaSaved') + metaTooltipTime
                          : t('header.projectMetaMiss')
                }
                className={`inline-flex h-6 min-w-0 max-w-[150px] shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap px-2.5 rounded-full border text-[11px] leading-none font-medium transition-all duration-300 ${
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
                <span className="hidden min-w-0 truncate whitespace-nowrap sm:inline xl:hidden">{metaCompactText}</span>
                <span className="hidden min-w-0 truncate whitespace-nowrap xl:inline">{metaStatusText}</span>
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
                      ? t('header.annotationSaved') + annotationTooltipTime
                      : annotationTooltipTime
                        ? t('header.annotationSaved') + annotationTooltipTime
                        : t('header.annotationMiss')
                }
                className={`inline-flex h-6 min-w-0 max-w-[150px] shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap px-2.5 rounded-full border text-[11px] leading-none font-medium transition-all duration-300 ${
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
                <span className="hidden min-w-0 truncate whitespace-nowrap sm:inline xl:hidden">{annotationCompactText}</span>
                <span className="hidden min-w-0 truncate whitespace-nowrap xl:inline">{annotationStatusText}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Menu: Settings + Theme Switch + Language Switch */}
        <div className="flex flex-1 min-w-0 justify-end items-center gap-2">
          <Popover>
            <PopoverTrigger className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none cursor-pointer text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              title={t('header.settings')}
            >
              <Settings className="w-4 h-4" />
            </PopoverTrigger>
            <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] max-h-[min(64vh,480px)] overflow-y-auto custom-scrollbar p-3 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-neutral-200 dark:border-neutral-800">
              <div className="space-y-3">
                <SettingsSection title={t('headerSetting.groups.display')}>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.showPixelValue')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.showPixelValue}
                      onCheckedChange={(v) => updateEditorSettings({ showPixelValue: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.showCrosshair')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.showCrosshair}
                      onCheckedChange={(v) => updateEditorSettings({ showCrosshair: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.showLongCrosshair')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.showLongCrosshair}
                      onCheckedChange={(v) => updateEditorSettings({ showLongCrosshair: v })}
                    />
                  </div>
                </SettingsSection>

                <SettingsSection title={t('headerSetting.groups.annotation')}>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.continuousDrawing')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.continuousDrawing}
                      onCheckedChange={(v) => updateEditorSettings({ continuousDrawing: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.fillShapes')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.fillAnnotationShapes}
                      onCheckedChange={(v) => updateEditorSettings({ fillAnnotationShapes: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.showAnnotationToolLabel')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.showToolLabels}
                      onCheckedChange={(v) => updateEditorSettings({ showToolLabels: v })}
                    />
                  </div>
                  <div
                    className={`rounded-md px-1.5 py-1 ${!hasAttributeContent ? 'opacity-60' : ''}`}
                    title={!hasAttributeContent ? t('headerSetting.attShowUnavailable') : undefined}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-xs">{t('headerSetting.attShow')}</Label>
                      <Switch
                        className="scale-90 origin-right"
                        checked={editorSettings.att_show === true}
                        disabled={!hasAttributeContent}
                        onCheckedChange={(v) => updateEditorSettings({ att_show: v })}
                      />
                    </div>
                  </div>
                  <div className={`ml-3 flex items-center justify-between gap-3 rounded-md border-l-2 border-neutral-200 pl-2.5 pr-1.5 py-1 dark:border-neutral-700 ${!attributeDisplayEnabled ? 'opacity-60' : ''}`}>
                    <Label className="text-xs">{t('headerSetting.attHideNo')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.att_hide_no === true}
                      disabled={!editorSettings.att_show || !hasAttributeContent}
                      onCheckedChange={(v) => updateEditorSettings({ att_hide_no: v })}
                    />
                  </div>
                </SettingsSection>

                <SettingsSection title={t('headerSetting.groups.data')}>
                  <div className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1">
                    <Label className="text-xs">{t('headerSetting.autoRefreshStats')}</Label>
                    <Switch
                      className="scale-90 origin-right"
                      checked={editorSettings.autoRefreshStats}
                      onCheckedChange={(v) => updateEditorSettings({ autoRefreshStats: v })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleReloadAll}
                    disabled={isReloadingAll}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60"
                    title={t('headerSetting.reloadAll')}
                  >
                    <span className="text-xs">
                      {isReloadingAll && reloadProgress.total > 0
                        ? `${t('headerSetting.reloadAll')} (${reloadProgress.current}/${reloadProgress.total})`
                        : t('headerSetting.reloadAll')}
                    </span>
                    <RefreshCw className={`h-4 w-4 shrink-0 ${isReloadingAll ? 'animate-spin' : ''}`} />
                  </button>
                </SettingsSection>

                <SettingsSection title={t('headerSetting.groups.workspace')}>
                  <button
                    type="button"
                    onClick={() => setViewLayoutModalOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Label className="cursor-pointer text-xs">{t('headerSetting.viewLayout')}</Label>
                    <LayoutTemplate className="h-4 w-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShortcutModalOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Label className="cursor-pointer text-xs">{t('headerSetting.shortcutSetting')}</Label>
                    <Keyboard className="h-4 w-4 shrink-0" />
                  </button>
                </SettingsSection>

                <SettingsSection title={t('headerSetting.groups.ai')}>
                  <button
                    type="button"
                    onClick={() => setAiSettingsModalOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Label className="cursor-pointer text-xs">{t('headerSetting.aiSetting')}</Label>
                    <CloudLightning className="h-4 w-4 shrink-0" />
                  </button>
                </SettingsSection>
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
        onOpenChange={(open) => !open && handleClosePreload()}
      >
        <DialogContent className="max-w-4xl sm:max-w-4xl h-[90vh] flex flex-col p-0 border-border">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('menu.dataPreload')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataPreload onClose={handleClosePreload} isCreatingProject={isCreatingProject} />
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
