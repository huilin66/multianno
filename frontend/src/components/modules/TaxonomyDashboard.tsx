// src/components/modules/TaxonomyDashboard.tsx
import React, { useState } from 'react';
import { useStore, TaxonomyClass } from '../../store/useStore';
import { 
  Tags, Settings, Trash2, Edit3, GitMerge, AlertTriangle, 
  Plus, Check, X, Loader2, Search, ArrowRight, Upload, Database, Activity,
  List
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { batchMergeClass, batchDeleteClass, fetchProjectStatisticsStream } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { TAXONOMY_COLORS } from '../../config/colors';

interface TaxonomyDashboardProps {
  onClose?: () => void;
}

export function TaxonomyDashboard({ onClose }: TaxonomyDashboardProps = {}) {
  const { t } = useTranslation();
  const { 
    taxonomyClasses, addTaxonomyClass, updateTaxonomyClass, deleteTaxonomyClass, mergeTaxonomyClasses,
    taxonomyAttributes = [], addTaxonomyAttribute, updateTaxonomyAttribute, deleteTaxonomyAttribute, // 🌟 补全属性的增删改
    folders, annotations
  } = useStore() as any; // 使用 as any 兼容可能尚未在 Store 中补全的方法

  const [activeTab, setActiveTab] = useState<'classes' | 'attributes'>('classes');
  
  // 🌟 独立管理左侧选中项
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [colorValue, setColorValue] = useState('');

  // 全局统计数据状态
  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [statsProgress, setStatsProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });
  const [statsData, setStatsData] = useState<any>(null); 
  const [shapeFilter, setShapeFilter] = useState<string | null>(null); 

  const activeClass = taxonomyClasses.find((c: any) => c.id === selectedClassId);
  const activeAttribute = taxonomyAttributes.find((a: any) => a.id === selectedAttributeId);

  React.useEffect(() => {
    if (activeClass) {
      setRenameValue(activeClass.name);
      setColorValue(activeClass.color);
      setRenameDialogOpen(false);
      setColorDialogOpen(false);
      setStatsStatus('idle');
      setStatsData(null);
      setShapeFilter(null);
    }
  }, [activeClass]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // 🌟 手动添加功能 (自动生成结构化的 Attribute)
  const handlePlaceholderAdd = () => {
    if (activeTab === 'classes') {
      const newId = `class-${Date.now()}`;
      addTaxonomyClass({ id: newId, name: `new_class_${taxonomyClasses.length + 1}`, color: TAXONOMY_COLORS[taxonomyClasses.length % TAXONOMY_COLORS.length] });
      setSelectedClassId(newId);
    } else {
      const newId = `attr-${Date.now()}`;
      // 🌟 核心：属性现在默认具有 options 数组和 defaultValue
      addTaxonomyAttribute({ 
        id: newId, 
        name: `new_attribute_${taxonomyAttributes.length + 1}`, 
        type: 'select', 
        options: ['default_val_1', 'default_val_2'],
        defaultValue: 'default_val_1',
        applyToAll: true 
      });
      setSelectedAttributeId(newId);
    }
  };

  // 🌟 轻量级 YAML 解析器 (专门解析你提供的二级结构)
  const parseAttributeYaml = (text: string) => {
    const lines = text.split(/\r?\n/);
    const result: Record<string, string[]> = {};
    let currentKey = '';
    
    lines.forEach(line => {
      if (line.trim().startsWith('#') || !line.trim()) return;
      if (line.startsWith('attributes:')) return;
      
      const keyMatch = line.match(/^  ([a-zA-Z0-9_-]+):/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        result[currentKey] = [];
      } else if (currentKey) {
        const valMatch = line.match(/^    - (.*)/);
        if (valMatch) {
          result[currentKey].push(valMatch[1].trim());
        }
      }
    });
    return result;
  };

  // 🌟 通用文件导入逻辑 (支持 TXT 和 YAML)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isYaml = file.name.endsWith('.yaml') || file.name.endsWith('.yml');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      let addedCount = 0;

      if (activeTab === 'attributes' && isYaml) {
        // 🌟 解析 YAML 为 Attribute
        const parsedData = parseAttributeYaml(text);
        Object.entries(parsedData).forEach(([attrName, options]) => {
          if (!taxonomyAttributes.some((a: any) => a.name === attrName)) {
            addTaxonomyAttribute({
              id: `attr-${Math.random().toString(36).substr(2,9)}`,
              name: attrName,
              type: 'select',
              options: options,
              defaultValue: options.length > 0 ? options[0] : '', // 默认值为第一个选项
              applyToAll: true
            });
            addedCount++;
          }
        });
      } else if (activeTab === 'classes') {
        // 解析 TXT 为 Class
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
        lines.forEach((line) => {
          if (!taxonomyClasses.some((c: any) => c.name === line)) {
            addTaxonomyClass({ 
              id: `class-${Math.random().toString(36).substr(2,9)}`, 
              name: line, 
              color: TAXONOMY_COLORS[(taxonomyClasses.length + addedCount) % TAXONOMY_COLORS.length] 
            });
            addedCount++;
          }
        });
      } else {
        alert("Please upload a .yaml file for Attributes or .txt for Classes.");
        return;
      }

      alert(`Successfully imported ${addedCount} items!`);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    };
    reader.readAsText(file);
  };

  const handleMergeClass = async () => { /* 保留原有逻辑 */ };
  const handleDeleteClass = async () => { /* 保留原有逻辑 */ };
  const fetchGlobalStatistics = () => { /* 保留原有逻辑 */ };

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden relative">
      {/* 🌟 修改文件类型限制 */}
      <input type="file" accept=".txt,.yaml,.yml" ref={fileInputRef} className="hidden" onChange={handleImportFile} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* ================= 左侧侧边栏 ================= */}
        <div className="w-80 border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-white dark:bg-neutral-900 shrink-0">
          <div className="flex p-2 gap-1 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
            <Button variant={activeTab === 'classes' ? 'default' : 'ghost'} size="sm" className="flex-1 h-8" onClick={() => setActiveTab('classes')}>
              <Tags className="w-4 h-4 mr-2"/> Classes
            </Button>
            <Button variant={activeTab === 'attributes' ? 'default' : 'ghost'} size="sm" className="flex-1 h-8" onClick={() => setActiveTab('attributes')}>
              <Settings className="w-4 h-4 mr-2"/> Attributes
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {/* Classes 列表 */}
            {activeTab === 'classes' && taxonomyClasses.map((cls: any) => (
              <div 
                key={cls.id} onClick={() => setSelectedClassId(cls.id)}
                className={`flex items-center p-2 rounded-md cursor-pointer transition-colors border ${selectedClassId === cls.id ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-900/20 dark:border-white/20 mr-3 shrink-0" style={{ backgroundColor: cls.color }} />
                <span className="font-medium text-sm flex-1 truncate">{cls.name}</span>
                <ArrowRight className={`w-4 h-4 text-primary transition-opacity ${selectedClassId === cls.id ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            ))}

            {/* Attributes 列表 */}
            {activeTab === 'attributes' && taxonomyAttributes.map((attr: any) => (
              <div 
                key={attr.id} onClick={() => setSelectedAttributeId(attr.id)}
                className={`flex items-center p-2 rounded-md cursor-pointer transition-colors border ${selectedAttributeId === attr.id ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
              >
                <List className="w-4 h-4 text-neutral-500 mr-3 shrink-0" />
                <div className="flex flex-col flex-1 truncate">
                  <span className="font-medium text-sm truncate">{attr.name}</span>
                  <span className="text-[10px] text-neutral-400 truncate">{attr.options?.length || 0} options</span>
                </div>
                <ArrowRight className={`w-4 h-4 text-primary transition-opacity ${selectedAttributeId === attr.id ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            ))}

            <div className="flex gap-2 mt-2">
              <Button variant="ghost" className="flex-1 border border-dashed border-neutral-300 dark:border-neutral-700" onClick={handlePlaceholderAdd}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
              <Button variant="ghost" className="flex-1 border border-dashed border-neutral-300 dark:border-neutral-700" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Import {activeTab === 'attributes' && '(YAML)'}
              </Button>
            </div>
          </div>
        </div>

        {/* ================= 右侧详情区 ================= */}
        
        {/* 模式 A：渲染 Class 的详情 (保留原有代码) */}
        {activeTab === 'classes' && activeClass && (
          <div className="flex-1 flex flex-col overflow-hidden">
             {/* ... 这里是你原来的 right panel classes 的代码，保持不动即可 ... */}
             {/* 为节省对话空间，此处省略，你直接保留你原文件的 <div className="p-3 border-b ..."> 和 下方的统计区域即可 */}
             <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center flex-wrap gap-3 shrink-0 relative z-10">
                <h1 className="text-lg font-bold truncate max-w-[200px]" title={activeClass.name}>{activeClass.name}</h1>
                <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => { setRenameDialogOpen(true); setColorDialogOpen(false); }}>
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> {t('common.rename', 'Rename')}
                </Button>
                {/* 颜色修改器、合并器、删除器等... */}
             </div>
             {/* 统计区... */}
          </div>
        )}

        {/* 🌟 模式 B：渲染 Attribute 的选项管理器 */}
        {activeTab === 'attributes' && activeAttribute && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-neutral-950">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-900">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-primary" />
                <Input 
                  value={activeAttribute.name}
                  onChange={(e) => updateTaxonomyAttribute && updateTaxonomyAttribute(activeAttribute.id, { name: e.target.value })}
                  className="font-bold text-lg h-9 bg-transparent border-transparent hover:border-neutral-300 focus:border-primary px-2"
                />
              </div>
              <Button variant="destructive" size="sm" onClick={() => deleteTaxonomyAttribute && deleteTaxonomyAttribute(activeAttribute.id)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Attribute
              </Button>
            </div>

            <div className="p-6 overflow-y-auto max-w-2xl">
              <h3 className="font-bold text-neutral-700 dark:text-neutral-300 mb-4 flex items-center justify-between">
                Dropdown Options ({activeAttribute.options?.length || 0})
                <Button 
                  size="sm" variant="outline"
                  onClick={() => {
                    const newOptions = [...(activeAttribute.options || []), `new_option_${(activeAttribute.options?.length||0)+1}`];
                    updateTaxonomyAttribute(activeAttribute.id, { options: newOptions, defaultValue: newOptions[0] });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Option
                </Button>
              </h3>

              <div className="space-y-2">
                {activeAttribute.options?.map((opt: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <div className="flex-1 relative">
                      <Input 
                        value={opt}
                        onChange={(e) => {
                          const newOptions = [...activeAttribute.options];
                          newOptions[idx] = e.target.value;
                          updateTaxonomyAttribute(activeAttribute.id, { options: newOptions });
                        }}
                        className={`pl-8 ${activeAttribute.defaultValue === opt ? 'border-primary ring-1 ring-primary' : ''}`}
                      />
                      {activeAttribute.defaultValue === opt && (
                        <Check className="w-4 h-4 text-primary absolute left-2.5 top-2.5" />
                      )}
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      className={`text-xs ${activeAttribute.defaultValue === opt ? 'text-primary' : 'text-neutral-400'}`}
                      onClick={() => updateTaxonomyAttribute(activeAttribute.id, { defaultValue: opt })}
                    >
                      Set Default
                    </Button>

                    <Button 
                      variant="ghost" size="icon" className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        const newOptions = activeAttribute.options.filter((_:any, i:number) => i !== idx);
                        updateTaxonomyAttribute(activeAttribute.id, { options: newOptions, defaultValue: newOptions[0] || '' });
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {(!activeAttribute.options || activeAttribute.options.length === 0) && (
                  <div className="text-center py-8 text-neutral-400 border border-dashed rounded-lg">
                    No options defined. Add options or re-import YAML.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 未选中任何项目时的提示 */}
        {(!activeClass && activeTab === 'classes') || (!activeAttribute && activeTab === 'attributes') ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-600 bg-neutral-50 dark:bg-neutral-950">
            {activeTab === 'classes' ? <Tags className="w-16 h-16 mb-4 opacity-20" /> : <List className="w-16 h-16 mb-4 opacity-20" />}
            <h3 className="text-lg font-medium">Select an item to manage</h3>
          </div>
        ) : null}

      </div>

      {/* 底部 Footer */}
      <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center shrink-0 transition-colors">
        <span className="text-xs text-neutral-500 flex items-center gap-1">
          <Database className="w-3 h-3"/> Live Taxonomy State
        </span>
        <Button onClick={(e) => { e.preventDefault(); if (onClose) onClose(); }} variant="default">
          {t('common.confirm', 'Confirm')}
        </Button>
      </div>
    </div>
  );
}