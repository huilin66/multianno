// src/components/annotation/AIToolPanel.tsx
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { 
  MousePointerClick, Sparkles, MessageSquare, PlusCircle, 
  MinusCircle, SquareDashed, Trash2, Check, X, Layers, Send, Loader2
} from 'lucide-react';
import { useStore } from '../../../store/useStore';

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
}

export function AIToolPanel({ 
  isOpen, onClose, views, selectedViewId, onViewChange, taxonomyClasses,
  aiPrompts, setAiPrompts, onConfirmPreview, isPredicting,
  sourceMode, setSourceMode, promptMode, setPromptMode, 
  onConfirmInit, onResetInit, isAIReady, isInitializing,
  onAutoPredict, autoResultMsg
}: any) {
  const { aiSettings, setAISettings } = useStore() as any;
  const [activeTab, setActiveTab] = useState<'auto' | 'semi' | 'vqa'>('auto');
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [autoText, setAutoText] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);

  if (!isOpen) return null;

  const getSelectedViewName = () => {
    const v = views.find((v:any) => v.id === selectedViewId);
    if (!v) return "Select a view";
    return v.isMain ? 'Main View' : `Aug View ${views.indexOf(v)}`;
  };

// 🌟 动态计算底部状态栏
  let statusText = '';
  let statusColor = '';
  let showSpinner = false;

  if (!aiSettings?.isConfigured) {
    statusText = 'AI Model Not Loaded';
    statusColor = 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400';
  } else if (isInitializing) {
    statusText = 'Image Data Loading...';
    statusColor = 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400';
    showSpinner = true;
  } else if (isPredicting) {
    statusText = 'AI Inferring...';
    statusColor = 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400';
    showSpinner = true;
  } else if (autoResultMsg) {
    // 🌟 新增判定：如果存在结果提示，显示高亮的青色状态
    statusText = autoResultMsg;
    statusColor = 'bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400 border-teal-200 dark:border-teal-800';
  } else if (!isAIReady) {
    statusText = 'Image Data Not Loaded';
    statusColor = 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400';
  } else {
    statusText = 'AI Engine Ready';
    statusColor = 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400';
  }

  if (!isOpen) return null;

return (
    <div className="w-52 h-full bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col z-20 shadow-xl animate-in slide-in-from-left-2">
      
      {/* 🌟 1. 顶部指示灯：改为单行显示 */}
      <div className={`p-2 border-b flex items-center justify-center text-[10px] font-bold shrink-0 ${
        aiSettings.isConfigured 
          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800' 
          : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800'
      }`}>
        <div className={`w-2 h-2 rounded-full mr-1.5 shrink-0 ${aiSettings.isConfigured ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="truncate" title={aiSettings.isConfigured ? `ACTIVE: ${aiSettings.modelPath.split(/[\\/]/).pop()}` : 'MODEL NOT LOADED'}>
          {aiSettings.isConfigured ? `ACTIVE: ${aiSettings.modelPath.split(/[\\/]/).pop()}` : 'MODEL NOT LOADED'}
        </span>
      </div>

      {/* 🌟 2. 顶部配置区：保持极致紧凑 */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/10 space-y-3 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">Target View</label>
            <Select value={selectedViewId} onValueChange={onViewChange}>
              <SelectTrigger className="h-8 text-[11px] font-bold px-2 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm focus:ring-1 focus:ring-blue-500">
                <SelectValue placeholder="Select view">
                  {views.find((v:any) => v.id === selectedViewId)?.isMain ? 'Main View' : `Aug View`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {views.map((v:any, i:number) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.isMain ? 'Main View' : `Aug View ${i}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-16 shrink-0"> 
            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-1 text-center">Size</label>
            <input 
              type="number" step={14} title="Inference Size"
              className="w-full h-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-[11px] font-mono text-center font-bold text-blue-600 dark:text-blue-400 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={aiSettings.inferenceSize || 644}
              onChange={(e) => setAISettings({ inferenceSize: parseInt(e.target.value) || 644 })}
            />
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">Image Source</label>
          <div className="flex bg-neutral-200/50 dark:bg-neutral-950/50 rounded p-0.5 border border-neutral-200 dark:border-neutral-800">
            <button className={`flex-1 py-1 text-[10px] rounded transition-all ${sourceMode === 'raw' ? 'bg-white dark:bg-neutral-800 shadow-sm font-bold text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`} onClick={() => setSourceMode('raw')}>Raw</button>
            <button className={`flex-1 py-1 text-[10px] rounded transition-all ${sourceMode === 'view' ? 'bg-white dark:bg-neutral-800 shadow-sm font-bold text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`} onClick={() => setSourceMode('view')}>Transformed</button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="default" className="flex-1 h-8 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 shadow-sm" onClick={onConfirmInit} disabled={isInitializing || isPredicting}>
            {isInitializing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            {isInitializing ? 'Loading' : 'Confirm'}
          </Button>
          <Button variant="outline" className="flex-1 h-8 text-[11px] font-bold bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" onClick={onResetInit} disabled={isInitializing || isPredicting}>
            Reset
          </Button>
        </div>
      </div>

      {/* 3. 中间：Tab 切换 */}
      <div className="flex p-1 gap-1 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        {(['auto', 'semi', 'vqa'] as const).map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'secondary' : 'ghost'} className="flex-1 h-7 px-0 text-[10px] gap-1" onClick={() => setActiveTab(tab)}>
            {tab === 'auto' && <Sparkles className="w-3 h-3" />}
            {tab === 'semi' && <MousePointerClick className="w-3 h-3" />}
            {tab === 'vqa' && <MessageSquare className="w-3 h-3" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>

      {/* 4. 内容区 */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col transition-opacity duration-300 ${!isAIReady ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
        
        {/* === AUTO TAB === */}
        {activeTab === 'auto' && (
          <div className="space-y-4">
            
            {/* 1. 快捷添加下拉框 */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Quick Add Class</label>
              <Select onValueChange={(val) => { if (!autoTags.includes(val)) setAutoTags([...autoTags, val]); }}>
                <SelectTrigger className="h-8 text-[11px] bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm focus:ring-1 focus:ring-blue-500">
                  <SelectValue placeholder="Select Class..." />
                </SelectTrigger>
                <SelectContent>
                  {taxonomyClasses.map((c: any) => (<SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {/* 🌟 2. 核心重构：输入与列表分离 */}
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Text Prompts</label>
              
              {/* 独立干净的输入框 */}
              <input 
                className="w-full h-8 px-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-[11px] shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" 
                placeholder="Type prompt and press Enter..." 
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
                  <span className="text-[9px] text-neutral-400 font-medium">No prompts added yet.</span>
                )}
              </div>
            </div>

            {/* 🌟 3. 操作区：去掉了 Batch 按钮，突出核心推断 */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 h-8 text-[11px] font-bold shadow-sm gap-2 transition-all" 
                onClick={() => {
                  if (autoText.trim()) {
                    const newTags = [...autoTags, autoText.trim()];
                    setAutoTags(newTags);
                    setAutoText('');
                    onAutoPredict(newTags);
                  } else {
                    onAutoPredict(autoTags);
                  }
                }}
                disabled={!isAIReady || isPredicting || (autoTags.length === 0 && autoText.trim() === '')}
              >
                {isPredicting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 
                {isPredicting ? 'Inferring...' : 'Infer Current'}
              </Button>
            </div>
          </div>
        )}


        {/* === SEMI TAB === */}
        {activeTab === 'semi' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-1.5">
              <Button variant={promptMode === 'positive' ? 'default' : 'outline'} className={`h-9 justify-start px-3 gap-2 ${promptMode === 'positive' ? 'bg-green-600 hover:bg-green-700' : ''}`} onClick={() => setPromptMode('positive')}>
                <PlusCircle className="w-4 h-4" /> <span className="text-xs">Positive Pt</span>
              </Button>
              <Button variant={promptMode === 'negative' ? 'default' : 'outline'} className={`h-9 justify-start px-3 gap-2 ${promptMode === 'negative' ? 'bg-red-600 hover:bg-red-700' : ''}`} onClick={() => setPromptMode('negative')}>
                <MinusCircle className="w-4 h-4" /> <span className="text-xs">Negative Pt</span>
              </Button>
              <Button variant={promptMode === 'box' ? 'default' : 'outline'} className={`h-9 justify-start px-3 gap-2 ${promptMode === 'box' ? 'bg-blue-600 hover:bg-blue-700' : ''}`} onClick={() => setPromptMode('box')}>
                <SquareDashed className="w-4 h-4" /> <span className="text-xs">Box Prompt</span>
              </Button>
            </div>

            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              <Button variant="outline" size="sm" className="w-full text-[10px] h-8" onClick={() => setAiPrompts([])}>
                <Trash2 className="w-3 h-3 mr-2" /> Reset Prompts
              </Button>
              <Button size="sm" className="w-full bg-blue-600 h-8 text-[10px]" onClick={onConfirmPreview} disabled={isPredicting || aiPrompts.length === 0}>
                {isPredicting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Check className="w-3 h-3 mr-2" />} Confirm Add
              </Button>
            </div>
          </div>
        )}

        {/* === VQA TAB === */}
        {activeTab === 'vqa' && (
          <div className="h-full flex flex-col space-y-3">
             {/* ... VQA 代码保持不变 ... */}
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