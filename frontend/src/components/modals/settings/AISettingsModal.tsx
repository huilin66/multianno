import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudLightning,
  FileText,
  FolderSearch,
  Globe2,
  History,
  Info,
  KeyRound,
  Loader2,
  Settings2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  checkVisionAIStatus,
  checkVLMStatus,
  updateAIConfig,
  updateVLMConfig,
} from '../../../api/client';
import { useStore } from '../../../store/useStore';
import { showDialog } from '../../../store/useDialogStore';
import { FileExplorerDialog } from '../FileExplorerDialog';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Slider } from '../../ui/slider';

interface AISettingsModalProps {
  open: boolean; 
  onClose: () => void; 
}

const VISION_MODEL_OPTIONS = [
  { value: 'SAM-3', label: 'Segment Anything 3' },
  { value: 'YOLOv8', label: 'YOLOv8' },
  { value: 'YOLOv9', label: 'YOLOv9' },
  { value: 'YOLOv10', label: 'YOLOv10' },
  { value: 'YOLO11', label: 'YOLO11' },
  { value: 'YOLO12', label: 'YOLO12' },
  { value: 'YOLO26', label: 'YOLO26' },
  { value: 'YOLO-Custom', label: 'Custom YOLO (.pt/.onnx/.pth)' },
  { value: 'LocateAnything', label: 'NVIDIA LocateAnything', disabled: true },
];

function SectionHeading({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  return (
    <Label className="text-[11px] font-medium text-muted-foreground">
      {children}
      {required && <span className="ml-1 text-primary">*</span>}
    </Label>
  );
}

const getFileName = (path: string) => path.split(/[\\/]/).pop() || path;
const normalizeComparablePath = (path: string) => path.trim().replace(/\\/g, '/').toLowerCase();

const DEFAULT_VLM_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  hasApiKey: false,
  isConfigured: false,
  timeout: 90,
  temperature: 0.1,
  maxTokens: 1024,
};

export function AISettingsModal({ open, onClose }: AISettingsModalProps) {
  const { t } = useTranslation();
  const aiSettings = useStore((s) => s.aiSettings);
  const setAISettings = useStore((s) => s.setAISettings);
  const vlmSettings = useStore((s) => s.vlmSettings || DEFAULT_VLM_SETTINGS);
  const setVLMSettings = useStore((s) => s.setVLMSettings);
  
  const [localSettings, setLocalSettings] = useState(aiSettings);
  const [isVerifying, setIsVerifying] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'loaded' | 'notLoaded'>('notLoaded');
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileExplorerTarget, setFileExplorerTarget] = useState<'model' | 'classes'>('model');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [localVLMSettings, setLocalVLMSettings] = useState(vlmSettings);
  const [vlmApiKey, setVlmApiKey] = useState('');
  const [vlmStatus, setVlmStatus] = useState<'checking' | 'configured' | 'notConfigured' | 'unavailable'>('notConfigured');
  const [isSavingVLM, setIsSavingVLM] = useState(false);

  const isYoloModel = String(localSettings.model || '').toLowerCase().startsWith('yolo');
  const isUnsupportedModel = localSettings.model === 'LocateAnything';
  const isConfigDirty =
    localSettings.model !== aiSettings.model ||
    (localSettings.modelPath || '').trim() !== (aiSettings.modelPath || '').trim() ||
    (localSettings.classFilePath || '').trim() !== (aiSettings.classFilePath || '').trim() ||
    Number(localSettings.confidence ?? 0.25) !== Number(aiSettings.confidence ?? 0.25);
  const isCurrentConfigConfigured = Boolean(aiSettings.isConfigured && !isConfigDirty);
  const isBackendModelLoaded = isCurrentConfigConfigured && backendStatus === 'loaded';
  const modelFileName = localSettings.modelPath ? getFileName(localSettings.modelPath) : t('aiSettings.noModelSelected');
  const isVLMConfigDirty =
    localVLMSettings.baseUrl.trim() !== (vlmSettings.baseUrl || '').trim() ||
    localVLMSettings.model.trim() !== (vlmSettings.model || '').trim() ||
    Number(localVLMSettings.timeout) !== Number(vlmSettings.timeout) ||
    Number(localVLMSettings.temperature) !== Number(vlmSettings.temperature) ||
    Number(localVLMSettings.maxTokens) !== Number(vlmSettings.maxTokens) ||
    Boolean(vlmApiKey.trim());
  const vlmStatusLabel = vlmStatus === 'checking'
    ? t('aiSettings.vlmStatusChecking')
    : vlmStatus === 'configured'
      ? t('aiSettings.vlmStatusReady')
      : vlmStatus === 'unavailable'
        ? t('aiSettings.vlmStatusUnavailable')
        : t('aiSettings.vlmStatusNotConfigured');
  const vlmStatusClass = vlmStatus === 'configured'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : vlmStatus === 'checking'
      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
      : vlmStatus === 'unavailable'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
        : 'border-border bg-muted text-muted-foreground';
  const statusLabel = isUnsupportedModel
    ? t('aiSettings.statusUnavailable')
    : isConfigDirty
      ? t('aiSettings.statusUnsaved')
      : !aiSettings.isConfigured
        ? t('aiSettings.statusNotConfigured')
        : backendStatus === 'checking'
          ? t('aiSettings.statusChecking')
          : backendStatus === 'loaded'
            ? t('aiSettings.statusLoaded')
            : t('aiSettings.statusNotLoaded');
  const statusClass = isUnsupportedModel
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
    : isConfigDirty
      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
      : isBackendModelLoaded
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
        : aiSettings.isConfigured && backendStatus === 'checking'
          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
          : aiSettings.isConfigured
            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
            : 'border-border bg-muted text-muted-foreground';

  useEffect(() => {
    if (open) {
      setLocalSettings(aiSettings);
      setLocalVLMSettings(vlmSettings);
      setVlmApiKey('');
      const savedHistory = localStorage.getItem('multiAnno_aiModelPaths');
      if (savedHistory) {
        try {
          setRecentPaths(JSON.parse(savedHistory));
        } catch (error) {
          console.error('Failed to parse AI history', error);
        }
      }

      let cancelled = false;
      setBackendStatus('checking');
      checkVisionAIStatus().then((status) => {
        if (!cancelled) {
          const matchesCurrentConfig =
            status.is_loaded &&
            (!status.model_path || normalizeComparablePath(status.model_path) === normalizeComparablePath(aiSettings.modelPath)) &&
            (!status.model_type || status.model_type === aiSettings.model);
          setBackendStatus(matchesCurrentConfig ? 'loaded' : 'notLoaded');
        }
      });

      setVlmStatus('checking');
      checkVLMStatus().then((status) => {
        if (!cancelled) {
          const nextVLMSettings = {
            ...vlmSettings,
            baseUrl: status.base_url || vlmSettings.baseUrl,
            model: status.model || vlmSettings.model,
            hasApiKey: Boolean(status.has_api_key),
            isConfigured: Boolean(status.is_configured),
            timeout: Number(status.timeout ?? vlmSettings.timeout),
            temperature: Number(status.temperature ?? vlmSettings.temperature),
            maxTokens: Number(status.max_tokens ?? vlmSettings.maxTokens),
          };
          setLocalVLMSettings(nextVLMSettings);
          setVLMSettings(nextVLMSettings);
          setVlmStatus(
            !status.is_available
              ? 'unavailable'
              : status.is_configured
                ? 'configured'
                : 'notConfigured',
          );
        }
      });

      return () => {
        cancelled = true;
      };
    }
  }, [open]);

  const savePathsToHistory = (path: string) => {
    const trimmed = path.trim().replace(/\\/g, '/');
    if (!trimmed) return;
    
    const newHistory = [trimmed, ...recentPaths.filter(p => p !== trimmed)].slice(0, 5);
    setRecentPaths(newHistory);
    localStorage.setItem('multiAnno_aiModelPaths', JSON.stringify(newHistory));
  };

  const handleSaveAndVerify = async () => {
    const modelPath = localSettings.modelPath.trim();
    if (!modelPath) {
      await showDialog({
        type: 'warning',
        title: t('aiSettings.missingModelPathTitle'),
        description: t('aiSettings.alertSetAI'),
        confirmText: t('common.confirm'),
      });
      return;
    }

    if (isUnsupportedModel) {
      await showDialog({
        type: 'warning',
        title: t('aiSettings.modelUnavailableTitle'),
        description: t('aiSettings.modelUnavailableDescription'),
        confirmText: t('common.confirm'),
      });
      return;
    }

    setIsVerifying(true);
    try {
      await updateAIConfig({
        model_path: modelPath,
        model_type: localSettings.model,
        confidence: localSettings.confidence,
        classes_file: isYoloModel ? localSettings.classFilePath?.trim() || undefined : undefined,
      });

      savePathsToHistory(modelPath);
      setAISettings({
        ...localSettings,
        modelPath,
        classFilePath: isYoloModel ? localSettings.classFilePath?.trim() || '' : '',
        isConfigured: true,
      });
      setBackendStatus('loaded');

      await showDialog({
        type: 'success',
        title: t('common.success'),
        description: t('aiSettings.alertSetAIDone'),
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await showDialog({
        type: 'danger',
        title: t('common.error'),
        description: `${t('aiSettings.alertSetAIFail')}\n\n${message}`,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveVLM = async () => {
    const baseUrl = localVLMSettings.baseUrl.trim();
    const model = localVLMSettings.model.trim();
    if (!baseUrl || !model) {
      await showDialog({
        type: 'warning',
        title: t('aiSettings.vlmConfigurationMissingTitle'),
        description: t('aiSettings.vlmConfigurationMissing'),
        confirmText: t('common.confirm'),
      });
      return;
    }

    setIsSavingVLM(true);
    try {
      const status = await updateVLMConfig({
        base_url: baseUrl,
        model,
        api_key: vlmApiKey.trim() || undefined,
        timeout: Number(localVLMSettings.timeout),
        temperature: Number(localVLMSettings.temperature),
        max_tokens: Number(localVLMSettings.maxTokens),
      });
      const nextVLMSettings = {
        ...localVLMSettings,
        baseUrl: status.base_url || baseUrl,
        model: status.model || model,
        hasApiKey: Boolean(status.has_api_key),
        isConfigured: Boolean(status.is_configured),
        timeout: Number(status.timeout ?? localVLMSettings.timeout),
        temperature: Number(status.temperature ?? localVLMSettings.temperature),
        maxTokens: Number(status.max_tokens ?? localVLMSettings.maxTokens),
      };
      setLocalVLMSettings(nextVLMSettings);
      setVLMSettings(nextVLMSettings);
      setVlmApiKey('');
      setVlmStatus(status.is_configured ? 'configured' : 'notConfigured');
      await showDialog({
        type: 'success',
        title: t('common.success'),
        description: t('aiSettings.vlmConfigurationSaved'),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVlmStatus('unavailable');
      await showDialog({
        type: 'danger',
        title: t('common.error'),
        description: `${t('aiSettings.vlmConfigurationFailed')}\n\n${message}`,
      });
    } finally {
      setIsSavingVLM(false);
    }
  };

  const handleCancel = () => {
    setLocalSettings(aiSettings);
    setLocalVLMSettings(vlmSettings);
    setVlmApiKey('');
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
        <DialogContent className="flex max-h-[min(88vh,760px)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-neutral-200 p-0 dark:border-neutral-800 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CloudLightning className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base">{t('aiSettings.title')}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  {t('aiSettings.description')}
                </DialogDescription>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div className="space-y-4 p-4 sm:p-5">
              <section className="rounded-xl border border-border bg-muted/20 p-4">
                <SectionHeading
                  icon={Settings2}
                  title={t('aiSettings.modelConfiguration')}
                  description={t('aiSettings.modelConfigurationDescription')}
                />

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel>{t('aiSettings.modelType')}</FieldLabel>
                    <Select
                      value={localSettings.model}
                      onValueChange={(model) => setLocalSettings((current) => ({
                        ...current,
                        model,
                        classFilePath: model.toLowerCase().startsWith('yolo') ? current.classFilePath : '',
                      }))}
                    >
                      <SelectTrigger id="ai-model-type" className="h-9 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VISION_MODEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                            <span>{option.label}</span>
                            {option.disabled && (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {t('aiSettings.unavailable')}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {t('aiSettings.modelTypeHint')}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel required>{t('aiSettings.modelPath')}</FieldLabel>
                    <div className="relative">
                      <Input
                        id="ai-model-path"
                        className="h-9 pr-10 font-mono text-xs"
                        placeholder={t('aiSettings.infoModelPath')}
                        value={localSettings.modelPath}
                        onChange={(e) => setLocalSettings((current) => ({ ...current, modelPath: e.target.value }))}
                        title={localSettings.modelPath || t('aiSettings.infoModelPath')}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFileExplorerTarget('model');
                          setFileExplorerOpen(true);
                        }}
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        title={t('aiSettings.selectModelPath')}
                        aria-label={t('aiSettings.selectModelPath')}
                      >
                        <FolderSearch className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {recentPaths.length > 0 && (
                      <div className="pt-1">
                        <span className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <History className="h-3 w-3" />
                          {t('aiSettings.infoHistoricalModelPath')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {recentPaths.map((path) => (
                            <button
                              key={path}
                              type="button"
                              onClick={() => setLocalSettings((current) => ({ ...current, modelPath: path }))}
                              className="max-w-[220px] truncate rounded-md border border-transparent bg-background px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                              title={path}
                            >
                              {getFileName(path)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isYoloModel && (
                  <div className="mt-4 border-t border-border/70 pt-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel>{t('aiSettings.classFile')}</FieldLabel>
                        <span className="text-[10px] text-muted-foreground">{t('aiSettings.optional')}</span>
                      </div>
                      <div className="relative">
                        <Input
                          id="ai-class-file"
                          className="h-9 pr-10 font-mono text-xs"
                          placeholder={t('aiSettings.infoClassFile')}
                          value={localSettings.classFilePath || ''}
                          onChange={(e) => setLocalSettings((current) => ({ ...current, classFilePath: e.target.value }))}
                          title={localSettings.classFilePath || t('aiSettings.infoClassFile')}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFileExplorerTarget('classes');
                            setFileExplorerOpen(true);
                          }}
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          title={t('aiSettings.selectClassFile')}
                          aria-label={t('aiSettings.selectClassFile')}
                        >
                          <FolderSearch className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                        <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{t('aiSettings.classFileHint')}</span>
                      </p>
                    </div>
                  </div>
                )}

                <div className={`mt-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${statusClass}`} role="status">
                  {isUnsupportedModel ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : isBackendModelLoaded ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : aiSettings.isConfigured && backendStatus === 'notLoaded' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold">{statusLabel}</p>
                    <p className="mt-0.5 truncate text-[10px] opacity-80" title={localSettings.modelPath}>
                      {isUnsupportedModel
                        ? t('aiSettings.modelUnavailableDescription')
                        : isConfigDirty && aiSettings.isConfigured
                          ? t('aiSettings.unsavedChanges')
                          : aiSettings.isConfigured && backendStatus === 'checking'
                            ? t('aiSettings.statusChecking')
                            : aiSettings.isConfigured && backendStatus === 'notLoaded'
                              ? t('aiSettings.backendNotLoadedDescription')
                            : modelFileName}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-background p-4">
                <SectionHeading
                  icon={Settings2}
                  title={t('aiSettings.inferenceConfiguration')}
                  description={t('aiSettings.inferenceConfigurationDescription')}
                />

                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel>{t('aiSettings.confidence')}</FieldLabel>
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                      {(localSettings.confidence ?? 0.25).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    id="ai-confidence"
                    aria-label={t('aiSettings.confidence')}
                    value={[(localSettings.confidence ?? 0.25) * 100]}
                    max={100}
                    step={1}
                    onValueChange={(value) => setLocalSettings((current) => ({
                      ...current,
                      confidence: (Array.isArray(value) ? value[0] : value) / 100,
                    }))}
                    className="mt-3 py-1"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>0</span>
                    <span>0.5</span>
                    <span>1.0</span>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                    {t('aiSettings.confidenceHint')}
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading
                    icon={Globe2}
                    title={t('aiSettings.vlmConfiguration')}
                    description={t('aiSettings.vlmConfigurationDescription')}
                  />
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${vlmStatusClass}`}>
                    {vlmStatusLabel}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5 lg:col-span-2">
                    <FieldLabel required>{t('aiSettings.vlmBaseUrl')}</FieldLabel>
                    <Input
                      id="vlm-base-url"
                      className="h-9 font-mono text-xs"
                      value={localVLMSettings.baseUrl}
                      onChange={(e) => setLocalVLMSettings((current) => ({ ...current, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                      title={localVLMSettings.baseUrl}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel required>{t('aiSettings.vlmModel')}</FieldLabel>
                    <Input
                      id="vlm-model"
                      className="h-9 text-xs"
                      value={localVLMSettings.model}
                      onChange={(e) => setLocalVLMSettings((current) => ({ ...current, model: e.target.value }))}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel>{t('aiSettings.vlmApiKey')}</FieldLabel>
                      {vlmSettings.hasApiKey && !vlmApiKey && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          {t('aiSettings.vlmApiKeyConfigured')}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="vlm-api-key"
                        type="password"
                        className="h-9 pl-8 text-xs"
                        value={vlmApiKey}
                        onChange={(e) => setVlmApiKey(e.target.value)}
                        placeholder={vlmSettings.hasApiKey ? t('aiSettings.vlmApiKeyPlaceholderConfigured') : t('aiSettings.vlmApiKeyPlaceholder')}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:col-span-2">
                    <div className="space-y-1.5">
                      <FieldLabel>{t('aiSettings.vlmTimeout')}</FieldLabel>
                      <Input
                        type="number"
                        min={5}
                        max={300}
                        className="h-9 text-xs"
                        value={localVLMSettings.timeout}
                        onChange={(e) => setLocalVLMSettings((current) => ({ ...current, timeout: Number(e.target.value) || 90 }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>{t('aiSettings.vlmTemperature')}</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        className="h-9 text-xs"
                        value={localVLMSettings.temperature}
                        onChange={(e) => setLocalVLMSettings((current) => ({ ...current, temperature: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>{t('aiSettings.vlmMaxTokens')}</FieldLabel>
                      <Input
                        type="number"
                        min={64}
                        max={8192}
                        className="h-9 text-xs"
                        value={localVLMSettings.maxTokens}
                        onChange={(e) => setLocalVLMSettings((current) => ({ ...current, maxTokens: Number(e.target.value) || 1024 }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{t('aiSettings.vlmApiKeyHint')}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 text-white"
                    onClick={handleSaveVLM}
                    disabled={isSavingVLM || !localVLMSettings.baseUrl.trim() || !localVLMSettings.model.trim()}
                  >
                    {isSavingVLM && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {isSavingVLM ? t('aiSettings.vlmSaving') : t('aiSettings.vlmSave')}
                  </Button>
                </div>
                {isVLMConfigDirty && (
                  <p className="mt-2 text-[10px] text-primary">{t('aiSettings.vlmUnsavedChanges')}</p>
                )}
              </section>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {isConfigDirty
                  ? t('aiSettings.unsavedChanges')
                  : aiSettings.isConfigured && backendStatus === 'notLoaded'
                    ? t('aiSettings.backendNotLoadedDescription')
                    : t('aiSettings.saveHint')}
              </span>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                className="text-white"
                onClick={handleSaveAndVerify}
                disabled={isVerifying || isUnsupportedModel || !localSettings.modelPath.trim()}
                title={isUnsupportedModel ? t('aiSettings.modelUnavailableDescription') : undefined}
              >
                {isVerifying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {isVerifying ? t('aiSettings.infoLoadingModelPath') : t('aiSettings.loadAndVerify')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FileExplorerDialog
        open={fileExplorerOpen}
        initialPath={(fileExplorerTarget === 'classes' ? localSettings.classFilePath : localSettings.modelPath) || '/'}
        selectType="file"
        onClose={() => setFileExplorerOpen(false)}
        onConfirm={(paths) => {
          if (paths.length > 0) {
            if (fileExplorerTarget === 'classes') {
              setLocalSettings((current) => ({ ...current, classFilePath: paths[0] }));
            } else {
              setLocalSettings((current) => ({ ...current, modelPath: paths[0] }));
            }
          }
          setFileExplorerOpen(false);
        }}
      />
    </>
  );
}
