import './i18n';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Menu, Settings, Airplay, CloudLightning, Tag, Download, FolderOpen, Database, FolderPlus, Upload, Sun, Moon, Tags, Keyboard } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import { useAnnotationAutoSave } from './hooks/useAnnotationAutoSave';
import { ShortcutSettingsModal } from './components/modules/settings/ShortcutSettingsModal';
import { AISettingsModal } from './components/modules/settings/AISettingsModal';
import { useMetaAutoSave } from './hooks/useMetaAutoSave';
import { LocalVisualization } from './components/modules/LocalVisualization';
import { GlobalConfirmDialog } from './components/modules/GlobalConfirmDialog';

export default function App() {
  const { folders, activeModule, setActiveModule, currentStem, projectName, theme, setTheme, language, setLanguage, editorSettings, updateEditorSettings } = useStore();

  const { t, i18n } = useTranslation();
  const { annotationSaveStatus, annotationLastSavedTime, autoSave } = useAnnotationAutoSave();
  const { metaSaveStatus, metaLastSavedTime } = useMetaAutoSave();

  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [aiSettingsModalOpen, setAiSettingsModalOpen] = useState(false);

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
                <Upload className="w-4 h-4 mr-2" /> {t('menu.loadProject')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('preload')}>
                <FolderOpen className="w-4 h-4 mr-2" /> {t('menu.dataPreload')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('extent')}>
                <Settings className="w-4 h-4 mr-2" /> {t('menu.viewExtentCheck')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('meta')}>
                <Database className="w-4 h-4 mr-2" /> {t('menu.projectMeta')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule('taxonomy')}>
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
            {folders && folders.length > 0 && (metaSaveStatus !== 'idle' || metaLastSavedTime) && (
              <div
                title={metaSaveStatus === 'error' ? t('header.projectMetaNotSaved') : t('header.projectMetaSaved') + ' ' + metaLastSavedTime}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-all duration-300 ${metaSaveStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
                    : metaSaveStatus === 'saving'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300'
                  }`}
              >
                {metaSaveStatus === 'saving' ? (
                  <CloudLightning className="w-3 h-3 animate-pulse" />
                ) : (
                  <Database className="w-3 h-3 opacity-70" />
                )}
                {metaSaveStatus === 'error'
                  ? t('common.error', 'Error')
                  : metaSaveStatus === 'saving'
                    ? t('common.saving', 'Saving...')
                    : t('common.saved', 'Saved ') + metaLastSavedTime}
              </div>
            )}
            <div className="h-4 w-[1px] bg-neutral-100 dark:bg-neutral-900 transition-colors mx-1" />
            {currentStem && (annotationSaveStatus !== 'idle' || annotationLastSavedTime) && (
              <div
                title={annotationSaveStatus === 'error' ? t('header.annotationNotSaved') : t('header.annotationSaved') + ' ' + annotationLastSavedTime}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-all duration-300 ${annotationSaveStatus === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
                    : annotationSaveStatus === 'saving'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400'
                      : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
              >
                {annotationSaveStatus === 'saving' ? (
                  <CloudLightning className="w-3 h-3 animate-pulse" />
                ) : (
                  <Tag className="w-3 h-3 opacity-70" />
                )}
                {annotationSaveStatus === 'error'
                  ? t('common.error', 'Error')
                  : annotationSaveStatus === 'saving'
                    ? t('common.saving', 'Saving...')
                    : t('common.saved', 'Saved ') + annotationLastSavedTime}
              </div>
            )}
          </div>
        </div>

        {/* Right Menu: Settings + Theme Switch + Language Switch */}
        <div className="w-1/3 flex justify-end items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-full"
                title={t('header.settings')}
              >
                <Settings className="w-4 h-4" />
              </Button>
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
                  <Label className="text-xs">{t('headerSetting.continuousDrawing')}</Label>
                  <Switch
                    checked={editorSettings.continuousDrawing}
                    onCheckedChange={(v) => updateEditorSettings({ continuousDrawing: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('headerSetting.showAnnotationToolLabel')}</Label>
                  <Switch
                    checked={editorSettings.showToolLabels}
                    onCheckedChange={(v) => updateEditorSettings({ showToolLabels: v })}
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
                  onClick={() => setShortcutModalOpen(true)}
                  className="flex items-center justify-between w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-0.5 py-0.5 transition-colors"
                >
                  <Label className="text-xs cursor-pointer">{t('headerSetting.shortcutSetting')}</Label>
                  <Keyboard className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                </button>
                <button
                  onClick={() => setAiSettingsModalOpen(true)}
                  className="flex items-center justify-between w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-0.5 py-0.5 transition-colors"
                >
                  <Label className="text-xs cursor-pointer">{t('headerSetting.aiSetting')}</Label>
                  <CloudLightning className="w-3.5 h-3.5 text-blue-400 dark:text-blue-300" />
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

      {/* ============== 以下是各种 Dialog 容器 ============== */}

      {/* 🌟 新增：Create Project 弹窗 */}
      <Dialog
        open={activeModule === 'createproject'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        {/* 🌟 修复后：去掉了 bg-neutral-900 text-white 等，使用标准样式 */}
        <DialogContent className="max-w-md w-[95vw] h-auto flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" /> {t('menu.createProject')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            {/* 传入 onClose 回调，以便组件内部点 Cancel 时可以关闭弹窗 */}
            <CreateProject onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 🌟 新增：Load Project 弹窗 */}
      <Dialog
        open={activeModule === 'loadproject'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        {/* 🌟 修复后：去掉硬编码颜色 */}
        <DialogContent className="max-w-md w-[95vw] h-auto flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> {t('menu.loadProject')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <LoadProject
              onClose={() => setActiveModule('workspace')}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 原有的 Preload 弹窗 */}
      <Dialog
        open={activeModule === 'preload'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle>{t('menu.dataPreload')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <DataPreload />
          </div>
        </DialogContent>
      </Dialog>

      {/* 原有的 Extent Check 弹窗 */}
      <Dialog
        open={activeModule === 'extent'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-6xl sm:max-w-6xl h-[90vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle>{t('menu.viewExtentCheck')}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ViewExtentCheck />
          </div>
        </DialogContent>
      </Dialog>


      {/* 统一格式的 Project Meta 弹窗 */}
      <Dialog
        open={activeModule === 'meta'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] h-[85vh] flex flex-col p-0 bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
              <Database className="w-5 h-5 text-blue-400" /> {t('menu.projectMeta')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-hidden relative">
            <ProjectMetaDashboard onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>
      {/* 🌟 新增：Taxonomy Manager 弹窗 */}
      <Dialog
        open={activeModule === 'taxonomy'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {/* 🌟 1. 补齐缺失的标准头部 (DialogHeader) */}
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900">
            <DialogTitle className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
              <Tags className="w-5 h-5 text-primary" /> {t('menu.taxonomyManager')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-grow overflow-hidden relative">
            {/* 🌟 2. 传入标准的 onClose 回调 */}
            <TaxonomyDashboard onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>
      {/* 🌟 数据导入/导出 统一弹窗 */}
      {/* 🌟 导入弹窗 */}
      <Dialog
        open={activeModule === 'exchange_import'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-2xl sm:max-w-2xl h-[70vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden shadow-2xl">
          <DataImport onClose={() => setActiveModule('workspace')} />
        </DialogContent>
      </Dialog>

      {/* 🌟 导出弹窗 */}
      <Dialog
        open={activeModule === 'exchange_export'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-3xl sm:max-w-3xl h-[85vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden shadow-2xl">
          <DataExport onClose={() => setActiveModule('workspace')} />
        </DialogContent>
      </Dialog>

      {/* 🌟 新增：Local Visualization 弹窗 */}
      <Dialog
        open={activeModule === 'local_visualization'}
        onOpenChange={(open) => !open && setActiveModule('workspace')}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden shadow-2xl">

          {/* 🌟 补充标准头部，保持与其他模块高度一致 */}
          <DialogHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900">
            <DialogTitle className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
              <Airplay className="w-5 h-5 text-indigo-500" /> {t('menu.localVisualization', '本地可视化引擎')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-grow overflow-hidden relative">
            <LocalVisualization onClose={() => setActiveModule('workspace')} />
          </div>
        </DialogContent>
      </Dialog>
      <ShortcutSettingsModal
        open={shortcutModalOpen}
        onClose={() => setShortcutModalOpen(false)}
      />

      <AISettingsModal
        open={aiSettingsModalOpen}
        onClose={() => setAiSettingsModalOpen(false)}
      />
      <GlobalConfirmDialog />
    </div>
  );
}