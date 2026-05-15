import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { exportData, getFileContent } from '../../api/client';
import { SUPPORTED_TASKS, FORMAT_DETAILS, TaskType } from '../../config/supportedFormats';
import { 
  Download, FolderSearch, FileText, RotateCcw, GripVertical, Check, X 
} from 'lucide-react';

// --- 常量 ---
const ALL_SHAPES = [
  'bbox', 'polygon', 'ellipse', 'circle', 'oriented_bbox',
  'cuboid', 'keypoints', 'point', 'line'
] as const;

type ShapeStatus = 'native' | 'convertible' | 'incompatible';

const TASK_MAPPINGS: Record<string, Record<string, ShapeStatus>> = {
  object_detection: {
    bbox: 'native', oriented_bbox: 'convertible', polygon: 'convertible',
    ellipse: 'convertible', circle: 'convertible', cuboid: 'convertible',
    point: 'incompatible', line: 'incompatible', keypoints: 'incompatible'
  },
  instance_segmentation: {
    polygon: 'native', bbox: 'convertible', ellipse: 'convertible',
    circle: 'convertible', oriented_bbox: 'convertible',
    point: 'incompatible', line: 'incompatible', cuboid: 'incompatible', keypoints: 'incompatible'
  },
  semantic_segmentation: {
    polygon: 'native', bbox: 'convertible', ellipse: 'convertible',
    circle: 'convertible', oriented_bbox: 'convertible',
    point: 'incompatible', line: 'incompatible', cuboid: 'incompatible', keypoints: 'incompatible'
  }
};

// --- 组件 ---
export function DataExport({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const folders = useStore(s => s.folders);
  const views = useStore(s => s.views);
  const taxonomyClasses = useStore(s => s.taxonomyClasses);
  const workspacePath = useStore(s => s.workspacePath);

  const mainViewFolder = folders?.find((f: any) =>
    f.id === views?.find((v: any) => v.isMain)?.folderId
  ) || folders?.[0];
  const safeWorkspacePath = workspacePath || mainViewFolder?.path || '';

  // --- State ---
  const [taskType, setTaskType] = useState('object_detection');
  const [format, setFormat] = useState('yolo');
  const [targetDir, setTargetDir] = useState('');
  const [customSuffix, setCustomSuffix] = useState('');
  const [extension, setExtension] = useState('.txt');
  const [exportClasses, setExportClasses] = useState<any[]>([]);
  const [shapeSelection, setShapeSelection] = useState<Record<string, boolean>>({});
  const [yoloClassSource, setYoloClassSource] = useState<'current' | 'file'>('current');
  const [externalClassFile, setExternalClassFile] = useState('');
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [generateReport, setGenerateReport] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // --- 初始化类别 ---
  const resetClasses = useCallback(() => {
    const mapped = taxonomyClasses.map((c: any) => ({
      ...c,
      selected: c.name.toLowerCase() !== 'background'
    }));
    mapped.sort((a: any, b: any) => {
      if (a.name.toLowerCase() === 'background') return -1;
      if (b.name.toLowerCase() === 'background') return 1;
      return 0;
    });
    setExportClasses(mapped);
    setExternalClassFile('');
    setYoloClassSource('current');
  }, [taxonomyClasses]);

  useEffect(() => { resetClasses(); }, [resetClasses]);

  // --- 任务切换时更新格式和形状 ---
  useEffect(() => {
    const available = SUPPORTED_TASKS[taskType as TaskType].formats;
    if (!available.includes(format)) setFormat(available[0]);

    const mapping = TASK_MAPPINGS[taskType];
    const newSelection: Record<string, boolean> = {};
    ALL_SHAPES.forEach(shape => {
      newSelection[shape] = mapping[shape] !== 'incompatible';
    });
    setShapeSelection(newSelection);
  }, [taskType]);

  // --- 格式切换时更新扩展名 ---
  useEffect(() => {
    const detail = FORMAT_DETAILS[format];
    if (detail && !detail.extensions.includes(extension)) {
      setExtension(detail.defaultExtension);
    }
  }, [format]);

  // --- 拖拽排序 ---
  const moveClass = (dragIndex: number, hoverIndex: number) => {
    setExportClasses(prev => {
      const list = [...prev];
      const [item] = list.splice(dragIndex, 1);
      list.splice(hoverIndex, 0, item);
      return list;
    });
  };

  // --- 加载外部 classes.txt ---
  const handleLoadExternalFile = async (paths: string[]) => {
    setExplorerOpen(false);
    if (paths.length === 0) return;
    setExternalClassFile(paths[0]);

    try {
      const { content } = await getFileContent(paths[0]);
      const importedNames = content.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const existingNames = taxonomyClasses.map((c: any) => c.name);
      const missing = importedNames.filter((n: string) => !existingNames.includes(n));

      if (missing.length > 0) {
        alert(`${t('dataExport.classMismatch')}: ${missing.join(', ')}`);
        return;
      }

      setExportClasses([
        ...importedNames.map((n: string) => ({
          ...taxonomyClasses.find((c: any) => c.name === n),
          selected: true
        })),
        ...taxonomyClasses
          .filter((c: any) => !importedNames.includes(c.name))
          .map((c: any) => ({ ...c, selected: false }))
      ]);
    } catch {
      alert(t('dataExport.readFailed'));
    }
  };

  // --- 执行导出 ---
  const handleExecute = async () => {
    if (!targetDir) {
      alert(t('dataExport.selectTarget'));
      return;
    }

    const selectedClassNames = exportClasses.filter(c => c.selected).map(c => c.name);
    const allowedShapes = Object.entries(shapeSelection)
      .filter(([, checked]) => checked)
      .map(([s]) => s);

    setIsExporting(true);
    try {
      const res = await exportData({
        source_dirs: [safeWorkspacePath],
        target_dir: targetDir,
        task_type: taskType,
        format,
        selected_classes: selectedClassNames,
        custom_suffix: customSuffix,
        extension,
        allowed_shapes: allowedShapes,
        generate_report: generateReport,
      });
      alert(`${t('dataExport.success')}: ${res.message}`);
      onClose?.();
    } catch (err: any) {
      alert(`${t('dataExport.failed')}: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const checkedNames = exportClasses.filter(c => c.selected).map(c => c.name);

  // --- Render ---
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 内容滚动区 */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* 1. 任务与格式 */}
          <section className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('dataExport.taskFormat')}
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">{t('dataExport.task')}</Label>
                <Select value={taskType} onValueChange={setTaskType}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUPPORTED_TASKS).map(([id, info]) => (
                      <SelectItem key={id} value={id} className="text-xs">{info.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">{t('dataExport.format')}</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_TASKS[taskType as TaskType]?.formats.map(fId => (
                      <SelectItem key={fId} value={fId} className="text-xs">
                        {FORMAT_DETAILS[fId].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* 2. 后缀与扩展名 */}
          <section className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('dataExport.fileNaming')}
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">{t('dataExport.suffix')}</Label>
                <Input
                  placeholder="_v2"
                  value={customSuffix}
                  onChange={(e) => setCustomSuffix(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">{t('dataExport.extension')}</Label>
                <Select value={extension} onValueChange={setExtension}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_DETAILS[format]?.extensions.map(ext => (
                      <SelectItem key={ext} value={ext} className="text-xs">{ext}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              {t('dataExport.preview')}: scene001<span className="text-amber-500">{customSuffix}</span>{extension}
            </p>
          </section>

          {/* 3. 形状过滤 + 类别排序 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 形状过滤 */}
            <section className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('dataExport.shapeFilter')}
              </Label>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {ALL_SHAPES.map(shape => {
                  const status = TASK_MAPPINGS[taskType]?.[shape] || 'incompatible';
                  const disabled = status === 'incompatible';
                  return (
                    <div
                      key={shape}
                      onClick={() => !disabled && setShapeSelection(prev => ({ ...prev, [shape]: !prev[shape] }))}
                      className={`flex items-center justify-between p-2 rounded border text-xs transition-colors ${
                        disabled
                          ? 'opacity-30 bg-muted cursor-not-allowed'
                          : 'cursor-pointer hover:border-primary bg-background'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={shapeSelection[shape]} disabled={disabled} className="pointer-events-none" />
                        <span className="font-medium capitalize">{shape.replace('_', ' ')}</span>
                      </div>
                      {status === 'convertible' && !disabled && (
                        <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-bold">
                          Auto-Convert
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 类别排序 */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t('dataExport.classOrder')}
                </Label>
                <Button variant="ghost" size="sm" onClick={resetClasses} className="h-7 text-[10px]">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {t('common.reset')}
                </Button>
              </div>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {exportClasses.map((cls, index) => {
                  const displayId = cls.selected ? checkedNames.indexOf(cls.name) : '-';
                  return (
                    <div
                      key={cls.name}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('index', String(index))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => moveClass(Number(e.dataTransfer.getData('index')), index)}
                      className={`flex items-center gap-2 p-2 rounded border text-xs transition-colors ${
                        cls.selected
                          ? 'bg-background border-border'
                          : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab shrink-0" />
                      <Checkbox
                        checked={cls.selected}
                        onCheckedChange={(v) => {
                          setExportClasses(prev => prev.map((c, i) =>
                            i === index ? { ...c, selected: !!v } : c
                          ));
                        }}
                      />
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                      <span className="flex-1 truncate font-medium">{cls.name}</span>
                      <span className={`text-[10px] w-8 text-right tabular-nums ${
                        cls.selected ? 'text-primary font-bold' : 'text-muted-foreground'
                      }`}>
                        ID:{displayId}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* 4. YOLO classes 配置 */}
          {format === 'yolo' && (
            <section className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('dataExport.yoloClassSource')}
              </Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={yoloClassSource === 'current'}
                    onChange={() => setYoloClassSource('current')}
                    className="text-primary"
                  />
                  {t('dataExport.usePanel')}
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={yoloClassSource === 'file'}
                    onChange={() => setYoloClassSource('file')}
                    className="text-primary"
                  />
                  {t('dataExport.loadFile')}
                </label>
              </div>
              {yoloClassSource === 'file' && (
                <div className="relative">
                  <Input
                    value={externalClassFile}
                    readOnly
                    placeholder={t('dataExport.selectClassFile')}
                    className="h-9 text-xs pr-9 font-mono cursor-pointer"
                    onClick={() => { setExplorerMode('file'); setExplorerOpen(true); }}
                  />
                  <FileText className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              )}
            </section>
          )}

          {/* 5. 目标路径 + 报告选项 */}
          <section className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('dataExport.delivery')}
            </Label>
            <div className="relative">
              <Input
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                placeholder={t('dataExport.selectTarget')}
                className="h-9 text-xs pr-9 font-mono"
              />
              <button
                onClick={() => { setExplorerMode('dir'); setExplorerOpen(true); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <FolderSearch size={14} />
              </button>
            </div>
            <div
              onClick={() => setGenerateReport(!generateReport)}
              className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer hover:border-primary transition-colors"
            >
              <Checkbox checked={generateReport} className="pointer-events-none" />
              <div>
                <Label className="text-xs font-bold cursor-pointer">
                  {t('dataExport.generateReport')}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {t('dataExport.reportHint')}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-3 p-4 border-t border-border shrink-0">
        <Button variant="outline" size="sm" onClick={onClose} disabled={isExporting}>
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('common.cancel')}
        </Button>
        <Button size="sm" className="text-white" onClick={handleExecute} disabled={isExporting || !targetDir}>
          {isExporting ? (
            <>{t('dataExport.exporting')}</>
          ) : (
            <>{t('dataExport.execute')}</>
          )}
        </Button>
      </div>

      {/* 文件浏览器 */}
      <FileExplorerDialog
        open={explorerOpen}
        initialPath="/"
        selectType={explorerMode}
        onClose={() => setExplorerOpen(false)}
        onConfirm={(paths) => {
          setExplorerOpen(false);
          if (explorerMode === 'dir') {
            setTargetDir(paths[0]);
          } else {
            handleLoadExternalFile(paths);
          }
        }}
      />
    </div>
  );
}