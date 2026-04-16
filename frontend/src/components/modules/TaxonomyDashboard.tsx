// src/components/modules/TaxonomyDashboard.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { 
  Tags, Settings, Trash2, Edit3, GitMerge,
  Plus, Check, X, Loader2, ArrowRight, Upload, Database, Activity,
  List, LayoutDashboard, Clock, RefreshCw, ChevronDown, ChevronRight, Layers
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

// ============================================================================
// 🌟 高级图表组件库 (纯 CSS 无依赖实现)
// ============================================================================

// 1. 带 XY 坐标轴的直方图
// 1. 带 XY 坐标轴的直方图 (修复超宽数据遮挡，支持横向滚动)
const AxisBarChart = ({ data, title, xLabel, yLabel, colorClass }: any) => {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return <div className="h-full flex items-center justify-center text-neutral-400">No data</div>;
  const maxVal = Math.max(...entries.map(e => e[1] as number), 1);
  
  return (
    <div className="flex flex-col h-64 w-full">
      <h5 className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider mb-4 shrink-0">{title}</h5>
      
      <div className="flex-1 flex min-h-0">
        {/* Y 轴 (固定在左侧不随之滚动) */}
        <div className="w-10 shrink-0 border-r-2 border-neutral-200 dark:border-neutral-700 flex flex-col justify-between items-end pr-2 text-[9px] text-neutral-500 pb-6 relative z-10 bg-white dark:bg-neutral-900">
          <span className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-bold tracking-widest whitespace-nowrap">{yLabel}</span>
          <span>{maxVal}</span>
          <span>{Math.round(maxVal / 2)}</span>
          <span>0</span>
        </div>
        
        {/* 柱状图展示区 (超过宽度时出现横向滚动条) */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
           
           {/* 🌟 核心修复区：允许横向滚动 */}
           <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar pb-1">
             <div className="h-full flex flex-col min-w-max px-2">
               
               {/* 柱子区域 */}
               <div className="flex-1 flex items-end gap-1 border-b-2 border-neutral-200 dark:border-neutral-700">
                 {entries.map(([k, v]: any) => (
                    // 🌟 核心修复：增加 min-w-[28px] 保证每根柱子和下方的字不被压扁
                    <div key={k} className="flex-1 flex flex-col items-center justify-end group h-full relative min-w-[28px]">
                       <span className="text-[9px] font-mono text-neutral-600 dark:text-neutral-300 mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4">{v}</span>
                       <div className={`w-full ${colorClass} rounded-t-sm transition-all hover:brightness-110`} style={{ height: `${(v / maxVal) * 100}%` }} />
                    </div>
                 ))}
               </div>
               
               {/* X 轴刻度标签 */}
               <div className="flex pt-2">
                 {entries.map(([k]: any) => (
                    <div key={k} className="flex-1 text-center text-[8px] text-neutral-500 truncate min-w-[28px]" title={k}>{k}</div>
                 ))}
               </div>

             </div>
           </div>

           {/* X 轴全局标题 (固定在底部正中央) */}
           <div className="text-center text-[9px] text-neutral-400 font-bold tracking-widest mt-2 shrink-0">{xLabel}</div>
        </div>
      </div>
    </div>
  );
};

// 2. Seaborn 风格的边缘直方联合分布图 (JointPlot Heatmap)
const JointPlotHeatmap = ({ matrix, title }: { matrix: number[][], title: string }) => {
  if (!matrix || matrix.length === 0) return <div className="h-full flex items-center justify-center text-neutral-400">No data</div>;
  const rows = matrix.length; const cols = matrix[0].length;
  const colSums = Array(cols).fill(0); const rowSums = Array(rows).fill(0);
  let maxVal = 0;
  for(let r=0; r<rows; r++) {
    for(let c=0; c<cols; c++) {
      colSums[c] += matrix[r][c]; rowSums[r] += matrix[r][c];
      if (matrix[r][c] > maxVal) maxVal = matrix[r][c];
    }
  }
  const maxColSum = Math.max(...colSums, 1); const maxRowSum = Math.max(...rowSums, 1);

  return (
    <div className="flex flex-col items-center w-full">
      <h5 className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider mb-2 w-full text-left">{title}</h5>
      <div className="flex flex-col gap-1">
        {/* 顶部边缘直方图 (X分布) */}
        <div className="flex items-end h-12 w-48 ml-7 gap-px">
          {colSums.map((val, i) => (
             <div key={i} className="flex-1 bg-teal-500/50 hover:bg-teal-500" style={{ height: `${(val/maxColSum)*100}%` }} title={`X-Bin ${i}: ${val}`}/>
          ))}
        </div>
        <div className="flex gap-1 h-48">
           {/* Y 轴刻度 */}
           <div className="w-6 flex flex-col justify-between items-end text-[9px] text-neutral-500 py-1 pr-1 border-r-2 border-neutral-200 dark:border-neutral-700">
              <span>0</span><span>0.5</span><span>1.0</span>
           </div>
           {/* 中心 KDE 热力图 */}
           <div className="w-48 h-48 grid grid-rows-10 grid-cols-10 gap-px bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-inner">
             {matrix.map((row, r) => row.map((val, c) => (
                <div key={`${r}-${c}`} style={{ opacity: val === 0 ? 0.02 : Math.max(0.15, val/maxVal) }} className="bg-orange-500 hover:ring-1 ring-black dark:ring-white z-10 cursor-crosshair" title={`X:${(c/10).toFixed(1)}~${((c+1)/10).toFixed(1)}\nY:${(r/10).toFixed(1)}~${((r+1)/10).toFixed(1)}\nCount: ${val}`}/>
             )))}
           </div>
           {/* 右侧边缘直方图 (Y分布) */}
           <div className="flex flex-col w-12 h-48 gap-px border-l-2 border-neutral-200 dark:border-neutral-700 pl-1">
             {rowSums.map((val, i) => (
                <div key={i} className="flex-1 bg-teal-500/50 hover:bg-teal-500" style={{ width: `${(val/maxRowSum)*100}%` }} title={`Y-Bin ${i}: ${val}`}/>
             ))}
           </div>
        </div>
        {/* X 轴刻度 */}
        <div className="flex justify-between w-48 ml-7 text-[9px] text-neutral-500 pt-1 border-t-2 border-neutral-200 dark:border-neutral-700">
           <span>0</span><span>0.5</span><span>1.0</span>
        </div>
      </div>
    </div>
  )
}

// 3. 饼图 + 条形图 联合展示器
// 3. 饼图 + 条形图 联合展示器 (彻底修复自适应高度)
const ShapeDistribution = ({ data }: { data: Record<string, number> }) => {
   const entries = Object.entries(data || {});
   const total = entries.reduce((acc, [_, v]) => acc + (v as number), 0) || 1;
   const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#6366f1'];
   
   let cumulative = 0;
   const conicStops = entries.map(([k, v], i) => {
      const pct = ((v as number) / total) * 100;
      const start = cumulative; cumulative += pct;
      return `${colors[i % colors.length]} ${start}% ${cumulative}%`;
   }).join(', ');

   return (
      <div className="flex items-center gap-8 w-full py-2">
         {/* 饼图 */}
         <div className="w-28 h-28 rounded-full shadow-sm border border-neutral-100 dark:border-neutral-800 shrink-0" style={{ background: `conic-gradient(${conicStops})` }} />
         {/* 条形图 (自适应内容，最高允许 48 即 192px) */}
         <div className="flex-1 flex flex-col gap-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-4">
            {entries.map(([k, v], i) => (
               <div key={k} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded shadow-sm shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                  <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 w-24 capitalize truncate">{k}</span>
                  <div className="flex-1 h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                     <div className="h-full rounded-full transition-all" style={{ backgroundColor: colors[i % colors.length], width: `${((v as number)/total)*100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500 w-8 text-right">{v as number}</span>
               </div>
            ))}
         </div>
      </div>
   )
}

// ============================================================================
// 🌟 主页面组件
// ============================================================================

export function TaxonomyDashboard({ onClose }: TaxonomyDashboardProps = {}) {
  const { t } = useTranslation();
  const { 
    taxonomyClasses, addTaxonomyClass, updateTaxonomyClass, deleteTaxonomyClass, mergeTaxonomyClasses,
    taxonomyAttributes = [], addTaxonomyAttribute, updateTaxonomyAttribute, deleteTaxonomyAttribute,
    folders
  } = useStore() as any;

  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'attributes'>('overview');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState({ classes: true, attributes: true });

  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [statsData, setStatsData] = useState<any>(null); 
  const [activeShapeTab, setActiveShapeTab] = useState<'bbox' | 'polygon'>('polygon'); // Overview 下方的 Shape Tab
  const [activeClassShapeTab, setActiveClassShapeTab] = useState<string>('polygon'); // 🌟 新增：单类别的 Shape 切换状态
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [renameValue, setRenameValue] = useState('');

  const activeClass = taxonomyClasses.find((c: any) => c.id === selectedClassId);
  const activeAttribute = taxonomyAttributes.find((a: any) => a.id === selectedAttributeId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (folders.length > 0) loadStatistics(false); }, []);
  useEffect(() => { if (activeClass) { setRenameValue(activeClass.name); setMergeTargetId(''); } }, [activeClass]);

  const loadStatistics = async (forceRefresh: boolean) => {
    if (folders.length === 0) return;
    setStatsStatus('loading');
    try {
      const saveDirs = folders.map((f: any) => f.path);
      const data = await fetchProjectStatistics(saveDirs, forceRefresh);
      setStatsData(data);
      setStatsStatus('done');
    } catch (e: any) { console.error(e); setStatsStatus('idle'); }
  };

  const handleAdd = (type: 'classes' | 'attributes') => {
    if (type === 'classes') {
      const newId = `class-${Date.now()}`;
      addTaxonomyClass({ id: newId, name: `new_class_${taxonomyClasses.length + 1}`, color: TAXONOMY_COLORS[taxonomyClasses.length % TAXONOMY_COLORS.length] });
      setActiveTab('classes'); setSelectedClassId(newId);
    } else {
      const newId = `attr-${Date.now()}`;
      addTaxonomyAttribute({ id: newId, name: `new_attribute_${taxonomyAttributes.length + 1}`, type: 'select', options: ['default_val_1'], defaultValue: 'default_val_1', applyToAll: true });
      setActiveTab('attributes'); setSelectedAttributeId(newId);
    }
  };

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
      } else { alert("Please upload a .yaml file for Attributes or .txt for Classes."); return; }
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

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden relative">
      <input type="file" accept=".txt,.yaml,.yml" ref={fileInputRef} className="hidden" onChange={handleImportFile} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* ================= 1. 左侧可收纳导航树 ================= */}
        <div className="w-64 border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-white dark:bg-neutral-900 shrink-0">
          
          <div className="p-3 border-b border-neutral-100 dark:border-neutral-800">
            <Button variant={activeTab === 'overview' ? 'secondary' : 'ghost'} 
                    onClick={() => { setActiveTab('overview'); setSelectedClassId(null); setSelectedAttributeId(null); }} 
                    className={`w-full justify-start h-10 font-bold transition-all ${activeTab === 'overview' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800' : ''}`}>
              <LayoutDashboard className="w-4 h-4 mr-2"/> Global Overview
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
            {/* --- Classes --- */}
            <div>
              <div className="flex items-center justify-between cursor-pointer p-1.5 group rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors" onClick={() => setExpanded(p => ({...p, classes: !p.classes}))}>
                <span className="text-xs font-black text-neutral-600 dark:text-neutral-300 uppercase tracking-wider flex items-center"><Tags className="w-3.5 h-3.5 mr-2"/> Classes <span className="ml-2 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-[9px]">{taxonomyClasses.length}</span></span>
                {expanded.classes ? <ChevronDown className="w-4 h-4 text-neutral-400"/> : <ChevronRight className="w-4 h-4 text-neutral-400"/>}
              </div>
              {expanded.classes && (
                <div className="mt-1 ml-3 border-l-2 border-neutral-100 dark:border-neutral-800 pl-2 space-y-0.5">
                  {taxonomyClasses.map((cls: any) => (
                    <div key={cls.id} onClick={() => { setActiveTab('classes'); setSelectedClassId(cls.id); }} 
                         className={`flex items-center p-2 rounded-md text-xs cursor-pointer transition-colors ${selectedClassId === cls.id && activeTab === 'classes' ? 'bg-neutral-100 dark:bg-neutral-800 font-bold shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400'}`}>
                      <div className="w-2.5 h-2.5 rounded-full mr-2.5 shrink-0 shadow-sm" style={{ backgroundColor: cls.color }} />
                      <span className="truncate flex-1">{cls.name}</span>
                    </div>
                  ))}
                  {/* 干净排版的行动按钮 */}
                  <div className="flex gap-2 mt-3 mb-1 pr-1">
                    <Button variant="outline" className="h-7 text-[10px] flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 bg-transparent" onClick={() => handleAdd('classes')}><Plus className="w-3 h-3 mr-1"/> Add</Button>
                    <Button variant="outline" className="h-7 text-[10px] flex-1 border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 bg-transparent" onClick={() => { setActiveTab('classes'); fileInputRef.current?.click(); }}><Upload className="w-3 h-3 mr-1"/> Import</Button>
                  </div>
                </div>
              )}
            </div>

            {/* --- Attributes --- */}
            <div>
              <div className="flex items-center justify-between cursor-pointer p-1.5 group rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors" onClick={() => setExpanded(p => ({...p, attributes: !p.attributes}))}>
                <span className="text-xs font-black text-neutral-600 dark:text-neutral-300 uppercase tracking-wider flex items-center"><Settings className="w-3.5 h-3.5 mr-2"/> Attributes <span className="ml-2 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-[9px]">{taxonomyAttributes.length}</span></span>
                {expanded.attributes ? <ChevronDown className="w-4 h-4 text-neutral-400"/> : <ChevronRight className="w-4 h-4 text-neutral-400"/>}
              </div>
              {expanded.attributes && (
                <div className="mt-1 ml-3 border-l-2 border-neutral-100 dark:border-neutral-800 pl-2 space-y-0.5">
                  {taxonomyAttributes.map((attr: any) => (
                    <div key={attr.id} onClick={() => { setActiveTab('attributes'); setSelectedAttributeId(attr.id); }} 
                         className={`flex items-center p-2 rounded-md text-xs cursor-pointer transition-colors ${selectedAttributeId === attr.id && activeTab === 'attributes' ? 'bg-neutral-100 dark:bg-neutral-800 font-bold shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400'}`}>
                      <List className="w-3 h-3 mr-2.5 shrink-0 text-neutral-400" />
                      <span className="truncate flex-1">{attr.name}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-3 mb-1 pr-1">
                    <Button variant="outline" className="h-7 text-[10px] flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 bg-transparent" onClick={() => handleAdd('attributes')}><Plus className="w-3 h-3 mr-1"/> Add</Button>
                    <Button variant="outline" className="h-7 text-[10px] flex-1 border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 bg-transparent" onClick={() => { setActiveTab('attributes'); fileInputRef.current?.click(); }}><Upload className="w-3 h-3 mr-1"/> Import</Button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ================= 2. 右侧主体区 ================= */}
        
        {/* 🌟 模式 A：Overview 纯粹大盘展示 */}
        {activeTab === 'overview' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-950/30">
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center shrink-0 z-10">
              <div>
                <h2 className="text-xl font-black">Data Statistics Overview</h2>
                <p className="text-xs text-neutral-500 mt-1">Global and shape-specific analytics across the entire dataset.</p>
              </div>
              <Button onClick={() => loadStatistics(true)} disabled={statsStatus === 'loading'} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md font-bold">
                {statsStatus === 'loading' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh Statistics
              </Button>
            </div>

           {/* 🌟 核心修复：外层使用 flex flex-col gap-6，子元素使用 shrink-0，彻底避免重叠 */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-6">
              {statsStatus === 'idle' && !statsData && (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400 shrink-0">
                  <Activity className="w-12 h-12 mb-4 opacity-20" />
                  <p>Click "Refresh Statistics" to generate the global report.</p>
                </div>
              )}

              {statsData?.global && (
                <>
                  {/* --- 上半部分：全局紧凑视图 (干掉 h-36，让它自适应撑开) --- */}
                  <div className="flex flex-col xl:flex-row gap-6 shrink-0">
                    
                    {/* 左侧：精简信息卡片 */}
                    <div className="w-full xl:w-1/3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm flex flex-col justify-center">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4">Dataset Footprint</h4>
                      <div className="text-5xl font-black text-blue-600 dark:text-blue-500 mb-2">{statsData.global.total_objects} <span className="text-base text-neutral-400 font-bold">Objects</span></div>
                      <p className="text-sm text-neutral-500 flex items-center"><Layers className="w-4 h-4 mr-1.5"/> Across {statsData.global.total_images} Scanned Images</p>
                    </div>
                    
                    {/* 右侧：饼图+条形图 复合组件 */}
                    <div className="w-full xl:w-2/3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm flex flex-col justify-center">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Shape Type Distribution</h4>
                      <ShapeDistribution data={statsData.global.shape_types} />
                    </div>
                  </div>

                  {/* --- 下半部分：Shape 专属 Tab 与 Seaborn 风格图表 --- */}
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm flex overflow-hidden min-h-[600px] shrink-0">
                    
                    {/* 1. 左侧：Shape 垂直导航栏 */}
                    <div className="w-56 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 flex flex-col p-3 gap-1 shrink-0">
                      <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                        <Layers className="w-3 h-3" /> Geometry Filter
                      </h4>
                      
                      {/* 定义所有支持的几何类型及其状态 */}
                      {[
                        { id: 'bbox', label: 'Bounding Box', implemented: true },
                        { id: 'polygon', label: 'Polygon', implemented: true },
                        { id: 'point', label: 'Point', implemented: false },
                        { id: 'linestrip', label: 'Line / Strip', implemented: false },
                        { id: 'ellipse', label: 'Ellipse / Circle', implemented: false },
                        { id: 'rbbox', label: 'Rotated Box', implemented: false },
                        { id: 'cuboid', label: '3D Cuboid', implemented: false },
                      ].map((item) => {
                        const count = statsData.global.shape_types[item.id] || 0;
                        const isActive = activeShapeTab === item.id;
                        
                        return (
                          <button 
                            key={item.id}
                            onClick={() => setActiveShapeTab(item.id as any)} 
                            className={`group text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                              isActive 
                                ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700' 
                                : 'text-neutral-500 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {item.label}
                              {!item.implemented && (
                                <span className="text-[8px] px-1 bg-neutral-200 dark:bg-neutral-800 text-neutral-400 rounded-sm font-normal">WIP</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400'
                              }`}>
                                {count}
                              </span>
                              {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    
                    {/* 2. 右侧：内容展示区 */}
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white dark:bg-neutral-900">
                      {/* 检查当前 Tab 是否已实现 */}
                      {['bbox', 'polygon'].includes(activeShapeTab) ? (
                        statsData.shapes && statsData.shapes[activeShapeTab] ? (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4">
                            {/* 🌟 修复：每个图表外层套一个独立的卡片，增加 min-w-0 防止文字撑爆容器 */}
                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden">
                              <AxisBarChart 
                                title={`Boxes Per Image (${activeShapeTab.toUpperCase()})`} 
                                xLabel="Objects Count" yLabel="Images" 
                                colorClass="bg-purple-500/60"
                                data={statsData.shapes[activeShapeTab].box_number_distribution} 
                              />
                            </div>
                            
                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden">
                              <AxisBarChart 
                                title={`Area % Distribution (${activeShapeTab.toUpperCase()})`} 
                                xLabel="Relative Area (%)" yLabel="Objects" 
                                colorClass="bg-blue-500/60"
                                data={statsData.shapes[activeShapeTab].area_distribution} 
                              />
                            </div>
                            
                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden">
                              <AxisBarChart 
                                title={`Shape Rate (W/H) (${activeShapeTab.toUpperCase()})`} 
                                xLabel="Aspect Ratio" yLabel="Objects" 
                                colorClass="bg-teal-500/60"
                                data={statsData.shapes[activeShapeTab].shape_rate_distribution} 
                              />
                            </div>
                            
                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden flex justify-center">
                              <JointPlotHeatmap 
                                title={`Spatial Joint Distribution (${activeShapeTab.toUpperCase()})`} 
                                matrix={statsData.shapes[activeShapeTab].heatmap_center?.flat().reduce((rows:any, key:any, index:number) => (index % 10 == 0 ? rows.push([key]) : rows[rows.length-1].push(key)) && rows, [])} 
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-400 opacity-50">
                            <Activity className="w-12 h-12 mb-4 animate-pulse" />
                            <p>Calculating additional metrics for {activeShapeTab}...</p>
                          </div>
                        )
                      ) : (
                        /* 🌟 未实现页面的优雅占位符 */
                        <div className="h-full flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95">
                          <div className="w-20 h-20 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center border border-dashed border-neutral-200 dark:border-neutral-700">
                             <Settings className="w-10 h-10 text-neutral-300 dark:text-neutral-600 animate-spin-slow" />
                          </div>
                          <div className="text-center">
                            <h3 className="text-lg font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest">Under Development</h3>
                            <p className="text-xs text-neutral-500 mt-1 max-w-xs">Detailed statistical analysis for <span className="font-bold text-blue-500">{activeShapeTab.toUpperCase()}</span> is not yet implemented.</p>
                          </div>
                          <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest" onClick={() => setActiveShapeTab('polygon')}>
                            Back to Polygon
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 🌟 模式 B：Classes 单类专属展示 */}
        {activeTab === 'classes' && activeClass && (
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
            
            {/* 顶栏：干净内联的编辑工具栏 */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="relative w-8 h-8 rounded-md shadow-sm border border-neutral-200 overflow-hidden shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                  <input type="color" value={activeClass.color} onChange={e => updateTaxonomyClass(activeClass.id, { color: e.target.value })} className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer" />
                </div>
                <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => { if (renameValue.trim() && renameValue !== activeClass.name) updateTaxonomyClass(activeClass.id, { name: renameValue.trim() }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="text-xl font-black border-transparent hover:border-neutral-200 focus:border-blue-500 bg-transparent px-2 h-10 w-64 shadow-none" placeholder="Class Name" />
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
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-6">
              {statsData?.classes?.[activeClass.name] ? (
                <>
                  {/* --- 上半部分：类的紧凑视图 --- */}
                  <div className="flex flex-col xl:flex-row gap-6 shrink-0 animate-in fade-in">
                    
                    <div className="w-full xl:w-1/3 flex flex-col gap-6">
                      <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-center">
                        <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Class Objects</h4>
                        <div className="text-5xl font-black text-neutral-800 dark:text-neutral-100">{statsData.classes[activeClass.name].total}</div>
                      </div>
                      
                      <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col flex-1 max-h-[300px]">
                        <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-3 border-b border-neutral-100 dark:border-neutral-800 pb-2">Scenes Involved ({statsData.classes[activeClass.name].stems.length})</h4>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                          {statsData.classes[activeClass.name].stems.map((stem: string) => (
                            <div key={stem} className="text-[10px] font-mono p-1.5 hover:bg-blue-50 text-neutral-600 hover:text-blue-600 rounded cursor-pointer truncate border border-transparent hover:border-blue-100 dark:hover:bg-neutral-800 dark:hover:border-neutral-700">
                              {stem}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="w-full xl:w-2/3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm flex flex-col">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Class Shape Types</h4>
                      <ShapeDistribution data={statsData.classes[activeClass.name].shape_types} />
                    </div>
                  </div>

                  {/* --- 下半部分：类的 Shape 专属 Tab 与 Seaborn 图表 --- */}
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm flex overflow-hidden min-h-[600px] shrink-0 animate-in fade-in slide-in-from-bottom-4">
                    
                    {/* 左侧：Shape 垂直导航栏 */}
                    <div className="w-56 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 flex flex-col p-3 gap-1 shrink-0">
                      <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                        <Layers className="w-3 h-3" /> Geometry Filter
                      </h4>
                      
                      {[
                        { id: 'bbox', label: 'Bounding Box', implemented: true },
                        { id: 'polygon', label: 'Polygon', implemented: true },
                        { id: 'point', label: 'Point', implemented: false },
                        { id: 'linestrip', label: 'Line / Strip', implemented: false },
                        { id: 'ellipse', label: 'Ellipse / Circle', implemented: false }
                      ].map((item) => {
                        const count = statsData.classes[activeClass.name].shape_types[item.id] || 0;
                        const isActive = activeClassShapeTab === item.id;
                        
                        return (
                          <button 
                            key={item.id}
                            onClick={() => setActiveClassShapeTab(item.id)} 
                            className={`group text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                              isActive 
                                ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700' 
                                : 'text-neutral-500 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {item.label}
                              {!item.implemented && (
                                <span className="text-[8px] px-1 bg-neutral-200 dark:bg-neutral-800 text-neutral-400 rounded-sm font-normal">WIP</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400'
                              }`}>
                                {count}
                              </span>
                              {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 右侧：内容展示区 */}
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white dark:bg-neutral-900">
                      {['bbox', 'polygon'].includes(activeClassShapeTab) ? (
                        statsData.classes[activeClass.name].shapes && statsData.classes[activeClass.name].shapes[activeClassShapeTab] ? (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4">
                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden">
                              <AxisBarChart 
                                title={`Boxes Per Image (${activeClassShapeTab.toUpperCase()})`} 
                                xLabel="Objects Count" yLabel="Images" 
                                colorClass="bg-purple-500/60"
                                data={statsData.classes[activeClass.name].shapes[activeClassShapeTab].box_number_distribution} 
                              />
                            </div>

                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden">
                              <AxisBarChart 
                                title={`Area % Distribution (${activeClassShapeTab.toUpperCase()})`} 
                                xLabel="Relative Area (%)" yLabel="Objects" 
                                colorClass="bg-blue-500/60"
                                data={statsData.classes[activeClass.name].shapes[activeClassShapeTab].area_distribution} 
                              />
                            </div>

                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden">
                              <AxisBarChart 
                                title={`Shape Rate (W/H) (${activeClassShapeTab.toUpperCase()})`} 
                                xLabel="Aspect Ratio" yLabel="Objects" 
                                colorClass="bg-teal-500/60"
                                data={statsData.classes[activeClass.name].shapes[activeClassShapeTab].shape_rate_distribution} 
                              />
                            </div>

                            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm min-w-0 overflow-hidden flex justify-center">
                              <JointPlotHeatmap 
                                title={`Spatial Joint Distribution (${activeClassShapeTab.toUpperCase()})`} 
                                matrix={statsData.classes[activeClass.name].shapes[activeClassShapeTab].heatmap_center?.flat().reduce((rows:any, key:any, index:number) => (index % 10 == 0 ? rows.push([key]) : rows[rows.length-1].push(key)) && rows, [])} 
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-400 opacity-50">
                            <Activity className="w-12 h-12 mb-4 opacity-50" />
                            <p>No `{activeClassShapeTab}` data found for class '{activeClass.name}'.</p>
                          </div>
                        )
                      ) : (
                        /* 未实现页面的优雅占位符 */
                        <div className="h-full flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95">
                          <div className="w-20 h-20 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center border border-dashed border-neutral-200 dark:border-neutral-700">
                             <Settings className="w-10 h-10 text-neutral-300 dark:text-neutral-600 animate-spin-slow" />
                          </div>
                          <div className="text-center">
                            <h3 className="text-lg font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest">Under Development</h3>
                            <p className="text-xs text-neutral-500 mt-1 max-w-xs">Detailed statistical analysis for <span className="font-bold text-blue-500">{activeClassShapeTab.toUpperCase()}</span> is not yet implemented.</p>
                          </div>
                          <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest" onClick={() => setActiveClassShapeTab('polygon')}>
                            Back to Polygon
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                  <Activity className="w-12 h-12 mb-4 opacity-20" />
                  <p>No specific statistics found for '{activeClass.name}'.</p>
                  <p className="text-xs mt-2">Try adding some boxes or click "Refresh Statistics" in Overview.</p>
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
              <div className="max-w-2xl mx-auto bg-white dark:bg-neutral-900 border rounded-xl shadow-sm p-6 animate-in fade-in">
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