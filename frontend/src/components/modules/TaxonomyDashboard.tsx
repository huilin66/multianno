// src/components/modules/TaxonomyDashboard.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { 
  Tags, Settings, Trash2, Edit3, GitMerge,
  Plus, Check, X, Loader2, ArrowRight, Upload, Database, Activity,
  List, LayoutDashboard, Clock, RefreshCw, ChevronDown, ChevronRight, MapPin
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { batchMergeClass, batchDeleteClass, fetchProjectStatistics } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { TAXONOMY_COLORS } from '../../config/colors';

interface TaxonomyDashboardProps {
  onClose?: () => void;
}

export function TaxonomyDashboard({ onClose }: TaxonomyDashboardProps = {}) {
  const { t } = useTranslation();
  const { 
    taxonomyClasses, addTaxonomyClass, updateTaxonomyClass, deleteTaxonomyClass, mergeTaxonomyClasses,
    taxonomyAttributes = [], addTaxonomyAttribute, updateTaxonomyAttribute, deleteTaxonomyAttribute,
    folders
  } = useStore() as any;

  // 🌟 1. 状态管理
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'attributes'>('overview');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null);
  
  // 左侧折叠面板状态
  const [expanded, setExpanded] = useState({ classes: true, attributes: true });

  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [statsData, setStatsData] = useState<any>(null); 

  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [renameValue, setRenameValue] = useState('');

  const activeClass = taxonomyClasses.find((c: any) => c.id === selectedClassId);
  const activeAttribute = taxonomyAttributes.find((a: any) => a.id === selectedAttributeId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化加载缓存
  useEffect(() => {
    if (folders.length > 0) loadStatistics(false);
  }, []);

  // 切换选中类时重置编辑框状态
  useEffect(() => {
    if (activeClass) {
      setRenameValue(activeClass.name);
      setMergeTargetId('');
    }
  }, [activeClass]);

  const loadStatistics = async (forceRefresh: boolean) => {
    if (folders.length === 0) return;
    setStatsStatus('loading');
    try {
      const saveDirs = folders.map((f: any) => f.path);
      const data = await fetchProjectStatistics(saveDirs, forceRefresh);
      setStatsData(data);
      setStatsStatus('done');
    } catch (error: any) {
      console.error(error);
      setStatsStatus('idle');
    }
  };

  // 🌟 修复后的 Add 逻辑
  const handleAdd = (type: 'classes' | 'attributes') => {
    if (type === 'classes') {
      const newId = `class-${Date.now()}`;
      addTaxonomyClass({ id: newId, name: `new_class_${taxonomyClasses.length + 1}`, color: TAXONOMY_COLORS[taxonomyClasses.length % TAXONOMY_COLORS.length] });
      setActiveTab('classes');
      setSelectedClassId(newId);
    } else {
      const newId = `attr-${Date.now()}`;
      addTaxonomyAttribute({ 
        id: newId, name: `new_attribute_${taxonomyAttributes.length + 1}`, type: 'select', 
        options: ['default_val_1'], defaultValue: 'default_val_1', applyToAll: true 
      });
      setActiveTab('attributes');
      setSelectedAttributeId(newId);
    }
  };

  // --- 解析和导入文件保留原有逻辑 ---
  const parseAttributeYaml = (text: string) => {
    const lines = text.split(/\r?\n/);
    const result: Record<string, string[]> = {};
    let currentKey = '';
    lines.forEach(line => {
      if (line.trim().startsWith('#') || !line.trim() || line.startsWith('attributes:')) return;
      const keyMatch = line.match(/^  ([a-zA-Z0-9_-]+):/);
      if (keyMatch) { currentKey = keyMatch[1]; result[currentKey] = []; } 
      else if (currentKey) {
        const valMatch = line.match(/^    - (.*)/);
        if (valMatch) result[currentKey].push(valMatch[1].trim());
      }
    });
    return result;
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isYaml = file.name.endsWith('.yaml') || file.name.endsWith('.yml');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      let addedCount = 0;
      if (activeTab === 'attributes' && isYaml) {
        const parsedData = parseAttributeYaml(text);
        Object.entries(parsedData).forEach(([attrName, options]) => {
          if (!taxonomyAttributes.some((a: any) => a.name === attrName)) {
            addTaxonomyAttribute({ id: `attr-${Date.now()}-${addedCount}`, name: attrName, type: 'select', options, defaultValue: options[0] || '', applyToAll: true });
            addedCount++;
          }
        });
      } else if (activeTab === 'classes') {
        text.split(/\r?\n/).map(l => l.trim()).filter(l => l).forEach((line) => {
          if (!taxonomyClasses.some((c: any) => c.name === line)) {
            addTaxonomyClass({ id: `class-${Date.now()}-${addedCount}`, name: line, color: TAXONOMY_COLORS[(taxonomyClasses.length + addedCount) % TAXONOMY_COLORS.length] });
            addedCount++;
          }
        });
      } else {
        alert("Please upload a .yaml file for Attributes or .txt for Classes."); return;
      }
      alert(`Imported ${addedCount} items!`);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    };
    reader.readAsText(file);
  };

  const handleMergeClass = async () => {
    if (!activeClass || !mergeTargetId) return;
    const target = taxonomyClasses.find((c: any) => c.id === mergeTargetId);
    if (!target) return;
    setIsProcessing(true);
    try {
      await batchMergeClass({ save_dirs: folders.map((f: any) => f.path), old_names: [activeClass.name], new_name: target.name });
      mergeTaxonomyClasses([activeClass.name], target.name);
      setMergeTargetId(''); setSelectedClassId(null);
    } catch (e: any) { alert(`Merge failed: ${e.message}`); } finally { setIsProcessing(false); }
  };

  const handleDeleteClass = async () => {
    if (!activeClass) return;
    const isHardDelete = window.confirm(`DELETE CLASS: '${activeClass.name}'\n\n[OK] Hard Delete (Destroy boxes)\n[Cancel] Soft Delete (Mark 'Uncategorized')`);
    if (!window.confirm(`Are you sure?`)) return;
    setIsProcessing(true);
    try {
      await batchDeleteClass({ save_dirs: folders.map((f: any) => f.path), class_name: activeClass.name, hard_delete: isHardDelete });
      deleteTaxonomyClass(activeClass.id, isHardDelete);
      setSelectedClassId(null);
    } catch (e: any) { alert(`Delete failed: ${e.message}`); } finally { setIsProcessing(false); }
  };

  // 可复用的热力图组件
  const HeatmapComponent = ({ data, title }: { data: number[], title: string }) => (
    <div className="flex flex-col items-center">
      <h5 className="text-[10px] font-bold text-neutral-500 mb-2 uppercase">{title}</h5>
      <div className="w-32 h-32 border border-neutral-200 dark:border-neutral-700 rounded p-0.5 grid grid-cols-10 gap-0.5 bg-neutral-50 dark:bg-neutral-900 shadow-inner">
        {data?.map((val: number, idx: number) => (
          <div key={idx} style={{ opacity: val === 0 ? 0.05 : Math.min(1, 0.2 + val / 5) }} className="bg-orange-500 rounded-sm" title={`Count: ${val}`} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden relative">
      <input type="file" accept=".txt,.yaml,.yml" ref={fileInputRef} className="hidden" onChange={handleImportFile} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* ================= 1. 左侧可折叠导航树 ================= */}
        <div className="w-64 border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-white dark:bg-neutral-900 shrink-0">
          
          <div className="p-3 border-b border-neutral-100 dark:border-neutral-800">
            <Button variant={activeTab === 'overview' ? 'secondary' : 'ghost'} 
                    onClick={() => { setActiveTab('overview'); setSelectedClassId(null); setSelectedAttributeId(null); }} 
                    className="w-full justify-start h-9 font-bold shadow-sm">
              <LayoutDashboard className="w-4 h-4 mr-2 text-blue-600"/> Global Overview
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
            
            {/* --- Classes 折叠组 --- */}
            <div>
              <div className="flex items-center justify-between cursor-pointer p-1 group" onClick={() => setExpanded(p => ({...p, classes: !p.classes}))}>
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center group-hover:text-neutral-900 dark:group-hover:text-white transition-colors"><Tags className="w-3.5 h-3.5 mr-1.5"/> Classes ({taxonomyClasses.length})</span>
                {expanded.classes ? <ChevronDown className="w-3.5 h-3.5 text-neutral-400"/> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400"/>}
              </div>
              {expanded.classes && (
                <div className="mt-1 ml-2 border-l-2 border-neutral-100 dark:border-neutral-800 pl-2 space-y-1">
                  {taxonomyClasses.map((cls: any) => (
                    <div key={cls.id} onClick={() => { setActiveTab('classes'); setSelectedClassId(cls.id); }} 
                         className={`flex items-center p-1.5 rounded-md text-xs cursor-pointer transition-colors ${selectedClassId === cls.id && activeTab === 'classes' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'}`}>
                      <div className="w-2.5 h-2.5 rounded-full mr-2 shrink-0 shadow-sm" style={{ backgroundColor: cls.color }} />
                      <span className="truncate flex-1">{cls.name}</span>
                    </div>
                  ))}
                  <div className="flex gap-1 mt-2">
                    <Button variant="secondary" className="h-6 text-[10px] flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300" onClick={() => handleAdd('classes')}><Plus className="w-3 h-3 mr-1"/> Add</Button>
                    <Button variant="secondary" className="h-6 text-[10px] flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300" onClick={() => { setActiveTab('classes'); fileInputRef.current?.click(); }}><Upload className="w-3 h-3 mr-1"/> Import</Button>
                  </div>
                </div>
              )}
            </div>

            {/* --- Attributes 折叠组 --- */}
            <div>
              <div className="flex items-center justify-between cursor-pointer p-1 group" onClick={() => setExpanded(p => ({...p, attributes: !p.attributes}))}>
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center group-hover:text-neutral-900 dark:group-hover:text-white transition-colors"><Settings className="w-3.5 h-3.5 mr-1.5"/> Attributes ({taxonomyAttributes.length})</span>
                {expanded.attributes ? <ChevronDown className="w-3.5 h-3.5 text-neutral-400"/> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400"/>}
              </div>
              {expanded.attributes && (
                <div className="mt-1 ml-2 border-l-2 border-neutral-100 dark:border-neutral-800 pl-2 space-y-1">
                  {taxonomyAttributes.map((attr: any) => (
                    <div key={attr.id} onClick={() => { setActiveTab('attributes'); setSelectedAttributeId(attr.id); }} 
                         className={`flex items-center p-1.5 rounded-md text-xs cursor-pointer transition-colors ${selectedAttributeId === attr.id && activeTab === 'attributes' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'}`}>
                      <List className="w-3 h-3 mr-2 shrink-0 text-neutral-400" />
                      <span className="truncate flex-1">{attr.name}</span>
                    </div>
                  ))}
                  <div className="flex gap-1 mt-2">
                    <Button variant="secondary" className="h-6 text-[10px] flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300" onClick={() => handleAdd('attributes')}><Plus className="w-3 h-3 mr-1"/> Add</Button>
                    <Button variant="secondary" className="h-6 text-[10px] flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300" onClick={() => { setActiveTab('attributes'); fileInputRef.current?.click(); }}><Upload className="w-3 h-3 mr-1"/> Import</Button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ================= 2. 右侧主体区 ================= */}
        
        {/* 🌟 模式 A：Overview 纯粹大盘展示 */}
        {activeTab === 'overview' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center z-10 shrink-0">
              <div>
                <h2 className="text-xl font-black">Global Project Dashboard</h2>
                <p className="text-xs text-neutral-500 mt-1">High-level statistics across all JSON annotation files in the project.</p>
              </div>
              <Button onClick={() => loadStatistics(true)} disabled={statsStatus === 'loading'} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                {statsStatus === 'loading' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh All Stats
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
              {statsStatus === 'idle' && !statsData && (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                  <Activity className="w-12 h-12 mb-4 opacity-20" />
                  <p>Click "Refresh All Stats" to generate the global report.</p>
                </div>
              )}

              {statsData?.global && (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Total Annotations</h4>
                      <div className="text-4xl font-black text-blue-600">{statsData.global.total_objects}</div>
                      <p className="text-xs text-neutral-500 mt-2">in {statsData.global.total_images} images</p>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Shape Types</h4>
                      <div className="space-y-1.5 mt-3">
                        {Object.entries(statsData.global.shape_types).map(([t, c]: any) => (
                          <div key={t} className="flex justify-between text-xs font-mono border-b border-neutral-50 pb-1">
                            <span className="capitalize text-neutral-500">{t}</span><span className="font-bold">{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Boxes Per Image</h4>
                      <div className="h-16 flex items-end gap-[1px]">
                        {Object.entries(statsData.global.box_number_distribution || {}).map(([bin, count]: any) => (
                          <div key={bin} className="flex-1 bg-purple-500/50 hover:bg-purple-600 rounded-t-sm" style={{ height: `${Math.max(5, (count / statsData.global.total_images) * 100)}%` }} title={`${bin} boxes: ${count} images`} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Distributions */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4">Area % Distribution</h4>
                      <div className="h-32 flex items-end gap-0.5 border-b border-l border-neutral-200 dark:border-neutral-800 px-2 pb-2">
                        {Object.entries(statsData.global.area_distribution).map(([bin, count]: any) => (
                          <div key={bin} className="flex-1 bg-blue-500/40 hover:bg-blue-600 transition-all rounded-t-sm group relative" style={{ height: `${Math.max(1, (count / statsData.global.total_objects) * 100)}%` }}>
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 z-10 pointer-events-none whitespace-nowrap">{bin}: {count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4">Shape Rate (W/H) Distribution</h4>
                      <div className="h-32 flex items-end gap-0.5 border-b border-l border-neutral-200 dark:border-neutral-800 px-2 pb-2">
                        {Object.entries(statsData.global.shape_rate_distribution).map(([bin, count]: any) => (
                          <div key={bin} className="flex-1 bg-teal-500/40 hover:bg-teal-600 transition-all rounded-t-sm group relative" style={{ height: `${Math.max(1, (count / statsData.global.total_objects) * 100)}%` }}>
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 z-10 pointer-events-none whitespace-nowrap">{bin}: {count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Heatmaps */}
                  <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                    <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4 flex items-center gap-2"><MapPin className="w-3.5 h-3.5"/> Global Position Density</h4>
                    <div className="flex justify-around items-center pt-2">
                      <HeatmapComponent title="Top-Left (Start)" data={statsData.global.heatmap_start?.flat()} />
                      <HeatmapComponent title="Center" data={statsData.global.heatmap_center?.flat()} />
                      <HeatmapComponent title="Bottom-Right (End)" data={statsData.global.heatmap_end?.flat()} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 🌟 模式 B：Classes 编辑器与局部图表 */}
        {activeTab === 'classes' && activeClass && (
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
            
            {/* 顶栏：干净内联的编辑工具栏 */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                {/* 原生颜色选择器，隐藏默认样式，伪装成色块 */}
                <div className="relative w-8 h-8 rounded-md shadow-sm border border-neutral-200 overflow-hidden shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                  <input 
                    type="color" 
                    value={activeClass.color} 
                    onChange={e => updateTaxonomyClass(activeClass.id, { color: e.target.value })} 
                    className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                  />
                </div>
                
                {/* 内联重命名输入框 */}
                <Input 
                  value={renameValue} 
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => { if (renameValue.trim() && renameValue !== activeClass.name) updateTaxonomyClass(activeClass.id, { name: renameValue.trim() }); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="text-xl font-black border-transparent hover:border-neutral-200 focus:border-blue-500 bg-transparent px-2 h-10 w-64 shadow-none"
                  placeholder="Class Name"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-neutral-50 dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                    <SelectTrigger className="h-7 w-32 text-xs border-none bg-transparent focus:ring-0 shadow-none">
                      <SelectValue placeholder="Merge into..." />
                    </SelectTrigger>
                    <SelectContent>
                      {taxonomyClasses.filter((c: any) => c.id !== activeClass.id).map((c: any) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7 px-3 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded" disabled={!mergeTargetId || isProcessing} onClick={handleMergeClass}>
                    <GitMerge className="w-3.5 h-3.5 mr-1" /> Merge
                  </Button>
                </div>
                
                <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800" />
                <Button variant="destructive" size="sm" className="h-9 px-4 font-bold shadow-sm" onClick={handleDeleteClass} disabled={isProcessing}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </div>
            </div>

            {/* 主体：该类别的专属统计 */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {statsData?.classes?.[activeClass.name] ? (
                <div className="space-y-6 animate-in fade-in">
                  <div className="grid grid-cols-3 gap-6">
                    {/* 左侧信息列 */}
                    <div className="col-span-1 space-y-4">
                      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border shadow-sm">
                        <h4 className="text-[10px] font-black uppercase text-neutral-400 mb-1">Class Objects</h4>
                        <div className="text-3xl font-black text-neutral-800 dark:text-neutral-100">{statsData.classes[activeClass.name].total}</div>
                      </div>
                      
                      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border shadow-sm flex flex-col max-h-[300px]">
                        <h4 className="text-[10px] font-black uppercase text-neutral-400 mb-3 border-b pb-2">Scenes Involved ({statsData.classes[activeClass.name].stems.length})</h4>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                          {statsData.classes[activeClass.name].stems.map((stem: string) => (
                            <div key={stem} className="text-[10px] font-mono p-1.5 hover:bg-blue-50 text-neutral-600 hover:text-blue-600 rounded cursor-pointer truncate border border-transparent hover:border-blue-100">
                              {stem}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 右侧图表列 */}
                    <div className="col-span-2 space-y-4">
                       <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm">
                        <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4">Class Shape Types</h4>
                        <div className="flex gap-6">
                          {Object.entries(statsData.classes[activeClass.name].shape_types).map(([type, count]: any) => (
                            <div key={type} className="flex-1 p-3 rounded-lg border border-neutral-100 bg-neutral-50/50 text-center">
                              <div className="text-2xl font-black">{count}</div>
                              <div className="text-[9px] text-neutral-400 uppercase tracking-widest mt-1">{type}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border shadow-sm flex items-center justify-between">
                         <div className="flex-1">
                           <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Center Heatmap</h4>
                           <p className="text-[10px] text-neutral-500 max-w-xs">Shows the density of '{activeClass.name}' objects across all images based on normalized relative coordinates.</p>
                         </div>
                         <HeatmapComponent title="" data={statsData.classes[activeClass.name].heatmap_center?.flat()} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                  <Activity className="w-12 h-12 mb-4 opacity-20" />
                  <p>No specific statistics found for '{activeClass.name}'.</p>
                  <p className="text-xs mt-2">Try adding some boxes or click "Refresh All Stats" in Overview.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🌟 模式 C：Attributes 编辑器 */}
        {activeTab === 'attributes' && activeAttribute && (
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-3">
                <Settings className="w-6 h-6 text-primary" />
                <Input 
                  value={activeAttribute.name}
                  onChange={e => updateTaxonomyAttribute(activeAttribute.id, { name: e.target.value })}
                  className="text-xl font-black border-transparent hover:border-neutral-200 focus:border-blue-500 bg-transparent px-2 h-10 w-64 shadow-none"
                />
              </div>
              <Button variant="destructive" size="sm" className="h-9 px-4 font-bold shadow-sm" onClick={() => deleteTaxonomyAttribute(activeAttribute.id)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Attribute
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="max-w-2xl bg-white dark:bg-neutral-900 border rounded-xl shadow-sm p-6">
                <h3 className="font-bold text-neutral-700 dark:text-neutral-300 mb-4 flex items-center justify-between">
                  Dropdown Options ({activeAttribute.options?.length || 0})
                  <Button size="sm" variant="outline" className="h-8 text-xs font-bold" onClick={() => {
                      const newOptions = [...(activeAttribute.options || []), `new_option_${(activeAttribute.options?.length||0)+1}`];
                      updateTaxonomyAttribute(activeAttribute.id, { options: newOptions, defaultValue: newOptions[0] });
                    }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Option
                  </Button>
                </h3>

                <div className="space-y-2">
                  {activeAttribute.options?.map((opt: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 group p-1 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                      <div className="flex-1 relative">
                        <Input value={opt} onChange={e => {
                            const newOptions = [...activeAttribute.options];
                            newOptions[idx] = e.target.value;
                            updateTaxonomyAttribute(activeAttribute.id, { options: newOptions });
                          }}
                          className={`pl-8 h-9 text-sm ${activeAttribute.defaultValue === opt ? 'border-primary ring-1 ring-primary shadow-sm' : ''}`}
                        />
                        {activeAttribute.defaultValue === opt && <Check className="w-4 h-4 text-primary absolute left-2.5 top-2.5" />}
                      </div>
                      <Button variant="ghost" size="sm" className={`h-9 px-3 font-bold ${activeAttribute.defaultValue === opt ? 'text-primary bg-blue-50' : 'text-neutral-400'}`}
                        onClick={() => updateTaxonomyAttribute(activeAttribute.id, { defaultValue: opt })}>
                        Set Default
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity h-9 w-9"
                        onClick={() => {
                          const newOptions = activeAttribute.options.filter((_:any, i:number) => i !== idx);
                          updateTaxonomyAttribute(activeAttribute.id, { options: newOptions, defaultValue: newOptions[0] || '' });
                        }}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {(!activeAttribute.options || activeAttribute.options.length === 0) && (
                    <div className="text-center py-10 text-neutral-400 border-2 border-dashed border-neutral-200 rounded-xl">
                      No options defined. Click "Add Option" above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ================= 3. 底部持久状态栏 ================= */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center shrink-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <span className="text-xs text-neutral-500 flex items-center gap-2 font-mono bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700">
          <Database className="w-3.5 h-3.5 text-blue-500"/> 
          Project Analytics
          <span className="text-neutral-300 dark:text-neutral-600 mx-1">|</span>
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          {statsData?.last_updated ? `Cached: ${statsData.last_updated}` : 'No local cache found'}
        </span>
        <Button onClick={(e) => { e.preventDefault(); if (onClose) onClose(); }} className="px-8 font-bold shadow-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black">
          {t('common.confirm', 'Confirm & Close')}
        </Button>
      </div>
    </div>
  );
}