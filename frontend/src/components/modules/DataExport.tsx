// src/components/modules/DataExport.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import Slider from 'rc-slider';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { exportData, getFileContent } from '../../api/client';
import {
  SUPPORTED_TASKS,
  FORMAT_DETAILS,
  ALL_SHAPES,
  TASK_SHAPE_MAPPINGS,
  IMAGE_EXT_MAP,
  type TaskType,
  type ShapeStatus,
} from '../../config/supportedFormats';
import {
  Download, FolderSearch, FileText, RotateCcw, GripVertical,
  Check, X, Loader2, Tag, Layers, FolderOpen, Image, CircleDot,
  ChevronRight, AlertCircle
} from 'lucide-react';
import 'rc-slider/assets/index.css';


interface ViewExportConfig {
  viewId: string;
  viewName: string;
  suffix: string;
  extension: string;
  subdir: string;
  keepOriginal: boolean;
}

interface StepItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  required: boolean;
  visible: boolean;
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;  // 🆕 添加
}

function Field({ label, children, className }: FieldProps) {
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const DefaultSplitConfig = {
  splitTrain: 80,
  splitVal: 15,
  splitTest: 5,
  randomSeed: 42,
  splitTrainFile: 'train.txt',
  splitValFile: 'val.txt',
  splitTestFile: 'test.txt',
}
// ==========================================
// 主组件
// ==========================================
export function DataExport({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();

  // --- Store ---
  const folders = useStore(s => s.folders);
  const views = useStore(s => s.views);
  const stems = useStore(s => s.stems);
  const taxonomyClasses = useStore(s => s.taxonomyClasses) || [];
  const workspacePath = useStore(s => s.workspacePath);

  // --- 导航 ---
  const [activeStep, setActiveStep] = useState('task');

  // --- Card 1: Task & Format & Export Mode ---
  const [taskType, setTaskType] = useState<TaskType>('object_detection');
  const [format, setFormat] = useState('yolo');
  const [exportMode, setExportMode] = useState<'annotation' | 'dataset'>('annotation');

  // --- Card 2: Annotation File Naming ---
  const [annoExtension, setAnnoExtension] = useState('.txt');
  const [annoSubdir, setAnnoSubdir] = useState('labels');
  const [annoSuffix, setAnnoSuffix] = useState('');

  // --- Card 3: Image Output (仅 Dataset) ---
  const [viewConfigs, setViewConfigs] = useState<ViewExportConfig[]>([]);

  // --- Card 4: Dataset Split (仅 Dataset) ---
  const [splitTrain, setSplitTrain] = useState(DefaultSplitConfig.splitTrain);
  const [splitVal, setSplitVal] = useState(DefaultSplitConfig.splitVal);
  const [splitTest, setSplitTest] = useState(DefaultSplitConfig.splitTest);
  const [randomSeed, setRandomSeed] = useState(DefaultSplitConfig.randomSeed);
  const [splitTrainFile, setSplitTrainFile] = useState(DefaultSplitConfig.splitTrainFile);
  const [splitValFile, setSplitValFile] = useState(DefaultSplitConfig.splitValFile);
  const [splitTestFile, setSplitTestFile] = useState(DefaultSplitConfig.splitTestFile);

  // --- Card 5: Shape Filter & Class Order ---
  const [shapeSelection, setShapeSelection] = useState<Record<string, boolean>>({});
  const [exportClasses, setExportClasses] = useState<any[]>([]);
  const [classSource, setClassSource] = useState<'panel' | 'file'>('panel');
  const [classFilePath, setClassFilePath] = useState('');

  // --- Card 6: Target Folder ---
  const [targetDir, setTargetDir] = useState('');
  const [generateReport, setGenerateReport] = useState(true);

  // --- 通用 ---
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // --- 文件浏览器 ---
  const [explorerConfig, setExplorerConfig] = useState<{
    open: boolean;
    type: 'dir' | 'file';
    target: 'target_dir' | 'class_file';
    initialPath?: string;
  }>({ open: false, type: 'dir', target: 'target_dir' });

  // 步骤状态判断
  const getStepStatus = (stepId: string): 'current' | 'done' | 'default' | 'pending' => {
    if (activeStep === stepId) return 'current';
    
    switch (stepId) {
      case 'task':
        return 'done';
      case 'naming':
        return annoSuffix !== '' || annoExtension !== FORMAT_DETAILS[format]?.defaultExtension ? 'done' : 'default';
      case 'images':
        return viewConfigs.some(vc => !vc.keepOriginal || vc.suffix !== '') ? 'done' : 'default';
      case 'split':
        return splitTrain !== 80 || splitVal !== 15 ? 'done' : 'default';
      case 'shapes':
        return classSource === 'file' || exportClasses.some(c => !c.selected) ? 'done' : 'default';
      case 'target':
        return targetDir !== '' ? 'done' : 'pending';
      default:
        return 'pending';
    }
  };
  useEffect(() => {
    if (views.length === 0) return;
    const extMap: Record<string, string> = {
      'TIFF': '.tif', 'TIF': '.tif', 'PNG': '.png', 'JPEG': '.jpg', 'JPG': '.jpg',
    };
    const configs: ViewExportConfig[] = views.map((v: any, i: number) => {
      const folder = folders.find((f: any) => f.id === v.folderId);
      return {
        viewId: v.id,
        viewName: v.isMain ? 'Main View' : `Aug View ${i}`,
        suffix: folder?.suffix || '',
        extension: extMap[folder?.metadata?.fileType?.toUpperCase() || ''] || '.tif',
        subdir: `${v.isMain ? 'main' : `aug_${i}`}`,
        keepOriginal: false,
      };
    });
    setViewConfigs(configs);
  }, [views, folders]);

  const resetClasses = useCallback(() => {
    const mapped = taxonomyClasses.map((c: any) => ({
      ...c, selected: c.name.toLowerCase() !== 'background'
    }));
    mapped.sort((a: any, b: any) => {
      if (a.name.toLowerCase() === 'background') return -1;
      if (b.name.toLowerCase() === 'background') return 1;
      return 0;
    });
    setExportClasses(mapped);
    setClassFilePath('');
    setClassSource('panel');
  }, [taxonomyClasses]);

  useEffect(() => { resetClasses(); }, [resetClasses]);

  useEffect(() => {
    const available = SUPPORTED_TASKS[taskType]?.formats;
    if (available && !available.includes(format)) setFormat(available[0]);
  }, [taskType]);

  useEffect(() => {
    const detail = FORMAT_DETAILS[format];
    if (detail && !detail.extensions.includes(annoExtension)) {
      setAnnoExtension(detail.defaultExtension);
    }
  }, [format]);

  useEffect(() => {
    const mapping = TASK_SHAPE_MAPPINGS[taskType];
    const sel: Record<string, boolean> = {};
    ALL_SHAPES.forEach(s => { sel[s] = mapping[s] !== 'incompatible'; });
    setShapeSelection(sel);
  }, [taskType]);

  useEffect(() => {
    const sum = splitTrain + splitVal + splitTest;
    if (sum !== 100) setSplitTest(prev => Math.max(0, prev + (100 - sum)));
  }, [splitTrain, splitVal]);

  // ==========================================
  // 步骤定义
  // ==========================================
  const steps: StepItem[] = useMemo(() => [
    { id: 'task', label: t('dataExport.stepTask.title'), icon: <Tag className="w-4 h-4" />, required: true, visible: true },
    { id: 'naming', label: t('dataExport.stepNaming.title'), icon: <FileText className="w-4 h-4" />, required: false, visible: true },
    { id: 'images', label: t('dataExport.stepImages.title'), icon: <Image className="w-4 h-4" />, required: false, visible: exportMode === 'dataset' },
    { id: 'split', label: t('dataExport.stepSplit.title'), icon: <Layers className="w-4 h-4" />, required: false, visible: exportMode === 'dataset' },
    { id: 'shapes', label: t('dataExport.stepShapes.title'), icon: <GripVertical className="w-4 h-4" />, required: false, visible: true },
    { id: 'target', label: t('dataExport.stepTarget.title'), icon: <FolderOpen className="w-4 h-4" />, required: true, visible: true },
  ], [t, exportMode]);

  const visibleSteps = steps.filter(s => s.visible);

  // ==========================================
  // 操作函数
  // ==========================================
  const moveClass = (dragIndex: number, hoverIndex: number) => {
    setExportClasses(prev => {
      const list = [...prev];
      const [item] = list.splice(dragIndex, 1);
      list.splice(hoverIndex, 0, item);
      return list;
    });
  };
  const buildDefaultViewConfigs = useCallback(() => {
    return views.map((v: any, i: number) => {
      const folder = folders.find((f: any) => f.id === v.folderId);
      const rawSuffix = folder?.suffix || '';
      let suffix = rawSuffix;
      let ext = '';
      const knownExts = ['.tif', '.tiff', '.png', '.jpg', '.jpeg', '.bmp'];
      for (const e of knownExts) {
        if (rawSuffix.toLowerCase().endsWith(e)) {
          suffix = rawSuffix.slice(0, -e.length);
          ext = e;
          break;
        }
      }
      if (!ext) ext = IMAGE_EXT_MAP[folder?.metadata?.fileType?.toUpperCase() || ''] || '.tif';
      return {
        viewId: v.id,
        viewName: v.isMain ? 'Main View' : `Aug View ${i}`,
        suffix,
        extension: ext,
        subdir: v.isMain ? 'main' : `aug_${i}`,
        keepOriginal: false,
      };
    });
  }, [views, folders]);
  const handleLoadClassFile = async (paths: string[]) => {
    setExplorerConfig(prev => ({ ...prev, open: false }));
    if (paths.length === 0) return;
    setClassFilePath(paths[0]);
    try {
      const { content } = await getFileContent(paths[0]);
      const imported = content.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const existing = taxonomyClasses.map((c: any) => c.name);
      const missing = imported.filter((n: string) => !existing.includes(n));
      if (missing.length > 0) {
        alert(`${t('dataExport.classMismatch')}: ${missing.join(', ')}`);
        return;
      }
      setExportClasses([
        ...imported.map((n: string) => ({ ...taxonomyClasses.find((c: any) => c.name === n), selected: true })),
        ...taxonomyClasses.filter((c: any) => !imported.includes(c.name)).map((c: any) => ({ ...c, selected: false }))
      ]);
    } catch {
      alert(t('dataExport.readFailed'));
    }
  };

  const handleExecute = async () => {
    if (!targetDir) { alert(t('dataExport.selectTarget')); return; }

    const selectedClassNames = exportClasses.filter(c => c.selected).map(c => c.name);
    const allowedShapes = Object.entries(shapeSelection).filter(([, v]) => v).map(([s]) => s);

    setIsExporting(true);
    setExportProgress(0);

    try {
      if (exportMode === 'dataset') {
        const total = stems.length;
        const CHUNK = Math.max(1, Math.ceil(total / 50));
        for (let i = 0; i < total; i += CHUNK) {
          await exportData({
            source_dirs: [workspacePath],
            target_dir: targetDir,
            task_type: taskType, format,
            selected_classes: selectedClassNames,
            custom_suffix: '', extension: annoExtension,
            allowed_shapes: allowedShapes,
            generate_report: false,
            stems: stems.slice(i, i + CHUNK),
            export_mode: 'dataset',
            anno_subdir: annoSubdir,
            view_configs: viewConfigs.map(vc => ({ suffix: vc.suffix, extension: vc.extension, subdir: vc.subdir, keep_original: vc.keepOriginal })),
            split: { train: splitTrain, val: splitVal, test: splitTest },
            random_seed: randomSeed,
          });
          setExportProgress(Math.min(100, Math.round(((i + CHUNK) / total) * 100)));
        }
      } else {
        await exportData({
          source_dirs: [workspacePath],
          target_dir: targetDir,
          task_type: taskType, format,
          selected_classes: selectedClassNames,
          custom_suffix: '', extension: annoExtension,
          allowed_shapes: allowedShapes,
          generate_report: generateReport,
          export_mode: 'annotation',
        });
        setExportProgress(100);
      }
      alert(t('dataExport.success'));
      onClose?.();
    } catch (err: any) {
      alert(`${t('dataExport.failed')}: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const checkedNames = useMemo(() => exportClasses.filter(c => c.selected).map(c => c.name), [exportClasses]);

  // ==========================================
  // 渲染右侧内容
  // ==========================================
  const renderStepContent = () => {
    switch (activeStep) {
      case 'task':
        return (
          <div className="space-y-5">

            {/* 1. Export Mode - 最上面，卡片选择 */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                {t('dataExport.stepTask.exportMode')}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: 'annotation',
                    icon: FileText,
                    title: t('dataExport.stepTask.annotation'),
                    desc: t('dataExport.stepTask.annoOnly'),
                  },
                  {
                    id: 'dataset',
                    icon: Image,
                    title: t('dataExport.stepTask.data'),
                    desc: t('dataExport.stepTask.dataFull'),
                  },
                ].map(({ id, icon: Icon, title, desc }) => (
                  <div
                    key={id}
                    onClick={() => setExportMode(id as 'annotation' | 'dataset')}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      exportMode === id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${
                      exportMode === id ? 'bg-primary/10' : 'bg-muted'
                    }`}>
                      <Icon className={`w-5 h-5 ${exportMode === id ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold">{title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* 2. Task - 卡片选择 */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                {t('dataExport.stepTask.task')}
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

            {/* 3. Format - 卡片选择 */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                {t('dataExport.stepTask.format')}
              </Label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_TASKS[taskType]?.formats.map(fId => (
                  <div
                    key={fId}
                    onClick={() => setFormat(fId)}
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

          </div>
        );

      case 'naming':
        return (
          <div className="space-y-5">

            {/* 预览信息 */}
            <div className="p-4 bg-muted/30 rounded-xl border space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                {t('dataExport.stepNaming.preview')}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                {/* 目录名 */}
                <div className="text-muted-foreground/60">
                  {exportMode === 'dataset' ? annoSubdir : '.'}/
                </div>
                {/* 文件列表 */}
                {stems.slice(0, 5).map((stem, i) => (
                  <div key={i} className="pl-3">
                    {stem}
                    <span className="text-amber-500">{annoSuffix}</span>
                    <span className="text-primary">{annoExtension}</span>
                  </div>
                ))}
                {stems.length > 5 && (
                  <div className="pl-3 text-muted-foreground/50">
                    ... {stems.length - 5} {t('dataExport.stepNaming.andMore')}
                  </div>
                )}
              </div>
            </div>

            {/* 配置面板 */}
            <div className="p-5 rounded-xl border bg-muted/20 space-y-4">

              {/* 标题行：Annotation Naming + Reset */}
              {exportMode === 'dataset' && (
                <Field label={t('dataExport.stepNaming.subdir')}>
                  <Input
                    value={annoSubdir}
                    onChange={(e) => setAnnoSubdir(e.target.value)}
                    className="h-9 text-xs font-mono"
                    placeholder="labels"
                  />
                </Field>
              )}

              <Field label={t('dataExport.stepNaming.suffix')}>
                <Input
                  value={annoSuffix}
                  onChange={(e) => setAnnoSuffix(e.target.value)}
                  className="h-9 text-xs font-mono"
                  placeholder={t('common.suffix_example')}
                />
              </Field>

              <div>
                <Label className="text-[10px] text-muted-foreground mb-2 block">
                  {t('dataExport.stepNaming.extension')}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_DETAILS[format]?.extensions.map(ext => {
                    const isSingle = FORMAT_DETAILS[format].extensions.length === 1;
                    return (
                      <div
                        key={ext}
                        onClick={() => !isSingle && setAnnoExtension(ext)}
                        className={`p-3 rounded-xl border-2 text-center min-w-[80px] transition-all ${
                          annoExtension === ext
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
              </div>
            </div>
          </div>
        );
      
      case 'images':
        return (
          <div className="space-y-5">

            {/* 预览信息 — 所有 View 合并展示 */}
            <div className="p-4 bg-muted/30 rounded-xl border space-y-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                {t('dataExport.stepNaming.preview')}
              </div>
              {viewConfigs.map(vc => (
                <div key={vc.viewId} className="space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground/60">
                    {exportMode === 'dataset' ? vc.subdir : '.'}/
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                    {stems.slice(0, 3).map((stem, i) => (
                      <div key={i} className="pl-3">
                        {stem}
                        <span className="text-amber-500">{vc.suffix}</span>
                        <span className="text-primary">{vc.extension}</span>
                      </div>
                    ))}
                    {stems.length > 3 && (
                      <div className="pl-3 text-muted-foreground/50">
                        ... {stems.length - 3} {t('dataExport.stepNaming.andMore')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 配置面板 */}
            {viewConfigs.map(vc => (
              <div key={vc.viewId} className="p-5 rounded-xl border bg-muted/20 space-y-4">

                {/* 标题行 */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {vc.viewName}
                  </Label>
                </div>

                {/* Suffix + Extension 同行 */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('dataExport.stepNaming.suffix')}>
                    <Input
                      value={vc.suffix}
                      onChange={(e) => updateViewConfig(vc.viewId, { suffix: e.target.value })}
                      className="h-9 text-xs font-mono"
                      placeholder={t('common.suffix_example')}
                    />
                  </Field>

                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1.5 block">
                      {t('dataExport.stepNaming.extension')}
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(IMAGE_EXT_MAP)
                        .filter(([key]) => ['PNG', 'JPG', 'TIFF', 'BMP'].includes(key))
                        .map(([, ext]) => (
                          <div
                            key={ext}
                            onClick={() => updateViewConfig(vc.viewId, { extension: ext })}
                            className={`px-3 py-2 rounded-lg border-2 text-center cursor-pointer transition-all ${
                              vc.extension === ext
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                            }`}
                          >
                            <div className="text-[10px] font-mono font-bold">{ext}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Subdir（仅 dataset 模式） */}
                {exportMode === 'dataset' && (
                  <Field label={t('dataExport.stepNaming.subdir')}>
                    <Input
                      value={vc.subdir}
                      onChange={(e) => updateViewConfig(vc.viewId, { subdir: e.target.value })}
                      className="h-9 text-xs font-mono"
                      placeholder={vc.viewName === 'Main View' ? 'main' : 'aug'}
                    />
                  </Field>
                )}
              </div>
            ))}
          </div>
        );
        
      case 'split': {
        // 1. 动态计算滑块条的 3 色渐变背景
        const p1 = splitTrain;
        const p2 = splitTrain + splitVal;
        const sliderGradient = `linear-gradient(to right, 
          #3b82f6 0%, #3b82f6 ${p1}%, 
          #f59e0b ${p1}%, #f59e0b ${p2}%, 
          #ef4444 ${p2}%, #ef4444 100%
        )`;

        return (
          <div className="space-y-5">
            {/* 预览 */}
            <div className="p-4 bg-muted/30 rounded-xl border space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                {t('dataExport.stepSplit.preview')}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground leading-relaxed space-y-1">
                <div className="text-muted-foreground/60">{annoSubdir}/</div>
                {viewConfigs.map(vc => (
                  <div key={vc.viewId} className="text-muted-foreground/60">{vc.subdir}/</div>
                ))}
                <div className="text-blue-500">{splitTrainFile}</div>
                <div className="text-amber-500">{splitValFile}</div>
                <div className="text-red-500">{splitTestFile}</div>
              </div>
            </div>

            {/* 配置面板 */}
            <div className="p-5 rounded-xl border bg-muted/20 space-y-5">

              {/* 三列百分比 + 文件数 */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-0.5">
                  <div className="text-2xl font-bold text-blue-500">{splitTrain}%</div>
                  <div className="text-[10px] text-muted-foreground">Train</div>
                  <div className="text-[10px] font-mono text-blue-500">
                    {Math.round(stems.length * splitTrain / 100)} files
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-2xl font-bold text-amber-500">{splitVal}%</div>
                  <div className="text-[10px] text-muted-foreground">Val</div>
                  <div className="text-[10px] font-mono text-amber-500">
                    {Math.round(stems.length * splitVal / 100)} files
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-2xl font-bold text-red-500">{splitTest}%</div>
                  <div className="text-[10px] text-muted-foreground">Test</div>
                  <div className="text-[10px] font-mono text-red-500">
                    {Math.round(stems.length * splitTest / 100)} files
                  </div>
                </div>
              </div>

              {/* 🌟 Range Slider — 完美切分 蓝/橙/红 三色 */}
              <div className="px-1 pt-1 pb-4">
                <Slider
                  range
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={([v1, v2]: number[]) => {
                    const train = Math.round(v1 * 10) / 10;
                    const val = Math.round((v2 - v1) * 10) / 10;
                    const test = Math.round((100 - v2) * 10) / 10;
                    setSplitTrain(train);
                    setSplitVal(val);
                    setSplitTest(test);
                  }}
                  value={[splitTrain, splitTrain + splitVal]}
                  // 1. 隐藏默认的 track 颜色，全部交给底色 rail 渲染
                  trackStyle={[
                    { background: 'transparent' },
                    { background: 'transparent' },
                  ]}
                  // 2. 将滑块手柄（Handle）的边框颜色改为对应节点的衔接色
                  handleStyle={[
                    { borderColor: '#3b82f6', background: '#fff', width: 18, height: 18, marginTop: -5, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
                    { borderColor: '#f59e0b', background: '#fff', width: 18, height: 18, marginTop: -5, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
                  ]}
                  // 3. 核心：注入动态计算的三段式 CSS 线性渐变
                  railStyle={{ background: sliderGradient, height: 8, borderRadius: 4 }}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'shapes':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">

              {/* Shape Filter 面板 */}
              <div className="p-5 rounded-xl border bg-muted/20 space-y-3">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('dataExport.stepShapes.shapeFilter')}
                </Label>
                <div className="space-y-1">
                  {ALL_SHAPES.map(shape => {
                    const status = TASK_SHAPE_MAPPINGS[taskType]?.[shape] || 'incompatible';
                    const disabled = status === 'incompatible';
                    return (
                      <div key={shape}
                        onClick={() => !disabled && setShapeSelection(prev => ({ ...prev, [shape]: !prev[shape] }))}
                        className={`flex items-center justify-between p-2 rounded border text-xs transition-colors ${
                          disabled ? 'opacity-30 bg-muted cursor-not-allowed' : 'cursor-pointer hover:border-primary bg-background'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={shapeSelection[shape]} disabled={disabled} className="pointer-events-none" />
                          <span className="font-medium capitalize">{shape.replace('_', ' ')}</span>
                        </div>
                        {status === 'convertible' && !disabled && (
                          <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-bold">Convert</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Class Order 面板 */}
              <div className="p-5 rounded-xl border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {t('dataExport.stepShapes.classOrder')}
                  </Label>
                </div>

                {/* Class Source */}
                <div className="flex items-center gap-4 text-[10px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={classSource === 'panel'} onChange={() => setClassSource('panel')} className="text-primary" />{t('dataExport.stepShapes.panel')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={classSource === 'file'} onChange={() => setClassSource('file')} className="text-primary" />{t('dataExport.stepShapes.file')}
                  </label>
                </div>
                {classSource === 'file' && (
                  <div className="relative">
                    <Input value={classFilePath} readOnly placeholder={t('dataExport.selectClassFile')}
                      className="h-8 text-[10px] pr-8 font-mono cursor-pointer"
                      onClick={() => setExplorerConfig({ open: true, type: 'file', target: 'class_file', initialPath: classFilePath })} />
                    <FileText className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                )}

                {/* 类别列表 */}
                <div className="space-y-1 max-h-[350px] overflow-y-auto">
                  {exportClasses.map((cls, index) => {
                    const displayId = cls.selected ? checkedNames.indexOf(cls.name) : '-';
                    return (
                      <div key={cls.name} draggable
                        onDragStart={(e) => e.dataTransfer.setData('index', String(index))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => moveClass(Number(e.dataTransfer.getData('index')), index)}
                        className={`flex items-center gap-2 p-2 rounded border text-xs transition-colors ${
                          cls.selected ? 'bg-background border-border' : 'bg-muted/50 opacity-60'
                        }`}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab shrink-0" />
                        <Checkbox checked={cls.selected}
                          onCheckedChange={(v) => setExportClasses(prev => prev.map((c, i) => i === index ? { ...c, selected: !!v } : c))} />
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                        <span className="flex-1 truncate font-medium">{cls.name}</span>
                        <span className={`text-[10px] w-8 text-right ${cls.selected ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                          ID:{displayId}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );

      case 'target':
        return (
          <div className="space-y-5">
            <Field label={t('dataExport.stepTarget.targetFolder')}>
              <div className="relative">
                <Input value={targetDir} onChange={(e) => setTargetDir(e.target.value)}
                  placeholder={t('dataExport.stepTarget.targetFolder')}
                  className="h-9 text-xs pr-9 font-mono" />
                <button
                  onClick={() => setExplorerConfig({ open: true, type: 'dir', target: 'target_dir', initialPath: targetDir })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <FolderSearch size={14} />
                </button>
              </div>
            </Field>
            <div onClick={() => setGenerateReport(!generateReport)}
              className="flex items-center gap-3 p-4 rounded-lg border cursor-pointer hover:border-primary transition-colors"
            >
              <Checkbox checked={generateReport} className="pointer-events-none" />
              <div>
                <Label className="text-sm font-bold cursor-pointer">{t('dataExport.stepTarget.generateReport')}</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dataExport.stepTarget.reportHint')}</p>
              </div>
            </div>
            {!targetDir && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{t('dataExport.stepTarget.targetRequired')}</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // 更新单个 View 配置
  const updateViewConfig = useCallback((viewId: string, updates: Partial<ViewExportConfig>) => {
    setViewConfigs(prev => prev.map(c => c.viewId === viewId ? { ...c, ...updates } : c));
  }, []);

  useEffect(() => {
    if (views.length === 0) return;
    const configs: ViewExportConfig[] = views.map((v: any, i: number) => {
      const folder = folders.find((f: any) => f.id === v.folderId);
      const rawSuffix = folder?.suffix || '';
      
      // 🆕 智能拆分：suffix 可能包含扩展名
      let suffix = rawSuffix;
      let ext = '';
      
      const knownExts = ['.tif', '.tiff', '.png', '.jpg', '.jpeg', '.bmp'];
      for (const e of knownExts) {
        if (rawSuffix.toLowerCase().endsWith(e)) {
          suffix = rawSuffix.slice(0, -e.length);
          ext = e;
          break;
        }
      }
      
      // 如果 suffix 没有扩展名，从 fileType 推断
      if (!ext) {
        ext = IMAGE_EXT_MAP[folder?.metadata?.fileType?.toUpperCase() || ''] || '.tif';
      }
      
      return {
        viewId: v.id,
        viewName: v.isMain ? 'Main View' : `Aug View ${i}`,
        suffix,
        extension: ext,
        subdir: v.isMain ? 'main' : `aug_${i}`,
        keepOriginal: false,
      };
    });
    setViewConfigs(configs);
  }, [views, folders]);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 主体：左右分栏 */}
      <div className="flex flex-1 min-h-0">
        
        {/* 左侧导航 */}
        <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {visibleSteps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`w-full flex items-stretch text-left transition-all mb-0.5 rounded-lg overflow-hidden ${
                    status === 'current' ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  {/* 竖条指示器 */}
                  <div
                    className={`w-1 shrink-0 rounded-full my-1.5 ml-1 transition-colors ${
                      status === 'done'     ? 'bg-emerald-400' :
                      status === 'current'  ? 'bg-primary' :
                      step.required && status === 'pending' ? 'bg-red-400' :
                      'bg-muted-foreground/25'
                    }`}
                  />
                  
                  {/* 文字 */}
                  <div className={`flex-1 py-2.5 px-3 min-w-0 text-xs truncate transition-colors ${
                    status === 'current'  ? 'text-primary font-semibold' :
                    status === 'done'     ? 'text-foreground font-medium' :
                    'text-muted-foreground'
                  }`}>
                    {step.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 底部图例 */}
          <div className="p-3 border-t border-border space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
              Required
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
              Configured
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
              Current
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/25 shrink-0" />
              Default
            </div>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-2xl">
              {/* 步骤标题 */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold">
                  {steps.find(s => s.id === activeStep)?.label}
                </h3>
                {(['naming', 'images', 'split', 'shapes'].includes(activeStep)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (activeStep === 'naming') {
                        setAnnoSubdir('labels');
                        setAnnoSuffix('');
                        setAnnoExtension(FORMAT_DETAILS[format]?.defaultExtension || '.txt');
                      } else if (activeStep === 'images') {
                        setViewConfigs(buildDefaultViewConfigs())
                      } else if (activeStep === 'split') {
                        setSplitTrain(DefaultSplitConfig.splitTrain);
                        setSplitVal(DefaultSplitConfig.splitVal);
                        setSplitTest(DefaultSplitConfig.splitTest);
                        setRandomSeed(DefaultSplitConfig.randomSeed);
                        setSplitTrainFile(DefaultSplitConfig.splitTrainFile);
                        setSplitValFile(DefaultSplitConfig.splitValFile);
                        setSplitTestFile(DefaultSplitConfig.splitTestFile);
                      } else if (activeStep === 'shapes') {
                        const mapping = TASK_SHAPE_MAPPINGS[taskType];
                        const sel: Record<string, boolean> = {};
                        ALL_SHAPES.forEach(s => { sel[s] = mapping[s] !== 'incompatible'; });
                        setShapeSelection(sel);
                        resetClasses();
                      }
                    }}
                    className="h-7 text-[10px]"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {t('common.reset')}
                  </Button>
                )}
              </div>

              <div key={activeStep}>
                {renderStepContent()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
        {isExporting ? (
          <div className="flex items-center gap-3 flex-1 mr-4">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t('dataExport.exporting')}
              <span className="font-mono font-bold text-foreground ml-1">{exportProgress}%</span>
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('dataExport.readyToExport', { count: stems.length })}</span>
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isExporting}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="text-white" onClick={handleExecute}
            disabled={isExporting || !targetDir}
          >
            {isExporting ? (
              <>{t('common.cancel')}</>
            ) : (
              <><Download className="w-3.5 h-3.5 mr-1.5" /> {t('common.running')}</>
            )}
          </Button>
        </div>
      </div>

      {/* 文件浏览器 */}
      <FileExplorerDialog
        open={explorerConfig.open}
        initialPath={explorerConfig.initialPath || '/'}
        selectType={explorerConfig.type}
        onClose={() => setExplorerConfig(prev => ({ ...prev, open: false }))}
        onConfirm={(paths) => {
          if (explorerConfig.target === 'target_dir' && paths.length > 0) setTargetDir(paths[0]);
          else if (explorerConfig.target === 'class_file' && paths.length > 0) handleLoadClassFile(paths);
          setExplorerConfig(prev => ({ ...prev, open: false }));
        }}
      />
    </div>
  );
}
