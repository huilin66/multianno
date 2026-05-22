// src/components/modules/DataImport.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { importData, loadProjectMetaFromServer, analyzeWorkspaceFolders } from '../../api/client';
import { loadAllProjectAnnotations } from '../../lib/annotationUtils';
import { SUPPORTED_TASKS, FORMAT_DETAILS, type TaskType } from '../../config/supportedFormats';
import {
  Folder, FileText, Image, Loader2, Check, X,
  ChevronRight, RotateCcw, FolderSearch, AlertCircle, Tag
} from 'lucide-react';

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

function Field({ label, children, className }: FieldProps) {
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const DefaultImportConfig = {
  taskType: 'object_detection' as TaskType,
  format: 'yolo',
  extension: '.txt',
  mergeStrategy: 'append' as 'append' | 'overwrite' | 'skip' | 'mirror',
  customSuffix: '',
};

export function DataImport({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();

  const folders = useStore(s => s.folders);
  const views = useStore(s => s.views);
  const workspacePath = useStore(s => s.workspacePath);

  const mainViewFolder = folders?.find((f: any) =>
    f.id === views?.find((v: any) => v.isMain)?.folderId
  ) || folders?.[0];
  const safeWorkspaceDir = workspacePath || mainViewFolder?.path || '';

  // --- 导航 ---
  const [activeStep, setActiveStep] = useState('task');

  // --- Card 1: Task & Format ---
  const [taskType, setTaskType] = useState<TaskType>(DefaultImportConfig.taskType);
  const [format, setFormat] = useState(DefaultImportConfig.format);
  const [extension, setExtension] = useState(DefaultImportConfig.extension);
  const [mergeStrategy, setMergeStrategy] = useState<'append' | 'overwrite' | 'skip' | 'mirror'>(DefaultImportConfig.mergeStrategy);
  const [customSuffix, setCustomSuffix] = useState(DefaultImportConfig.customSuffix);

  // --- Card 2: Source ---
  const [sourceDataPath, setSourceDataPath] = useState('');
  const [externalClassFile, setExternalClassFile] = useState('');
  const [importZeroClass, setImportZeroClass] = useState(false);
  const [cocoMode, setCocoMode] = useState<'polygon' | 'bbox'>('polygon');

  // --- Card 3: Target ---
  const [targetWorkspaceDir, setTargetWorkspaceDir] = useState(safeWorkspaceDir);

  // --- 通用 ---
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');

  // --- 文件浏览器 ---
  const [explorerConfig, setExplorerConfig] = useState<{
    open: boolean;
    type: 'dir' | 'file';
    target: 'source' | 'class_file';
    initialPath?: string;
  }>({ open: false, type: 'dir', target: 'source' });

  // ==========================================
  // 初始化
  // ==========================================
  useEffect(() => {
    const available = SUPPORTED_TASKS[taskType]?.formats;
    if (available && !available.includes(format)) setFormat(available[0]);
  }, [taskType]);

  useEffect(() => {
    const detail = FORMAT_DETAILS[format];
    if (detail && !detail.extensions.includes(extension)) {
      setExtension(detail.defaultExtension);
    }
  }, [format]);

  // ==========================================
  // 步骤定义
  // ==========================================
  const steps = [
    { id: 'task', label: t('dataImport.steps.task'), icon: <Tag className="w-4 h-4" />, required: true },
    { id: 'source', label: t('dataImport.steps.source'), icon: <Folder className="w-4 h-4" />, required: true },
    { id: 'target', label: t('dataImport.steps.target'), icon: <FolderSearch className="w-4 h-4" />, required: true },
  ];

  const getStepStatus = (stepId: string): 'current' | 'done' | 'pending' => {
    if (activeStep === stepId) return 'current';
    switch (stepId) {
      case 'task': return 'done';
      case 'source': return sourceDataPath ? 'done' : 'pending';
      case 'target': return targetWorkspaceDir ? 'done' : 'pending';
      default: return 'pending';
    }
  };

  // ==========================================
  // 操作函数
  // ==========================================
  const handleExecute = async () => {
    if (!sourceDataPath) return;
    if ((format === 'yolo' || format === 'images_only') && !externalClassFile) {
      alert(t('dataImport.alerts.needClassFile'));
      return;
    }
    if (!targetWorkspaceDir) {
      alert(t('dataImport.alerts.noWorkspace'));
      return;
    }

    setIsImporting(true);
    setImportStatus('importing');

    try {
      const res = await importData({
        source_path: sourceDataPath,
        target_dir: targetWorkspaceDir,
        format,
        merge_strategy: mergeStrategy,
        classes_file: externalClassFile,
        custom_suffix: customSuffix,
        import_zero_class: importZeroClass,
        coco_mode: cocoMode,
      });

      // 热重载
      const { projectMetaPath } = useStore.getState();
      if (projectMetaPath) {
        try {
          const meta = await loadProjectMetaFromServer(projectMetaPath);
          useStore.getState().loadProjectMeta(meta);

          if (meta.folders && meta.folders.length > 0) {
            const analyzeResult = await analyzeWorkspaceFolders(
              meta.folders.map((f: any) => ({ path: f.path, suffix: f.suffix || '' }))
            );
            if (analyzeResult.commonStems?.length > 0) {
              useStore.getState().setStems(analyzeResult.commonStems);
              useStore.getState().setSceneGroups(analyzeResult.sceneGroups);
              useStore.getState().setCurrentStem(analyzeResult.commonStems[0]);

              const mainFolder = meta.folders.find((f: any) =>
                f.Id === meta.views?.find((v: any) => v.isMain)?.["folder id"]
              ) || meta.folders[0];

              const loadPath = useStore.getState().workspacePath || mainFolder?.path || '';
              if (loadPath) {
                loadAllProjectAnnotations(analyzeResult.commonStems, loadPath);
              }
            }
          }
        } catch (refreshErr) {
          console.error("Refresh failed:", refreshErr);
        }
      }

      setImportStatus('done');
      onClose?.();
    } catch (err: any) {
      setImportStatus('error');
      setTimeout(() => setImportStatus('idle'), 3000);
    } finally {
      setIsImporting(false);
    }
  };

  const getSourceLabel = () => {
    switch (format) {
      case 'yolo': return t('dataImport.source.yoloFolder');
      case 'coco': return t('dataImport.source.cocoFile');
      case 'multianno': return t('dataImport.source.multiannoFolder');
      case 'images_only': return t('dataImport.source.maskFolder');
      default: return t('dataImport.source.select');
    }
  };

  const getSourceIcon = () => {
    switch (format) {
      case 'coco': return <FileText className="w-4 h-4 mr-2 shrink-0" />;
      case 'images_only': return <Image className="w-4 h-4 mr-2 shrink-0" />;
      default: return <Folder className="w-4 h-4 mr-2 shrink-0" />;
    }
  };

  // ==========================================
  // 渲染内容
  // ==========================================
  const renderStepContent = () => {
    switch (activeStep) {
      case 'task':
        return (
          <div className="space-y-5">

            {/* 1. Task */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                {t('dataImport.task.task')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(SUPPORTED_TASKS).map(([id, info]) => (
                  <div
                    key={id}
                    onClick={() => setTaskType(id as TaskType)}
                    className={`p-3 rounded-xl border-2 cursor-pointer text-center transition-all ${
                      taskType === id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className={`text-xs font-bold ${taskType === id ? 'text-primary' : 'text-foreground'}`}>
                      {info.label}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {info.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* 2. Format */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                {t('dataImport.task.format')}
              </Label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_TASKS[taskType]?.formats.map(fId => (
                  <div
                    key={fId}
                    onClick={() => { setFormat(fId); setSourceDataPath(''); }}
                    className={`p-3 rounded-xl border-2 cursor-pointer text-center transition-all min-w-[90px] ${
                      format === fId
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className={`text-xs font-bold ${format === fId ? 'text-primary' : 'text-foreground'}`}>
                      {FORMAT_DETAILS[fId].label}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">
                      {FORMAT_DETAILS[fId].defaultExtension}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* 3. Suffix + Extension */}
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('dataImport.task.suffix')}>
                <Input value={customSuffix} onChange={(e) => setCustomSuffix(e.target.value)}
                  className="h-9 text-xs font-mono" placeholder="_RGB" />
              </Field>
              <Field label={t('dataImport.task.extension')}>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_DETAILS[format]?.extensions.map(ext => {
                    const isSingle = FORMAT_DETAILS[format].extensions.length === 1;
                    return (
                      <div
                        key={ext}
                        onClick={() => !isSingle && setExtension(ext)}
                        className={`p-3 rounded-xl border-2 text-center min-w-[80px] transition-all ${
                          extension === ext
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : isSingle
                              ? 'border-primary/30 bg-muted/50 cursor-default'
                              : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30 cursor-pointer'
                        }`}
                      >
                        <div className="text-xs font-mono font-bold">{ext}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {FORMAT_DETAILS[format].label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Field>
            </div>

            <div className="h-px bg-border" />

            {/* 4. Merge Strategy */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                {t('dataImport.task.strategy')}
              </Label>
              <div className="flex flex-wrap gap-2">
                {(['append', 'overwrite', 'skip', 'mirror'] as const).map(strategy => (
                  <div
                    key={strategy}
                    onClick={() => setMergeStrategy(strategy)}
                    className={`p-3 rounded-xl border-2 cursor-pointer text-center min-w-[90px] transition-all ${
                      mergeStrategy === strategy
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className={`text-xs font-bold ${mergeStrategy === strategy ? 'text-primary' : 'text-foreground'}`}>
                      {t(`dataImport.task.${strategy}`)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        );

      case 'source':
        return (
          <div className="space-y-5">
            <div className="p-5 rounded-xl border bg-muted/20 space-y-4">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('dataImport.source.title')}
              </Label>
              <Field label={getSourceLabel()}>
                <div className="relative">
                  <Input
                    value={sourceDataPath}
                    onChange={(e) => setSourceDataPath(e.target.value)}
                    placeholder={t('dataImport.source.placeholder')}
                    className="h-9 text-xs pr-9 font-mono"
                  />
                  <button
                    onClick={() => setExplorerConfig({
                      open: true,
                      type: format === 'coco' ? 'file' : 'dir',
                      target: 'source',
                      initialPath: sourceDataPath,
                    })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <FolderSearch size={14} />
                  </button>
                </div>
              </Field>

              {(format === 'yolo' || format === 'images_only') && (
                <div className="pt-3 border-t border-border">
                  <Label className="text-[10px] text-amber-600 flex items-center gap-1 mb-2">
                    <AlertCircle className="w-3 h-3" />
                    {t('dataImport.source.classFileRequired')}
                  </Label>
                  <div className="relative">
                    <Input
                      value={externalClassFile}
                      readOnly
                      placeholder={t('dataImport.source.selectClassFile')}
                      className="h-9 text-xs pr-9 font-mono cursor-pointer"
                      onClick={() => setExplorerConfig({
                        open: true,
                        type: 'file',
                        target: 'class_file',
                        initialPath: externalClassFile,
                      })}
                    />
                    <FileText className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}

              {format === 'images_only' && (
                <div className="flex items-center gap-3 pt-2">
                  <Label className="text-[10px] text-muted-foreground">{t('dataImport.source.importZero')}</Label>
                  <Switch checked={importZeroClass} onCheckedChange={setImportZeroClass} />
                </div>
              )}

              {format === 'coco' && (
                <Field label={t('dataImport.source.cocoMode')}>
                  <div className="flex flex-wrap gap-2">
                    {(['polygon', 'bbox'] as const).map(mode => (
                      <div
                        key={mode}
                        onClick={() => setCocoMode(mode)}
                        className={`p-3 rounded-xl border-2 cursor-pointer text-center min-w-[80px] transition-all ${
                          cocoMode === mode
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                        }`}
                      >
                        <div className={`text-xs font-bold ${cocoMode === mode ? 'text-primary' : 'text-foreground'}`}>
                          {mode === 'polygon' ? t('dataImport.source.polygon') : t('dataImport.source.bbox')}
                        </div>
                      </div>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          </div>
        );

      case 'target':
        return (
          <div className="space-y-5">
            <div className="p-5 rounded-xl border bg-muted/20 space-y-4">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('dataImport.target.title')}
              </Label>
              <Field label={t('dataImport.target.workspace')}>
                <div className="relative">
                  <Input
                    value={targetWorkspaceDir}
                    onChange={(e) => setTargetWorkspaceDir(e.target.value)}
                    placeholder={safeWorkspaceDir}
                    className="h-9 text-xs pr-9 font-mono"
                  />
                  <button
                    onClick={() => setExplorerConfig({
                      open: true,
                      type: 'dir',
                      target: 'source',
                      initialPath: targetWorkspaceDir,
                    })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <FolderSearch size={14} />
                  </button>
                </div>
              </Field>
              <p className="text-[10px] text-muted-foreground">
                {t('dataImport.target.hint')} <span className="font-mono">{safeWorkspaceDir}</span>
              </p>
            </div>
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
        {/* 左侧导航 */}
        <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {steps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`w-full flex items-stretch text-left transition-all mb-0.5 rounded-lg overflow-hidden ${
                    status === 'current' ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <div className={`w-1 shrink-0 rounded-full my-1.5 ml-1 transition-colors ${
                    status === 'done' ? 'bg-emerald-400' :
                    status === 'current' ? 'bg-primary' :
                    step.required && status === 'pending' ? 'bg-red-400' :
                    'bg-muted-foreground/25'
                  }`} />
                  <div className={`flex-1 py-2.5 px-3 min-w-0 text-xs truncate transition-colors ${
                    status === 'current' ? 'text-primary font-semibold' :
                    status === 'done' ? 'text-foreground font-medium' :
                    'text-muted-foreground'
                  }`}>
                    <span className="flex items-center gap-2">
                      {step.icon}
                      {step.label}
                    </span>
                  </div>
                  {status === 'current' && <ChevronRight className="w-3 h-3 text-primary shrink-0 my-auto mr-2" />}
                </button>
              );
            })}
          </div>
          <div className="p-3 border-t border-border space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />{t('dataImport.legend.required')}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />{t('dataImport.legend.configured')}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />{t('dataImport.legend.current')}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/25 shrink-0" />{t('dataImport.legend.default')}
            </div>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold">
                  {steps.find(s => s.id === activeStep)?.label}
                </h3>
                <Button variant="ghost" size="sm"
                  onClick={() => {
                    if (activeStep === 'task') {
                      setTaskType(DefaultImportConfig.taskType);
                      setFormat(DefaultImportConfig.format);
                      setExtension(DefaultImportConfig.extension);
                      setMergeStrategy(DefaultImportConfig.mergeStrategy);
                      setCustomSuffix(DefaultImportConfig.customSuffix);
                    } else if (activeStep === 'source') {
                      setSourceDataPath('');
                      setExternalClassFile('');
                      setImportZeroClass(false);
                      setCocoMode('polygon');
                    } else if (activeStep === 'target') {
                      setTargetWorkspaceDir(safeWorkspaceDir);
                    }
                  }}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t('common.reset')}
                </Button>
              </div>
              <div key={activeStep}>{renderStepContent()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
        {importStatus === 'importing' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('dataImport.importing')}
          </div>
        ) : importStatus === 'done' ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <Check className="w-4 h-4" />{t('dataImport.success')}
          </div>
        ) : importStatus === 'error' ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <X className="w-4 h-4" />{t('dataImport.failed')}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t('dataImport.ready')}</span>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" size="sm" onClick={isImporting ? () => {} : onClose}>
            {isImporting ? <>{t('common.stop')}</> : <>{t('common.cancel')}</>}
          </Button>
          <Button size="sm" className="text-white" onClick={handleExecute}
            disabled={isImporting || !sourceDataPath || !targetWorkspaceDir}>
            {isImporting ? <>{t('dataImport.importing')}</> : <>{t('common.confirm')}</>}
          </Button>
        </div>
      </div>

      <FileExplorerDialog
        open={explorerConfig.open}
        initialPath={explorerConfig.initialPath || '/'}
        selectType={explorerConfig.type}
        onClose={() => setExplorerConfig(prev => ({ ...prev, open: false }))}
        onConfirm={(paths) => {
          if (explorerConfig.target === 'source') setSourceDataPath(paths[0]);
          else if (explorerConfig.target === 'class_file') setExternalClassFile(paths[0]);
          setExplorerConfig(prev => ({ ...prev, open: false }));
        }}
      />
    </div>
  );
}