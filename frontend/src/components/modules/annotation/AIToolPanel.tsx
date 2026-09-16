// src/components/annotation/AIToolPanel.tsx
import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { useTranslation } from 'react-i18next';
import { 
  MousePointerClick, Sparkles, MessageSquare, PlusCircle,
  MinusCircle, SquareDashed, Trash2, Check, X, Loader2,
  AlertTriangle, Tags
} from 'lucide-react';
import { useStore } from '../../../store/useStore';
import { checkVLMStatus, inferVLM } from '../../../api/client';

interface AIToolPanelProps {
  isOpen: boolean;
  onClose: () => void;
  views: any[];
  selectedViewId: string;
  onViewChange: (id: string) => void;
  taxonomyClasses: any[];
  aiPrompts: any[];
  setAiPrompts: (prompts: any[]) => void;
  onConfirmPreview: () => void;
  isPredicting: boolean;
  sourceMode: 'raw' | 'view';
  setSourceMode: (mode: 'raw' | 'view') => void;
  promptMode: 'positive' | 'negative' | 'box';
  setPromptMode: (mode: 'positive' | 'negative' | 'box') => void;
  isAIReady: boolean;
  activeAnnotation?: any;
  vlmImagePath?: string;
  taxonomyAttributes?: any[];
  onApplyVLMAttributes?: (attributes: Record<string, string>) => void;
}

const getAnnotationBBox = (annotation: any): number[] | null => {
  const points = Array.isArray(annotation?.points) ? annotation.points : [];
  if (points.length === 0) return null;
  const validPoints = points.filter((point: any) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
  if (validPoints.length === 0) return null;
  const xs = validPoints.map((point: any) => Number(point.x));
  const ys = validPoints.map((point: any) => Number(point.y));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

export function AIToolPanel({ 
  isOpen, onClose, views, selectedViewId, onViewChange, taxonomyClasses,
  aiPrompts, setAiPrompts, onConfirmPreview, isPredicting,
  sourceMode, setSourceMode, promptMode, setPromptMode, 
  onConfirmInit, onResetInit, isAIReady, isInitializing,
  onAutoPredict, autoResultMsg, activeTab, setActiveTab, onResetPrompts,
  activeAnnotation, vlmImagePath, taxonomyAttributes = [], onApplyVLMAttributes,
}: any) {
  const { t } = useTranslation();
  const { aiSettings, setAISettings, addTaxonomyClass, vlmSettings, setVLMSettings } = useStore() as any;

  // 🌟 新增弹窗状态
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [unmappedTags, setUnmappedTags] = useState<string[]>([]);
  // 格式: { "red door": { mode: 'existing', target: 'door' } }
  const [tagMappings, setTagMappings] = useState<Record<string, { mode: 'new'|'existing'|'uncategorized', target: string }>>({});


  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [autoText, setAutoText] = useState('');
  const [vlmMode, setVlmMode] = useState<'attributes' | 'vqa'>('attributes');
  const [vlmPrompt, setVlmPrompt] = useState('');
  const [vlmResult, setVlmResult] = useState<any>(null);
  const [vlmError, setVlmError] = useState('');
  const [isVlmRunning, setIsVlmRunning] = useState(false);
  const [vlmApplied, setVlmApplied] = useState(false);
  const isYoloModel = String(aiSettings?.model || '').toLowerCase().startsWith('yolo');

  useEffect(() => {
    setVlmResult(null);
    setVlmError('');
    setVlmApplied(false);
  }, [activeAnnotation?.id]);

  useEffect(() => {
    if (activeTab !== 'vqa') return;
    let cancelled = false;
    checkVLMStatus().then((status) => {
      if (cancelled || !status) return;
      setVLMSettings?.({
        baseUrl: status.base_url || vlmSettings?.baseUrl || '',
        model: status.model || vlmSettings?.model || '',
        hasApiKey: Boolean(status.has_api_key),
        isConfigured: Boolean(status.is_configured),
        ...(status.timeout !== undefined ? { timeout: Number(status.timeout) } : {}),
        ...(status.temperature !== undefined ? { temperature: Number(status.temperature) } : {}),
        ...(status.max_tokens !== undefined ? { maxTokens: Number(status.max_tokens) } : {}),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, setVLMSettings]);

  const runVLM = async () => {
    setVlmError('');
    setVlmResult(null);
    setVlmApplied(false);
    if (!vlmSettings?.isConfigured) {
      setVlmError(t('aiTool.vlmNotConfigured'));
      return;
    }
    if (!vlmImagePath) {
      setVlmError(t('aiTool.vlmNoImage'));
      return;
    }
    const bbox = vlmMode === 'attributes' ? getAnnotationBBox(activeAnnotation) : null;
    if (vlmMode === 'attributes' && !bbox) {
      setVlmError(t('aiTool.vlmNoObject'));
      return;
    }
    if (vlmMode === 'attributes' && taxonomyAttributes.length === 0) {
      setVlmError(t('aiTool.vlmNoAttributes'));
      return;
    }

    setIsVlmRunning(true);
    try {
      const response = await inferVLM({
        image_path: vlmImagePath,
        bbox: bbox || undefined,
        prompt: vlmPrompt.trim(),
        mode: vlmMode,
        class_name: activeAnnotation?.label,
        taxonomy: vlmMode === 'attributes'
          ? {
              attributes: taxonomyAttributes.map((attribute: any) => ({
                name: attribute.name,
                values: Array.isArray(attribute.options) ? attribute.options : [],
              })),
            }
          : undefined,
      });
      setVlmResult(response);
    } catch (error: any) {
      setVlmError(error?.message || String(error));
    } finally {
      setIsVlmRunning(false);
    }
  };

  const applyVLMAttributes = () => {
    if (!vlmResult?.attributes?.length || !onApplyVLMAttributes) return;
    const updates = vlmResult.attributes.reduce((result: Record<string, string>, item: any) => {
      if (item?.name && item?.value !== undefined && item?.value !== null) {
        result[String(item.name)] = String(item.value);
      }
      return result;
    }, {});
    if (Object.keys(updates).length === 0) return;
    onApplyVLMAttributes(updates);
    setVlmApplied(true);
  };

  if (!isOpen) return null;

// 🌟 动态计算底部状态栏
  let statusText = '';
  let statusColor = '';
  let showSpinner = false;

  const isVlmTab = activeTab === 'vqa';
  if (isVlmTab && !vlmSettings?.isConfigured) {
    statusText = t('aiTool.vlmNotConfigured');
    statusColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300';
  } else if (isVlmTab && isVlmRunning) {
    statusText = t('aiTool.vlmRunning');
    statusColor = 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400';
    showSpinner = true;
  } else if (isVlmTab && vlmError) {
    statusText = vlmError;
    statusColor = 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400';
  } else if (isVlmTab && vlmResult) {
    statusText = vlmApplied ? t('aiTool.vlmApplied') : t('aiTool.vqaNotSupported');
    statusColor = 'bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400 border-teal-200 dark:border-teal-800';
  } else if (isVlmTab) {
    statusText = t('aiTool.vlmReady');
    statusColor = 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400';
  } else if (!aiSettings?.isConfigured) {
    statusText = t('aiTool.modelNotLoaded');
    statusColor = 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400';
  } else if (isInitializing) {
    statusText = t('aiTool.imageDataLoading');
    statusColor = 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400';
    showSpinner = true;
  } else if (isPredicting) {
    statusText = t('aiTool.aiInferring');
    statusColor = 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400';
    showSpinner = true;
  } else if (autoResultMsg) {
    // 🌟 新增判定：如果存在结果提示，显示高亮的青色状态
    statusText = autoResultMsg;
    statusColor = 'bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400 border-teal-200 dark:border-teal-800';
  } else if (!isAIReady) {
    statusText = t('aiTool.imageDataNotLoaded');
    statusColor = 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400';
  } else {
    statusText = t('aiTool.aiEngineReady');
    statusColor = 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400';
  }

  if (!isOpen) return null;

return (
    <div className="relative w-52 h-full bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col z-20 shadow-xl animate-in slide-in-from-left-2">
      {/* 🌟 1. 顶部指示灯：改为单行显示 */}
      <div className={`p-2 border-b flex items-center justify-center text-[10px] font-bold shrink-0 ${
        aiSettings.isConfigured 
          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800' 
          : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800'
      }`}>
        <div className={`w-2 h-2 rounded-full mr-1.5 shrink-0 ${aiSettings.isConfigured ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="truncate" title={aiSettings.isConfigured ? `${t('aiTool.activeModel')}: ${aiSettings.modelPath.split(/[\\/]/).pop()}` : t('aiTool.modelNotLoadedShort')}>
          {aiSettings.isConfigured ? `${t('aiTool.activeModel')}: ${aiSettings.modelPath.split(/[\\/]/).pop()}` : t('aiTool.modelNotLoadedShort')}
        </span>
      </div>

      {/* 🌟 2. 顶部配置区：保持极致紧凑 */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/10 space-y-3 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">{t('aiTool.targetView')}</label>
            <Select value={selectedViewId} onValueChange={onViewChange}>
              <SelectTrigger className="h-8 text-[11px] font-bold px-2 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm focus:ring-1 focus:ring-blue-500">
                <SelectValue placeholder={t('aiTool.selectViewPlaceholder')}>
                  {views.find((v:any) => v.id === selectedViewId)?.isMain ? t('view.mainView') : t('view.augView')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {views.map((v:any, i:number) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.isMain ? t('view.mainView') : `${t('view.augView')} ${i}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-16 shrink-0"> 
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-1 text-center">{t('aiTool.size')}</label>
            <input
              type="number" step={14} title={t('aiTool.size')}
              className="w-full h-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-[11px] font-mono text-center font-bold text-blue-600 dark:text-blue-400 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={aiSettings.inferenceSize || 644}
              onChange={(e) => setAISettings({ inferenceSize: parseInt(e.target.value) || 644 })}
            />
          </div>
        </div>

        {/* --- Confidence --- */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">{t('aiTool.confidence')}</label>
            <input 
              type="number" step={0.05} min={0.01} max={1.0}
              className="w-10 h-4 bg-transparent border-b border-neutral-300 dark:border-neutral-700 text-right font-mono text-[10px] outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={aiSettings.confidence ?? 0.25}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                if (!isNaN(val)) setAISettings({ confidence: val });
              }}
            />
          </div>
          </div>

        <div>
          <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">{t('aiTool.imageSource')}</label>
          <div className="flex bg-neutral-200/50 dark:bg-neutral-950/50 rounded p-0.5 border border-neutral-200 dark:border-neutral-800">
            <button className={`flex-1 py-1 text-[10px] rounded transition-all ${sourceMode === 'raw' ? 'bg-white dark:bg-neutral-800 shadow-sm font-bold text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`} onClick={() => setSourceMode('raw')}>{t('aiTool.raw')}</button>
            <button className={`flex-1 py-1 text-[10px] rounded transition-all ${sourceMode === 'view' ? 'bg-white dark:bg-neutral-800 shadow-sm font-bold text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`} onClick={() => setSourceMode('view')}>{t('aiTool.transformed')}</button>
          </div>
        </div>

        {/* 🌟 1. 恢复：Confirm 与 Reset 按钮 */}
        <div className="flex gap-2 pt-1">
          <Button variant="default" className="flex-1 h-8 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 shadow-sm" onClick={onConfirmInit} disabled={isInitializing || isPredicting}>
            {isInitializing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            {isInitializing ? t('aiTool.loading') : t('aiTool.confirm')}
          </Button>
          <Button variant="outline" className="flex-1 h-8 text-[11px] font-bold bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" onClick={onResetInit} disabled={isInitializing || isPredicting}>
            {t('aiTool.reset')}
          </Button>
        </div>

        {/* 🌟 2. 新增：输出结果类型选择 (BBox / Polygon) */}
        <div className="pt-2">
           <div className="flex bg-neutral-200/50 dark:bg-neutral-950/50 rounded p-0.5 border border-neutral-200 dark:border-neutral-800">
            <button 
              className={`flex-1 py-1 text-[10px] rounded transition-all ${aiSettings.outputType === 'polygon' || !aiSettings.outputType ? 'bg-white dark:bg-neutral-800 shadow-sm font-bold text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`} 
              onClick={() => setAISettings({ outputType: 'polygon' })}
            >
              {t('aiTool.polygon')}
            </button>
            <button
              className={`flex-1 py-1 text-[10px] rounded transition-all ${aiSettings.outputType === 'bbox' ? 'bg-white dark:bg-neutral-800 shadow-sm font-bold text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              onClick={() => setAISettings({ outputType: 'bbox' })}
            >
              {t('aiTool.bbox')}
            </button>
          </div>
        </div>
      </div>

      {/* === 下面是 3. 中间：Tab 切换，保持不变 === */}

      {/* 3. 中间：Tab 切换 */}
      <div className="flex p-1 gap-1 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        {(['auto', 'semi', 'vqa'] as const).map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'secondary' : 'ghost'} className="flex-1 h-7 px-0 text-[10px] gap-1" onClick={() => setActiveTab(tab)}>
            {tab === 'auto' && <Sparkles className="w-3 h-3" />}
            {tab === 'semi' && <MousePointerClick className="w-3 h-3" />}
            {tab === 'vqa' && <MessageSquare className="w-3 h-3" />}
            {t(`aiTool.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
          </Button>
        ))}
      </div>

      {/* 4. 内容区 */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col transition-opacity duration-300 ${!isVlmTab && !isAIReady ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
        
        {/* === AUTO TAB === */}
        {activeTab === 'auto' && (
          <div className="space-y-4">
            {/* --- Size Filter --- */}
        <div className="space-y-1.5 p-2 bg-neutral-50 dark:bg-black/20 rounded-md border border-neutral-200 dark:border-neutral-800">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">{t('aiTool.sizeFilter')}</label>
            <div className="flex items-center text-blue-600 bg-blue-100 dark:bg-blue-900/40 px-1 rounded">
              <input 
                type="number" step={0.1} min={0} max={100}
                className="w-8 h-4 bg-transparent text-right font-mono text-[10px] font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={aiSettings.filterThreshold ?? 0}
                onChange={(e) => {
                  const val = e.target.valueAsNumber;
                  if (!isNaN(val)) setAISettings({ filterThreshold: val });
                }}
              />
              <span className="text-[9px] ml-0.5">%</span>
            </div>
          </div>
          <p className="text-[8px] text-neutral-400 leading-tight italic">* {t('aiTool.ignoreFilterDesc')}</p>
        </div>

            {/* 1. 快捷添加下拉框 */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">{t('aiTool.quickAddClass')}</label>
              <Select onValueChange={(val) => { if (!autoTags.includes(val)) setAutoTags([...autoTags, val]); }}>
                <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm focus:ring-1 focus:ring-blue-500">
                  <SelectValue placeholder={t('aiTool.selectClass')} />
                </SelectTrigger>
                <SelectContent>
                  {taxonomyClasses.map((c: any) => (<SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {/* 🌟 2. 核心重构：输入与列表分离 */}
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">{t('aiTool.textPrompts')}</label>
              
              {/* 独立干净的输入框 */}
              <input 
                className="w-full h-8 px-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-[11px] shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" 
                placeholder={t('aiTool.typePromptPlaceholder')}
                value={autoText}
                onChange={e => setAutoText(e.target.value)} 
                onKeyDown={e => { 
                  if (e.key === 'Enter' && autoText.trim()) { 
                    setAutoTags([...autoTags, autoText.trim()]); 
                    setAutoText(''); 
                  } 
                }}
              />

              {/* 独立的 Prompts 收集篮 (带空状态提示) */}
              <div className={`min-h-[70px] p-2 rounded-md transition-colors ${
                autoTags.length > 0 
                  ? 'bg-neutral-50 dark:bg-black/20 border border-neutral-200 dark:border-neutral-800 shadow-inner' 
                  : 'bg-neutral-50/50 dark:bg-black/10 border border-dashed border-neutral-200 dark:border-neutral-800 flex items-center justify-center'
              }`}>
                {autoTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {autoTags.map((tag, i) => (
                      <span key={i} className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm">
                        {tag} 
                        <X className="w-3 h-3 cursor-pointer hover:text-red-500 transition-colors" onClick={() => setAutoTags(autoTags.filter((_, idx) => idx !== i))} />
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[9px] text-neutral-400 font-medium">{t('aiTool.noPromptsAdded')}</span>
                )}
              </div>
            </div>

            {/* 🌟 3. 操作区：去掉了 Batch 按钮，突出核心推断 */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 relative space-y-2">
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 h-8 text-[11px] font-bold shadow-sm gap-2 transition-all" 
                onClick={() => {
                  const finalTags = autoText.trim() ? [...autoTags, autoText.trim()] : [...autoTags];
                  if (autoText.trim()) {
                    setAutoTags(finalTags);
                    setAutoText('');
                  }
                  
                  // 🛡️ 拦截逻辑：检查未知标签
                  const existingClassNames = taxonomyClasses.map((c: any) => c.name);
                  const unknown = finalTags.filter(tag => !existingClassNames.includes(tag));
                  
                  if (unknown.length > 0) {
                    // 初始化映射状态
                    const initialMappings: any = {};
                    unknown.forEach(t => initialMappings[t] = { mode: 'new', target: t }); // 默认新增
                    setUnmappedTags(unknown);
                    setTagMappings(initialMappings);
                    setMappingModalOpen(true); // 打开弹窗
                  } else {
                    // 完美匹配，直接执行 (组装一个直通的映射表)
                    const directMap: any = {};
                    finalTags.forEach(t => directMap[t] = t);
                    onAutoPredict(finalTags, directMap);
                  }
                }}
                disabled={!isAIReady || isPredicting || (!isYoloModel && autoTags.length === 0 && autoText.trim() === '')}
              >
                {isPredicting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 
                {isPredicting ? t('aiTool.inferring') : t('aiTool.inferCurrent')}
              </Button>
              {isYoloModel && (
                <Button
                  variant="outline"
                  className="w-full h-8 text-[11px] font-bold shadow-sm gap-2"
                  onClick={() => onAutoPredict([], {})}
                  disabled={!isAIReady || isPredicting}
                  title={t('aiTool.inferAllClassesHint')}
                >
                  {isPredicting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {t('aiTool.inferAllClasses')}
                </Button>
              )}
            </div>

            {/* 🌟 4. Mapping Modal (未知标签处理弹窗) */}
            {mappingModalOpen && (
              <div className="absolute inset-x-2 bottom-10 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl rounded-lg p-3 flex flex-col animate-in slide-in-from-bottom-4">
                <div className="flex items-center gap-2 mb-3 border-b border-neutral-100 dark:border-neutral-800 pb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h4 className="text-[11px] font-bold">{t('aiTool.unrecognizedPrompts')}</h4>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar max-h-48 pr-1">
                  {unmappedTags.map(tag => (
                    <div key={tag} className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded border border-neutral-200 dark:border-neutral-800">
                      <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                        <Tags className="w-3 h-3" /> "{tag}"
                      </div>
                      
                      <div className="flex gap-1 mb-1.5">
                        <button className={`flex-1 text-[9px] py-1 rounded transition-colors ${tagMappings[tag].mode === 'new' ? 'bg-green-100 text-green-700 font-bold border border-green-200' : 'bg-white border border-neutral-200 text-neutral-500'}`} onClick={() => setTagMappings(p => ({...p, [tag]: { mode: 'new', target: tag }}))}>
                          {t('aiTool.addNew')}
                        </button>
                        <button className={`flex-1 text-[9px] py-1 rounded transition-colors ${tagMappings[tag].mode === 'existing' ? 'bg-blue-100 text-blue-700 font-bold border border-blue-200' : 'bg-white border border-neutral-200 text-neutral-500'}`} onClick={() => setTagMappings(p => ({...p, [tag]: { mode: 'existing', target: taxonomyClasses[0]?.name || '' }}))}>
                          {t('aiTool.mapTo')}
                        </button>
                      </div>

                      {tagMappings[tag].mode === 'existing' && (
                        <Select 
                          value={tagMappings[tag].target} 
                          onValueChange={(val) => setTagMappings(p => ({...p, [tag]: { mode: 'existing', target: val }}))}
                        >
                          <SelectTrigger className="h-6 text-[10px] w-full bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {taxonomyClasses.map((c: any) => <SelectItem key={c.id} value={c.name} className="text-[10px]">{c.name}</SelectItem>)}
                            <SelectItem value="Uncategorized" className="text-[10px] text-amber-600 font-bold">{t('aiTool.uncategorizedSkip')}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <Button variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => setMappingModalOpen(false)}>{t('aiTool.cancel')}</Button>
                  <Button className="flex-1 h-7 text-[10px] bg-blue-600 hover:bg-blue-700" onClick={() => {
                    // 1. 生成最终字典并入库新分类
                    const finalDict: Record<string, string> = {};
                    unmappedTags.forEach(tag => {
                      const choice = tagMappings[tag];
                      if (choice.mode === 'new') {
                        addTaxonomyClass({ id: `class-${Date.now()}-${Math.random()}`, name: tag, color: '#10B981' });
                        finalDict[tag] = tag;
                      } else {
                        finalDict[tag] = choice.target;
                      }
                    });
                    
                    // 把原本就认识的标签也加进字典
                    const knownTags = autoTags.filter(t => !unmappedTags.includes(t));
                    knownTags.forEach(t => finalDict[t] = t);

                    // 2. 关闭弹窗，执行推断！
                    setMappingModalOpen(false);
                    onAutoPredict(autoTags, finalDict); 
                  }}>
                    {t('aiTool.confirmAndRun')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}


        {/* === SEMI TAB === */}
        {activeTab === 'semi' && (
          <div className="space-y-4">

            {/* 🌟 新增：Semi 专属类别选择器 */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">{t('aiTool.assignClass')}</label>
              <Select 
                value={aiSettings.semiClass || 'None'} 
                onValueChange={(val) => setAISettings({ semiClass: val })}
              >
                <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm focus:ring-1 focus:ring-blue-500">
                  <SelectValue placeholder={t('aiTool.sourceNone')} />
                </SelectTrigger>
                <SelectContent>
                  {/* 默认项：如果不选，就 fallback 到外层画图工具选中的类别 */}
                  <SelectItem value="None" className="text-xs text-neutral-400 italic">{t('aiTool.noneUseGlobal')}</SelectItem>
                  {taxonomyClasses.map((c: any) => (
                    <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Button variant={promptMode === 'positive' ? 'default' : 'outline'} className={`h-9 justify-start px-3 gap-2 ${promptMode === 'positive' ? 'bg-green-600 hover:bg-green-700' : ''}`} onClick={() => setPromptMode('positive')}>
                <PlusCircle className="w-4 h-4" /> <span className="text-xs">{t('aiTool.positivePt')}</span>
              </Button>
              <Button variant={promptMode === 'negative' ? 'default' : 'outline'} className={`h-9 justify-start px-3 gap-2 ${promptMode === 'negative' ? 'bg-red-600 hover:bg-red-700' : ''}`} onClick={() => setPromptMode('negative')}>
                <MinusCircle className="w-4 h-4" /> <span className="text-xs">{t('aiTool.negativePt')}</span>
              </Button>
              <Button variant={promptMode === 'box' ? 'default' : 'outline'} className={`h-9 justify-start px-3 gap-2 ${promptMode === 'box' ? 'bg-blue-600 hover:bg-blue-700' : ''}`} onClick={() => setPromptMode('box')}>
                <SquareDashed className="w-4 h-4" /> <span className="text-xs">{t('aiTool.boxPrompt')}</span>
              </Button>
            </div>


            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              {/* 🌟 修复：把 onClick 里的 setAiPrompts([]) 换成 onResetPrompts */}
              <Button variant="outline" size="sm" className="w-full text-[10px] h-8" onClick={onResetPrompts}>
                <Trash2 className="w-3 h-3 mr-2" /> {t('aiTool.resetPrompts')}
              </Button>
              <Button size="sm" className="w-full bg-blue-600 h-8 text-[10px]" onClick={onConfirmPreview} disabled={isPredicting || aiPrompts.length === 0}>
                <Check className="w-3 h-3 mr-2" /> {t('aiTool.confirmAdd')}
              </Button>
            </div>
          </div>
        )}

        {/* === VQA TAB === */}
        {activeTab === 'vqa' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">{t('aiTool.vqaNotSupported')}</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{t('aiTool.vqaDescription')}</p>
                </div>
              </div>
            </div>

            <div className="flex rounded-md border border-neutral-200 bg-neutral-100/70 p-0.5 dark:border-neutral-800 dark:bg-neutral-950/50">
              <button
                type="button"
                className={`flex-1 rounded px-1.5 py-1.5 text-[10px] transition-all ${vlmMode === 'attributes' ? 'bg-white font-semibold text-primary shadow-sm dark:bg-neutral-800' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
                onClick={() => { setVlmMode('attributes'); setVlmResult(null); setVlmError(''); }}
              >
                {t('aiTool.vlmAttributes')}
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-1.5 py-1.5 text-[10px] transition-all ${vlmMode === 'vqa' ? 'bg-white font-semibold text-primary shadow-sm dark:bg-neutral-800' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
                onClick={() => { setVlmMode('vqa'); setVlmResult(null); setVlmError(''); }}
              >
                {t('aiTool.vlmQuestion')}
              </button>
            </div>

            {vlmMode === 'attributes' ? (
              <div className="space-y-2 rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-foreground">{t('aiTool.vlmSelectedObject')}</span>
                  <span className="max-w-[110px] truncate rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground" title={activeAnnotation?.label || t('aiTool.vlmNoObject')}>
                    {activeAnnotation?.label || t('aiTool.vlmNoObject')}
                  </span>
                </div>
                <p className="text-[9px] leading-relaxed text-muted-foreground">{t('aiTool.vlmUseMainImage')}</p>
                {taxonomyAttributes.length === 0 && (
                  <p className="text-[9px] text-amber-600 dark:text-amber-400">{t('aiTool.vlmNoAttributes')}</p>
                )}
              </div>
            ) : (
              <p className="text-[9px] leading-relaxed text-muted-foreground">{t('aiTool.vlmUseMainImage')}</p>
            )}

            <textarea
              className="min-h-[64px] w-full resize-y rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-[10px] leading-relaxed outline-none transition-colors placeholder:text-neutral-400 focus:border-primary focus:ring-1 focus:ring-primary dark:border-neutral-700 dark:bg-neutral-900"
              value={vlmPrompt}
              onChange={(event) => setVlmPrompt(event.target.value)}
              placeholder={t(vlmMode === 'attributes' ? 'aiTool.vlmPromptPlaceholder' : 'aiTool.vlmQuestionPlaceholder')}
              disabled={!vlmSettings?.isConfigured || isVlmRunning}
            />

            {vlmError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[9px] leading-relaxed text-red-600 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                {vlmError}
              </div>
            )}

            <Button
              className="h-8 w-full gap-2 bg-blue-600 text-[10px] font-bold shadow-sm hover:bg-blue-700"
              onClick={runVLM}
              disabled={isVlmRunning || !vlmSettings?.isConfigured || !vlmImagePath || (vlmMode === 'attributes' && (!activeAnnotation || taxonomyAttributes.length === 0))}
            >
              {isVlmRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isVlmRunning ? t('aiTool.vlmRunning') : t('aiTool.vlmRun')}
            </Button>

            {vlmResult && vlmMode === 'attributes' && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/10">
                {Array.isArray(vlmResult.attributes) && vlmResult.attributes.length > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      {vlmResult.attributes.map((item: any, index: number) => (
                        <div key={`${item.name}-${index}`} className="rounded border border-emerald-200/70 bg-white/70 px-2 py-1.5 dark:border-emerald-900/50 dark:bg-neutral-900/50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[10px] font-semibold text-foreground" title={item.name}>{item.name}</span>
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{item.value}</span>
                          </div>
                          {item.confidence !== undefined && (
                            <p className="mt-1 text-[8px] text-muted-foreground">{t('aiTool.vlmConfidence')}: {(Number(item.confidence) * 100).toFixed(0)}%</p>
                          )}
                          {item.evidence && <p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">{t('aiTool.vlmEvidence')}: {item.evidence}</p>}
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" className="h-7 w-full text-[10px]" onClick={applyVLMAttributes} disabled={vlmApplied}>
                      {vlmApplied ? <Check className="mr-1.5 h-3 w-3" /> : null}
                      {vlmApplied ? t('aiTool.vlmApplied') : t('aiTool.vlmApplyAttributes')}
                    </Button>
                  </>
                ) : (
                  <p className="text-[9px] text-muted-foreground">{t('aiTool.vlmNoResult')}</p>
                )}
              </div>
            )}

            {vlmResult && vlmMode === 'vqa' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-[10px] leading-relaxed text-foreground dark:border-emerald-900/60 dark:bg-emerald-950/10">
                {vlmResult.answer || t('aiTool.vlmNoResult')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🌟 5. 常驻动态底部状态栏 */}
      <div className={`p-2 border-t border-neutral-200 dark:border-neutral-800 text-center text-[9px] uppercase tracking-wider font-bold shrink-0 flex items-center justify-center gap-1.5 transition-colors duration-300 ${statusColor}`}>
        {showSpinner && <Loader2 className="w-3 h-3 animate-spin" />}
        {statusText}
      </div>
    </div>
  );
}
