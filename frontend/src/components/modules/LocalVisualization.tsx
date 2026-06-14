// src/components/Modules/LocalVisualization.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Loader2, Download, Info, Trash2, FolderOpen,
    FileText, AlertCircle, LayoutGrid, Columns3, Rows3, Check
} from 'lucide-react';
import { requestVisPreview, requestVisExportStream, getFileContent, analyzeWorkspaceFolders} from '../../api/client';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { SUPPORTED_TASKS, FORMAT_DETAILS, TaskType } from '../../config/supportedFormats';

interface ViewMeta {
  name: string;
  folder_path: string;
  suffix: string;
  bands: number[];
  render_type: string;
  transform: any;
  crop?: { t: number; r: number; b: number; l: number };
}

const CardButton: React.FC<{
  active: boolean; label: string; sub?: string; onClick: () => void; compact?: boolean;
}> = ({ active, label, sub, onClick, compact }) => {
  return (
    <div
      onClick={onClick}
      className={`${compact ? 'p-2' : 'p-2.5'} rounded-xl border-2 cursor-pointer text-center transition-all ${
        active
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
      }`}
    >
      <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
        {label}
      </div>
      {sub && <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">{sub}</div>}
    </div>
  );
}

export function LocalVisualization() {
  const { t } = useTranslation();
  const { stems, projectMetaPath } = useStore() as any;
  const [sourceType, setSourceType] = useState<'project' | 'local'>('project');
  const [scannedStems, setScannedStems] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [viewMetas, setViewMetas] = useState<ViewMeta[]>([]);
  const [isMetaLoaded, setIsMetaLoaded] = useState(false);

  const [currentProjectPath, setCurrentProjectPath] = useState(projectMetaPath || '');
  const [placeholders, setPlaceholders] = useState<{ id: string, path: string, suffix: string }[]>([]);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);

  // Ground Truth state
  const [enableAnno, setEnableAnno] = useState(false);
  const [annoTaskType, setAnnoTaskType] = useState<TaskType>('object_detection');
  const [annoFormat, setAnnoFormat] = useState('yolo');
  const [annoExtension, setAnnoExtension] = useState('.txt');
  const [annoSuffix, setAnnoSuffix] = useState('');
  const [annoPath, setAnnoPath] = useState('');
  const [annoClassFile, setAnnoClassFile] = useState('');
  const [annoScannedCount, setAnnoScannedCount] = useState<number | null>(null);
  const [isScanningAnno, setIsScanningAnno] = useState(false);

  // Preview images state
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Predictions state
  const [enablePred, setEnablePred] = useState(false);
  const [predictions, setPredictions] = useState([{
    id: crypto.randomUUID(),
    name: 'Model A',
    taskType: 'object_detection' as TaskType,
    format: 'yolo',
    extension: '.txt',
    path: '',
    suffix: '',
    classFile: '',
    scoreThreshold: 0.5,
    scannedCount: null as number | null,
    isScanning: false,
  }]);

  // Export state
  const [exportIndependent, setExportIndependent] = useState(true);
  const [exportMerged, setExportMerged] = useState(false);
  const [savePath, setSavePath] = useState('');
  const [exportLayout, setExportLayout] = useState<'grid' | 'horizontal' | 'vertical'>('grid');
  const [exportRows, setExportRows] = useState(2);
  const [exportCols, setExportCols] = useState(2);
  const [mergedPreview, setMergedPreview] = useState<string | null>(null);

  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Explorer config
  const [explorerConfig, setExplorerConfig] = useState<{
    open: boolean;
    type: 'dir' | 'file';
    target: 'meta' | 'local_dir' | 'anno_dir' | 'anno_class' | 'pred_dir' | 'pred_class';
    activeId?: string;
    initialPath?: string;
  }>({ open: false, type: 'dir', target: 'meta' });

  const handleScanAnno = async () => {
    if (!annoPath) return alert(t('localVis.alerts.selectAnnoPath'));
    if (scannedStems.length === 0) return alert(t('localVis.alerts.scanImagesFirst'));

    setIsScanningAnno(true);
    try {
      if (annoFormat === 'coco') {
        setAnnoScannedCount(scannedStems.length);
        fetchPreview();
        return;
      }

      const result = await analyzeWorkspaceFolders([{ path: annoPath, suffix: annoSuffix }]);
      if (result.commonStems) {
        const matched = result.commonStems.filter((stem: string) => scannedStems.includes(stem));
        setAnnoScannedCount(matched.length);

        if (matched.length > 0) {
          fetchPreview();
        }
      }
    } catch (error) {
      alert(t('localVis.alerts.scanAnnoFailed'));
    } finally {
      setIsScanningAnno(false);
    }
  };

  const handleScanPred = async (predId: string) => {
    const pred = predictions.find(p => p.id === predId);
    if (!pred || !pred.path) return alert(t('localVis.alerts.selectAnnoPath'));
    if (scannedStems.length === 0) return alert(t('localVis.alerts.scanImagesFirst'));

    setPredictions(prev => prev.map(p => p.id === predId ? { ...p, isScanning: true } : p));
    try {
      if (pred.format === 'coco') {
        setPredictions(prev => prev.map(p => p.id === predId ? { ...p, scannedCount: scannedStems.length } : p));
        fetchPreview();
        return;
      }

      const result = await analyzeWorkspaceFolders([{ path: pred.path, suffix: pred.suffix }]);
      if (result.commonStems) {
        const matched = result.commonStems.filter((stem: string) => scannedStems.includes(stem));
        setPredictions(prev => prev.map(p => p.id === predId ? { ...p, scannedCount: matched.length } : p));

        if (matched.length > 0) {
          fetchPreview();
        }
      }
    } catch (error) {
      alert(t('localVis.alerts.scanPredFailed'));
    } finally {
      setPredictions(prev => prev.map(p => p.id === predId ? { ...p, isScanning: false } : p));
    }
  };

  const handleUniversalExplorerConfirm = (paths: string[]) => {
    if (paths.length === 0) return;
    const selectedPath = paths[0];
    const { target, activeId } = explorerConfig;

    if (target === 'meta') setCurrentProjectPath(selectedPath);
    else if (target === 'local_dir' && activeId) {
      setPlaceholders(prev => prev.map(p => p.id === activeId ? { ...p, path: selectedPath } : p));
    }
    else if (target === 'anno_dir') setAnnoPath(selectedPath);
    else if (target === 'anno_class') setAnnoClassFile(selectedPath);
    else if (target === 'pred_dir' && activeId) {
      setPredictions(prev => prev.map(p => p.id === activeId ? { ...p, path: selectedPath } : p));
    }
    else if (target === 'pred_class' && activeId) {
      setPredictions(prev => prev.map(p => p.id === activeId ? { ...p, classFile: selectedPath } : p));
    }
    else if (target === 'save_dir') {
      setSavePath(selectedPath);
    }
    setExplorerConfig(prev => ({ ...prev, open: false }));
  };

  useEffect(() => {
    const formats = SUPPORTED_TASKS[annoTaskType]?.formats;
    if (formats && !formats.includes(annoFormat)) {
      setAnnoFormat(formats[0]);
    }
  }, [annoTaskType]);

  useEffect(() => {
    const detail = FORMAT_DETAILS[annoFormat];
    if (detail && !detail.extensions.includes(annoExtension)) {
      setAnnoExtension(detail.defaultExtension);
    }
  }, [annoFormat]);

  useEffect(() => {
    if (sourceType === 'local' && placeholders.length === 0) {
      setPlaceholders([{ id: crypto.randomUUID(), path: '', suffix: '' }]);
    }
  }, [sourceType]);

  const addPlaceholder = () => {
    setPlaceholders([...placeholders, { id: crypto.randomUUID(), path: '', suffix: '' }]);
  };

  const removePlaceholder = (id: string) => {
    if (placeholders.length <= 1) return;
    setPlaceholders(placeholders.filter(p => p.id !== id));
  };

  const updatePlaceholder = (id: string, field: 'path' | 'suffix', value: string) => {
    setPlaceholders(placeholders.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const [config, setConfig] = useState({
    mode: 'merged',
    layout: 'grid',
    columns: 2,
    resolution: 'main_view',
    showComparison: false,
    thickness: 2,
    alpha: 0.3
  });

  const handleLoadMeta = async () => {
    if (!currentProjectPath) return alert(t('localVis.alerts.enterProjectPath'));
    setIsLoading(true);
    try {
      const responseData = await getFileContent(currentProjectPath);

      if (!responseData || !responseData.content) {
        throw new Error("Backend response missing content field");
      }

      const data = JSON.parse(responseData.content);

      if (!data.views || !data.folders) {
        throw new Error("Project file missing views or folders");
      }

      const mappedViews: ViewMeta[] = data.views.map((view: any) => {
        const matchedFolder = data.folders.find((f: any) => f.Id === view["folder id"]);
        return {
          name: view.id || t('localVis.preview.unknownView'),
          folder_path: matchedFolder ? matchedFolder.path : t('localVis.preview.pathNotFound'),
          suffix: matchedFolder ? (matchedFolder.suffix || "") : "",
          bands: view.bands || [],
          render_type: view.renderMode || "unknown",
          transform: view.transform || {},
          crop: view.crop || view.transform?.crop || { t: 0, r: 100, b: 100, l: 0 }
        };
      });

      setViewMetas(mappedViews);
      setIsMetaLoaded(true);
    } catch (err: any) {
      console.error("Meta parse error:", err);
      alert(t('localVis.alerts.parseError', { message: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async () => {
    if (sourceType === 'project' && !isMetaLoaded) {
      return alert(t('localVis.alerts.parseProjectFirst'));
    }
    if (sourceType === 'local' && placeholders.filter(p => p.path.trim() !== '').length === 0) {
    return alert(t('localVis.alerts.addFolderPath'));
  }

    setIsScanning(true);
    setScannedStems([]);
    setPreviewImages({});

    try {
      if (sourceType === 'project') {
        if (viewMetas.length === 0) {
          throw new Error("View config is empty");
        }

        const payloadData = viewMetas.map(view => ({
          path: view.folder_path,
          suffix: view.suffix || ''
        }));

        const result = await analyzeWorkspaceFolders(payloadData);

        if (!result.commonStems || result.commonStems.length === 0) {
          alert(t('localVis.alerts.noValidData'));
        } else {
          setScannedStems(result.commonStems);
        }

      } else {
        const validPayload = placeholders
          .filter(p => p.path.trim() !== '')
          .map(p => ({
            path: p.path.trim(),
            suffix: p.suffix.trim()
          }));

        if (validPayload.length === 0) {
          throw new Error("No valid folder paths");
        }

        const result = await analyzeWorkspaceFolders(validPayload);

        if (!result.commonStems || result.commonStems.length === 0) {
          alert(t('localVis.alerts.noScenesFound'));
        } else {
          setScannedStems(result.commonStems);
        }
      }
    } catch (err: any) {
      alert(`${t('localVis.alerts.scanError', { message: err.message || t('localVis.alerts.backendCallFailed') })}`);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (scannedStems.length > 0) {
      fetchPreview();
    }
  }, [currentIndex, scannedStems]);

  const getLocalConfigsPayload = () => {
    if (sourceType !== 'local') return null;
    return placeholders
      .filter(p => p.path.trim() !== '')
      .map((p, idx) => ({
        folder_path: p.path.trim(),
        path: p.path.trim(),
        suffix: p.suffix.trim(),
        name: idx === 0 ? 'Main View' : `Aug View ${idx}`
      }));
  };

  const fetchPreview = async () => {
    if (scannedStems.length === 0) return;
    setIsLoading(true);
    try {
      const currentStem = scannedStems[currentIndex];
      const taskApiMap: Record<string, string> = {
        object_detection: 'bbox',
        instance_segmentation: 'instance_seg',
        semantic_segmentation: 'semantic_seg'
      };
      const payload = {
        source_type: sourceType,
        stem: currentStem,
        render_settings: config,
        view_configs: sourceType === 'project' ? viewMetas : null,
        local_configs: getLocalConfigsPayload(),
        anno_config: enableAnno ? {
          task_type: taskApiMap[annoTaskType],
          format: annoFormat,
          suffix: annoFormat === 'image' ? `${annoSuffix}${annoExtension}` : annoSuffix,
          folder_path: annoPath,
          class_file: annoClassFile
        } : null,
        pred_configs: enablePred ? predictions.filter(p => p.path).map(p => ({
          ...p,
          taskType: taskApiMap[p.taskType],
          suffix: p.format === 'image' ? `${p.suffix}${p.extension}` : p.suffix
        })) : null
      };

      const res = await requestVisPreview(payload);

      if (res && res.preview_images) {
        setPreviewImages(res.preview_images);
      }
    } catch (error: any) {
      console.error("Preview load failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const activeViewCount = sourceType === 'project'
    ? viewMetas.length
    : placeholders.filter(p => p.path).length;
  const totalLayers = activeViewCount +
    (enableAnno ? (annoFormat === 'image' ? 1 : activeViewCount) : 0) +
    (enablePred ? predictions.filter(p => p.path).reduce((acc, pred) => {
      return acc + (pred.taskType === 'semantic_segmentation' ? 1 : activeViewCount);
    }, 0) : 0);

  useEffect(() => {
    if (exportLayout === 'horizontal') {
      setExportRows(1);
      setExportCols(totalLayers);
    } else if (exportLayout === 'vertical') {
      setExportRows(totalLayers);
      setExportCols(1);
    } else if (exportLayout === 'grid') {
      const c = Math.ceil(Math.sqrt(totalLayers));
      const r = Math.ceil(totalLayers / c);
      setExportCols(c);
      setExportRows(r);
    }
  }, [exportLayout, totalLayers]);

  const handleApplyLayout = async () => {
    if (!exportMerged) {
        fetchPreview();
        return;
    }
    if (scannedStems.length === 0) return;
    setIsLoading(true);
    try {
      const taskApiMap: Record<string, string> = {
        object_detection: 'bbox',
        instance_segmentation: 'instance_seg',
        semantic_segmentation: 'semantic_seg'
      };

      const payload = {
        source_type: sourceType,
        stem: scannedStems[currentIndex],
        render_settings: config,
        view_configs: sourceType === 'project' ? viewMetas : null,
        local_configs: getLocalConfigsPayload(),
        export_config: {
            preview_only: true,
            modes: { independent: exportIndependent, merged: exportMerged },
            layout_settings: {
              layout: exportLayout,
              rows: exportRows,
              cols: exportCols
            }
        },
        anno_config: enableAnno ? {
          task_type: taskApiMap[annoTaskType],
          format: annoFormat,
          suffix: (annoFormat === 'image') ? `${annoSuffix}${annoExtension}` : annoSuffix,
          folder_path: annoPath,
          class_file: annoClassFile
        } : null,
        pred_configs: enablePred ? predictions.filter(p => p.path).map(p => ({
          ...p,
          taskType: taskApiMap[p.taskType],
          suffix: (p.format === 'image') ? `${p.suffix}${p.extension}` : p.suffix
        })) : null
      };

      const res = await requestVisPreview(payload);
      if (res.preview_images) {
        const { fused_result, ...others } = res.preview_images;
        setPreviewImages(others);
        setMergedPreview(fused_result || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportAll = async () => {
    if (!savePath) {
      alert(t('localVis.alerts.selectSaveDir'));
      return;
    }
    if (scannedStems.length === 0) {
      alert(t('localVis.alerts.noExportData'));
      return;
    }
    setIsExporting(true);
    setExportProgress(1);

    try {
      const taskApiMap: Record<string, string> = {
        object_detection: 'bbox',
        instance_segmentation: 'instance_seg',
        semantic_segmentation: 'semantic_seg'
      };

      const payload = {
        source_type: sourceType,
        all_stems: scannedStems,
        render_settings: config,
        view_configs: sourceType === 'project' ? viewMetas : null,
        local_configs: getLocalConfigsPayload(),
        anno_config: enableAnno ? {
          task_type: taskApiMap[annoTaskType],
          format: annoFormat,
          suffix: annoFormat === 'image' ? `${annoSuffix}${annoExtension}` : annoSuffix,
          folder_path: annoPath,
          class_file: annoClassFile
        } : null,
        pred_configs: enablePred ? predictions.filter(p => p.path).map(p => ({
          ...p,
          taskType: taskApiMap[p.taskType],
          suffix: p.format === 'image' ? `${p.suffix}${p.extension}` : p.suffix
        })) : null,
        export_config: {
          preview_only: false,
          save_path: savePath,
          modes: {
            independent: exportIndependent,
            merged: exportMerged
          },
          layout_settings: {
            layout: exportLayout,
            rows: exportRows,
            cols: exportCols
          }
        },
      };
      const res = await requestVisExportStream(payload, (percent) => {
        setExportProgress(percent);
      });
      if (res.success) {
        setExportProgress(100);
        alert(t('localVis.alerts.exportSuccess', { path: savePath, count: scannedStems.length }));
      }
    } catch (err) {
      if (exportProgress === 100) {
             alert(t('localVis.alerts.exportCompleted'));
      } else {
             alert(t('localVis.alerts.exportError', { message: (err as any).message }));
      }
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportProgress(null), 2000);
    }
  };

  const layoutOptions = [
    { id: 'grid' as const, icon: LayoutGrid, label: 'Grid' },
    { id: 'horizontal' as const, icon: Columns3, label: 'H' },
    { id: 'vertical' as const, icon: Rows3, label: 'V' },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-full bg-background w-full overflow-hidden">

      {/* Sidebar: config area */}
      <div className="w-full lg:w-[300px] shrink-0 bg-background border-r border-border flex flex-col h-full shadow-2xl z-10">

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

          {/* Section 1: Data Source */}
          <section className="space-y-4">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('localVis.dataSource.title')}
            </Label>

            {/* Source type: button cards */}
            <div>
              <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.dataSource.sourceType')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'project' as const, label: t('localVis.dataSource.projectMeta') },
                  { id: 'local' as const, label: t('localVis.dataSource.localFolders') },
                ].map(({ id, label }) => (
                  <CardButton
                    key={id}
                    active={sourceType === id}
                    label={label}
                    onClick={() => { setSourceType(id); setScannedStems([]); setPreviewImages({}); setIsMetaLoaded(false); }}
                  />
                ))}
              </div>
            </div>

            {sourceType === 'project' && (
              <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">{t('localVis.dataSource.metaPath')}</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Input
                        value={currentProjectPath}
                        onChange={(e) => setCurrentProjectPath(e.target.value)}
                        className="h-8 text-xs font-mono pr-8"
                        placeholder={t('localVis.dataSource.metaPlaceholder')}
                      />
                      <button
                        type="button"
                        onClick={() => setExplorerConfig({ open: true, type: 'dir', target: 'meta', initialPath: currentProjectPath })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                        <FolderOpen size={14} />
                      </button>
                    </div>

                    <Button
                      onClick={handleLoadMeta}
                      disabled={isLoading}
                      className="h-8 px-3 shrink-0"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : t('localVis.dataSource.parse')}
                    </Button>
                  </div>
                </div>

                {isMetaLoaded && (
                  <div className="mt-2 space-y-2 border-t border-border pt-3">
                    <Label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1">
                      <Check className="w-3 h-3" /> {t('localVis.dataSource.locked')}
                    </Label>
                    <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                      {viewMetas.map((view, idx) => (
                        <div key={idx} className="p-2 bg-background border border-border rounded-xl text-[10px] space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-foreground">{view.name}</span>
                            <span className="text-muted-foreground bg-muted px-1.5 rounded">{view.render_type}</span>
                          </div>
                          <p className="truncate text-muted-foreground/60 font-mono" title={view.folder_path}>{view.folder_path}</p>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground font-medium bg-muted px-1 rounded">
                              Bands: {view.bands.join(', ')}
                            </span>
                            {view.suffix && (
                              <span className="text-amber-600 dark:text-amber-500 font-medium bg-amber-50 dark:bg-amber-900/20 px-1 rounded">
                                {t('localVis.dataSource.suffix')} {view.suffix}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

           {sourceType === 'local' && (
                <div className="space-y-4 p-3 rounded-xl border bg-muted/20">
                    <div className="flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                        {t('localVis.dataSource.quickModeInfo')}
                    </p>
                    </div>

                    <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <Label className="text-[10px] text-muted-foreground">{t('localVis.dataSource.folderList')}</Label>
                        <Button variant="ghost" size="sm" onClick={addPlaceholder} className="h-6 text-[10px]">
                        {t('localVis.dataSource.addFolder')}
                        </Button>
                    </div>

                    <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
                      {placeholders.map((p, idx) => {
                        const viewName = idx === 0 ? 'Main View' : `Aug View ${idx}`;
                        return (
                          <div key={p.id} className="space-y-2 p-2.5 rounded-xl bg-background border border-border relative group">

                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
                                {viewName}
                              </Label>
                              {placeholders.length > 1 && (
                                <button onClick={() => removePlaceholder(p.id)} className="text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  value={p.path}
                                  onChange={e => setPlaceholders(prev => prev.map(item =>
                                    item.id === p.id ? { ...item, path: e.target.value } : item
                                  ))}
                                  className="h-7 text-[10px] pr-8"
                                  placeholder={t('localVis.dataSource.folderPlaceholder')}
                                />
                                <button
                                  onClick={() => setExplorerConfig({
                                    open: true,
                                    type: 'dir',
                                    target: 'local_dir',
                                    activeId: p.id,
                                    initialPath: p.path
                                  })}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                  <FolderOpen size={14} />
                                </button>
                              </div>

                              <Input
                                value={p.suffix}
                                onChange={e => setPlaceholders(prev => prev.map(item =>
                                  item.id === p.id ? { ...item, suffix: e.target.value } : item
                                ))}
                                className="h-7 text-[10px] w-[68px] font-mono placeholder:font-sans"
                                placeholder={t('localVis.dataSource.suffixPlaceholder')}
                              />
                            </div>

                          </div>
                        );
                      })}
                    </div>
                    </div>
                </div>
                )}

            <div className="pt-2">
              <Button
                onClick={handleScan}
                disabled={isScanning || (sourceType === 'project' && !isMetaLoaded)}
                className="w-full h-9 font-bold"
              >
                {isScanning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {sourceType === 'project' ? t('localVis.dataSource.scanProject') : t('localVis.dataSource.scanLocal')}
              </Button>
            </div>

            {scannedStems.length > 0 && (
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <span>{t('localVis.dataSource.scanReady', { count: scannedStems.length })}</span>
              </div>
            )}
          </section>

          {/* Divider */}
          <div className="h-px bg-border" />


          {/* Section 2: Ground Truth */}
          <section className={`space-y-3 transition-opacity ${scannedStems.length === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('localVis.groundTruth.title')}
              </Label>
              <Switch checked={enableAnno} onCheckedChange={setEnableAnno} />
            </div>

            {enableAnno && (
              <div className="space-y-4 p-4 rounded-xl border bg-muted/20">
                <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <p className="leading-relaxed">
                    {t('localVis.groundTruth.info', { count: scannedStems.length })}
                  </p>
                </div>

                {/* Task type: button cards */}
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.groundTruth.taskType')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(SUPPORTED_TASKS).map(([id, info]) => (
                      <CardButton
                        key={id}
                        active={annoTaskType === id}
                        label={info.label.split(' ')[0]}
                        onClick={() => setAnnoTaskType(id as TaskType)}
                      />
                    ))}
                  </div>
                </div>

                {/* Format: button cards */}
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.groundTruth.format')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_TASKS[annoTaskType as TaskType]?.formats.map(fId => (
                      <CardButton
                        key={fId}
                        active={annoFormat === fId}
                        label={FORMAT_DETAILS[fId].label}
                        sub={FORMAT_DETAILS[fId].defaultExtension}
                        onClick={() => setAnnoFormat(fId)}
                      />
                    ))}
                  </div>
                </div>

                {/* Suffix + Extension row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">{t('localVis.groundTruth.suffix')}</Label>
                    <Input value={annoSuffix} onChange={e => setAnnoSuffix(e.target.value)} className="h-8 text-xs font-mono" placeholder={t('localVis.groundTruth.suffixPlaceholder')} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.groundTruth.extension')}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {FORMAT_DETAILS[annoFormat]?.extensions.map(ext => (
                        <CardButton
                          key={ext}
                          active={annoExtension === ext}
                          label={ext}
                          compact
                          onClick={() => setAnnoExtension(ext)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">{t('localVis.groundTruth.path')}</Label>
                  <div className="relative">
                    <Input value={annoPath} onChange={e => setAnnoPath(e.target.value)} className="h-8 text-xs pr-8" placeholder={t('localVis.groundTruth.pathPlaceholder')} />
                    <button onClick={() => setExplorerConfig({ open: true, type: annoFormat === 'coco' ? 'file' : 'dir', target: 'anno_dir', initialPath: annoPath })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>

                {annoFormat === 'yolo' && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">{t('localVis.groundTruth.classFile')}</Label>
                    <div className="relative">
                      <Input value={annoClassFile} onChange={e => setAnnoClassFile(e.target.value)} className="h-8 text-xs pr-8" placeholder={t('localVis.groundTruth.classPlaceholder')} />
                      <button onClick={() => setExplorerConfig({ open: true, type: 'file', target: 'anno_class', initialPath: annoClassFile })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <FileText size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-1 space-y-2">
                  {annoScannedCount !== null && (
                    <div className="flex items-center justify-between p-2 bg-background border border-border rounded-lg text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                        {t('localVis.groundTruth.scanDone')}
                      </span>
                      <span className={annoScannedCount === scannedStems.length ? 'text-emerald-600' : 'text-amber-600'}>
                        {t('localVis.groundTruth.matched', { count: annoScannedCount, total: scannedStems.length })}
                      </span>
                    </div>
                  )}
                  <Button
                    onClick={handleScanAnno}
                    disabled={isScanningAnno || !annoPath}
                    className="w-full h-9 font-bold"
                  >
                    {isScanningAnno ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {t('localVis.groundTruth.scanAndVerify')}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <div className="h-px bg-border" />


          {/* Section 3: Predictions */}
          <section className={`space-y-3 transition-opacity ${scannedStems.length === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('localVis.predictions.title')}
              </Label>
              <Switch checked={enablePred} onCheckedChange={setEnablePred} />
            </div>

            {enablePred && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <p className="leading-relaxed">
                    {t('localVis.predictions.info')}
                  </p>
                </div>

                {predictions.map((pred, idx) => (
                  <div key={pred.id} className="p-4 rounded-xl border bg-muted/20 space-y-3 relative">
                    {predictions.length > 1 && (
                      <button onClick={() => setPredictions(prev => prev.filter(p => p.id !== pred.id))} className="absolute right-3 top-3 text-muted-foreground hover:text-red-500 z-10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}

                    <div className="space-y-1.5 pr-6">
                      <Label className="text-[10px] text-muted-foreground">{t('localVis.predictions.modelName')}</Label>
                      <Input value={pred.name} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, name: e.target.value } : p))} className="h-8 text-xs font-bold" placeholder={t('localVis.predictions.modelPlaceholder')} />
                    </div>

                    {/* Task type: button cards */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.predictions.taskType')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(SUPPORTED_TASKS).map(([id, info]) => (
                          <CardButton
                            key={id}
                            active={pred.taskType === id}
                            label={info.label.split(' ')[0]}
                            onClick={() => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, taskType: id as TaskType } : p))}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Format: button cards */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.predictions.format')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {SUPPORTED_TASKS[pred.taskType as TaskType]?.formats.map(fId => (
                          <CardButton
                            key={fId}
                            active={pred.format === fId}
                            label={FORMAT_DETAILS[fId].label}
                            sub={FORMAT_DETAILS[fId].defaultExtension}
                            onClick={() => {
                              const defaultExt = FORMAT_DETAILS[fId].defaultExtension;
                              setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, format: fId, extension: defaultExt } : p));
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Suffix + Extension row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">{t('localVis.predictions.suffix')}</Label>
                        <Input value={pred.suffix} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, suffix: e.target.value } : p))} className="h-8 text-xs font-mono" placeholder={t('localVis.predictions.suffixPlaceholder')} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-2 block">{t('localVis.predictions.extension')}</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {FORMAT_DETAILS[pred.format]?.extensions.map(ext => (
                            <CardButton
                              key={ext}
                              active={pred.extension === ext}
                              label={ext}
                              compact
                              onClick={() => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, extension: ext } : p))}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">{t('localVis.predictions.path')}</Label>
                      <div className="relative">
                        <Input value={pred.path} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, path: e.target.value } : p))} className="h-8 text-xs pr-8" placeholder={t('localVis.predictions.pathPlaceholder')} />
                        <button onClick={() => setExplorerConfig({ open: true, type: pred.format === 'coco' ? 'file' : 'dir', target: 'pred_dir', activeId: pred.id, initialPath: pred.path })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <FolderOpen size={14} />
                        </button>
                      </div>
                    </div>

                    {pred.format === 'yolo' && (
                       <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">{t('localVis.predictions.classFile')}</Label>
                        <div className="relative">
                          <Input value={pred.classFile} onChange={e => setPredictions(prev => prev.map(p => p.id === pred.id ? { ...p, classFile: e.target.value } : p))} className="h-8 text-xs pr-8" placeholder={t('localVis.predictions.classPlaceholder')} />
                          <button onClick={() => setExplorerConfig({ open: true, type: 'file', target: 'pred_class', activeId: pred.id, initialPath: pred.classFile })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <FileText size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-1 space-y-2">
                      {pred.scannedCount !== null && (
                        <div className="flex items-center justify-between p-2 bg-background border border-border rounded-lg text-[10px] font-bold">
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                            {t('localVis.predictions.verified')}
                          </span>
                          <span className={pred.scannedCount === scannedStems.length ? 'text-emerald-600' : 'text-amber-600'}>
                            {t('localVis.predictions.matched', { count: pred.scannedCount, total: scannedStems.length })}
                          </span>
                        </div>
                      )}
                      <Button
                        onClick={() => handleScanPred(pred.id)}
                        disabled={pred.isScanning || !pred.path}
                        className="w-full h-9 font-bold"
                      >
                        {pred.isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {t('localVis.predictions.scanVerify', { name: pred.name || t('localVis.predictions.modelDefault', { idx: idx + 1 }) })}
                      </Button>
                    </div>
                  </div>
                ))}

                <Button variant="outline" onClick={() => setPredictions([...predictions, { id: crypto.randomUUID(), name: `Model ${predictions.length + 1}`, taskType: 'bbox', format: 'yolo', path: '', suffix: '', classFile: '', scoreThreshold: 0.5, scannedCount: null, isScanning: false }])} className="w-full h-9 text-xs border-dashed">
                  {t('localVis.predictions.addModel')}
                </Button>
              </div>
            )}
          </section>


        {/* Section 4: Save & Layout */}
        <section className="space-y-4">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('localVis.export.title')}
          </Label>

          {/* Save mode: clickable cards */}
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => setExportIndependent(!exportIndependent)}
              className={`p-3 rounded-xl border-2 cursor-pointer text-center transition-all ${
                exportIndependent
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
              }`}
            >
              <span className={`text-xs font-bold ${exportIndependent ? 'text-primary' : 'text-foreground'}`}>
                {t('localVis.export.independent')}
              </span>
            </div>
            <div
              onClick={() => setExportMerged(!exportMerged)}
              className={`p-3 rounded-xl border-2 cursor-pointer text-center transition-all ${
                exportMerged
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
              }`}
            >
              <span className={`text-xs font-bold ${exportMerged ? 'text-primary' : 'text-foreground'}`}>
                {t('localVis.export.merged')}
              </span>
            </div>
          </div>


          {exportMerged && (
            <div className="space-y-4 p-4 rounded-xl border bg-muted/20">

              {/* Layout mode: button cards */}
              <div>
                <Label className="text-[10px] text-muted-foreground mb-2 block">Layout</Label>
                <div className="grid grid-cols-3 gap-2">
                  {layoutOptions.map(({ id, icon: Icon, label }) => (
                    <div
                      key={id}
                      onClick={() => setExportLayout(id)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                        exportLayout === id
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${exportLayout === id ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`text-[9px] font-bold ${exportLayout === id ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">{t('localVis.export.rows')}</Label>
                  <Input type="number" value={exportRows} onChange={e => setExportRows(Math.max(1, parseInt(e.target.value)))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">{t('localVis.export.cols')}</Label>
                  <Input type="number" value={exportCols} onChange={e => setExportCols(Math.max(1, parseInt(e.target.value)))} className="h-8 text-xs" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-[9px] font-bold text-muted-foreground uppercase">{t('localVis.export.layoutPreview', { count: totalLayers })}</Label>
                  <span className="text-[9px] font-mono text-muted-foreground">{exportRows}×{exportCols}</span>
                </div>
                <div
                  className="grid gap-1 p-2 bg-muted/50 rounded-lg border border-dashed border-border"
                  style={{
                    gridTemplateColumns: `repeat(${exportCols}, 1fr)`,
                    gridTemplateRows: `repeat(${exportRows}, 1fr)`
                  }}
                >
                  {Array.from({ length: exportRows * exportCols }).map((_, i) => (
                    <div
                      key={i}
                      className={`aspect-square rounded-sm border transition-all duration-300 ${i < totalLayers ? 'bg-primary/40 border-primary/60' : 'bg-transparent border-border'}`}
                    />
                  ))}
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full h-8 text-[11px] font-bold" onClick={handleApplyLayout} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                {t('localVis.export.updatePreview')}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground">{t('localVis.export.saveDir')}</Label>
            <div className="relative">
              <Input value={savePath} onChange={e => setSavePath(e.target.value)} className="h-8 text-xs pr-8" placeholder={t('localVis.export.savePlaceholder')} />
              <button onClick={() => setExplorerConfig({ open: true, type: 'dir', target: 'save_dir', initialPath: savePath })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <FolderOpen size={14} />
              </button>
            </div>
          </div>
        </section>


        </div>
        {/* Bottom action bar */}
        <div className="p-4 bg-background border-t border-border space-y-3">
          {isExporting && exportProgress !== null && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between text-[10px] font-black text-emerald-600 uppercase tracking-tighter">
                <span>{t('localVis.export.processing')}</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-emerald-100 dark:border-emerald-900/30">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}
          <Button
            onClick={handleExportAll}
            disabled={isExporting}
            className="w-full font-bold h-11 shadow-lg active:scale-[0.98] transition-transform"
          >
            {isExporting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('localVis.export.processing')}</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> {t('localVis.export.exportAll')}</>
            )}
          </Button>
        </div>
      </div>

      {/* Main: preview area */}
      <div className="flex-1 relative bg-neutral-900 flex flex-col items-center justify-center overflow-hidden pattern-checkerboard">

        {/* Top status indicator */}
        {scannedStems.length > 0 && (
          <div className="absolute top-3 right-4 z-30 px-2.5 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-md shadow-sm">
            <div className="text-[9px] font-mono text-white/80 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-white/40">{t('localVis.preview.currentSample')}</span>
              <span className="text-indigo-400 font-bold">{scannedStems[currentIndex]}</span>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-[9px] font-black tracking-[0.2em] text-neutral-400 uppercase">{t('localVis.preview.loading')}</p>
          </div>
        )}

        {/* Canvas area */}
        <div className="w-full h-full p-4 flex flex-col items-center overflow-y-auto custom-scrollbar">

          {/* Part A: Independent layer grid */}
          {exportIndependent && Object.keys(previewImages).length > 0 && (
            <div className="w-full max-w-[1600px] mb-8">
              <div className="flex items-center gap-2 mb-3 opacity-50">
                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{t('localVis.preview.independentLayers')}</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 w-full">
                {Object.entries(previewImages).map(([layerName, b64Str]) => (
                  <div key={layerName} className="flex flex-col gap-1 bg-black/40 p-1.5 rounded-lg border border-white/10 shadow-xl">
                    <div className="text-white/60 text-[9px] font-mono px-1 uppercase tracking-wider flex justify-between font-bold">
                      <span>{layerName}</span>
                    </div>
                    <div className="relative rounded overflow-hidden bg-black/50 flex items-center justify-center border border-white/5">
                      <img
                        src={b64Str}
                        className={`w-full max-h-[60vh] object-contain transition-all duration-500 ${isLoading ? 'opacity-30 blur-sm' : 'opacity-100'}`}
                        alt={layerName}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Part B: Fused layout preview */}
          {exportMerged && mergedPreview && (
            <div className="w-full max-w-[1600px] pb-16">
              <div className="flex items-center justify-between mb-4 pt-8 border-t border-white/10">
                <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">{t('localVis.preview.fusedLayout')}</span>
                <div className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-mono border border-indigo-500/30">
                  {exportRows}R × {exportCols}C
                </div>
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border-2 border-indigo-500/20 shadow-2xl shadow-indigo-500/5 transition-all">
                <img
                  src={mergedPreview}
                  className={`w-full h-auto rounded shadow-inner transition-all duration-700 ${isLoading ? 'opacity-20 blur-md' : 'opacity-100'}`}
                  alt="Fused Result"
                />
              </div>
            </div>
          )}

          {/* Part C: Empty state */}
          {!mergedPreview && Object.keys(previewImages).length === 0 && !isLoading && (
            <div className="text-neutral-700 flex flex-col items-center justify-center h-full gap-3 mt-[-10vh]">
              <p className="text-[10px] font-bold opacity-30 tracking-widest uppercase">{t('localVis.preview.empty')}</p>
            </div>
          )}

        </div>
      </div>
      {/* File explorer dialog */}
        <FileExplorerDialog
        open={explorerConfig.open}
        initialPath={explorerConfig.initialPath || ''}
        onClose={() => setExplorerConfig(prev => ({ ...prev, open: false }))}
        onConfirm={handleUniversalExplorerConfirm}
        selectType={explorerConfig.type}
      />
    </div>
  );
}
