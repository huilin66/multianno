// src/components/modules/TaxonomyDashboard.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { 
  Tags, Settings, Trash2, Edit3, GitMerge,
  Plus, Check, X, Loader2, ArrowRight, Upload, Database, Activity,
  List, LayoutDashboard, Clock, RefreshCw, ChevronDown, ChevronRight, Layers, ShieldCheck
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

// 4. 合并后的属性看板：左侧所有累计条，右侧紧凑饼图矩阵 (🌟 独立分离 QA 质检指标, 饼图随容器完美自适应缩放)
// 4. 合并后的属性看板：左侧所有累计条，右侧紧凑饼图矩阵 (🌟 彻底修复高度自适应拉伸问题)
const CombinedAttributeView = ({ densityData, detailsData }: { densityData: Record<string, number>, detailsData: Record<string, Record<string, number>> }) => {
  const attributes = Object.keys(detailsData || {});
  if (attributes.length === 0 && (!densityData || Object.keys(densityData).length === 0)) return null;
  
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#6366f1'];

  const getConicGradient = (data: Record<string, number>) => {
    const entries = Object.entries(data);
    const total = entries.reduce((acc, [_, v]) => acc + (v as number), 0) || 1;
    let cumulative = 0;
    return entries.map(([_, v], i) => {
      const pct = ((v as number) / total) * 100;
      const start = cumulative; cumulative += pct;
      return `${colors[i % colors.length]} ${start}% ${cumulative}%`;
    }).join(', ');
  };

  return (
    // 🌟 核心修复 1：使用 items-start，绝对禁止左右两个盒子为了对齐而互相拉伸高度！
    <div className="flex flex-col xl:flex-row gap-5 w-full items-start animate-in fade-in">
      
      {/* ================= 左侧：条形图列表 ================= */}
      <div className="w-full xl:w-1/2 flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-2 shrink-0">
          Attribute Values Distribution (Stacked Bars)
        </h4>
        
        {/* 🌟 核心修复 2：去掉 min-h，只保留 max-h。内容少时自动收缩，内容多时出现滚动条 */}
        <div className="overflow-y-auto custom-scrollbar pr-2 max-h-[300px]">
          
          {/* QA 质检卡片 (如果有密度数据才显示) */}
          {densityData && Object.keys(densityData).length > 0 && (
            <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4"/> Annotation Completeness
                </span>
                <span className="text-[9px] bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-400 px-1.5 py-0.5 rounded uppercase font-black tracking-widest shadow-sm">
                  QA Metric
                </span>
              </div>
              <div className="flex h-5 w-full rounded overflow-hidden shadow-inner bg-amber-100 dark:bg-neutral-900">
                {Object.entries(densityData).map(([k, v], i) => {
                  const total = Object.values(densityData).reduce((a: number, b: any) => a + (b as number), 0) || 1;
                  return <div key={k} style={{ width: `${((v as number)/total)*100}%`, backgroundColor: colors[i % colors.length] }} title={`${k} attrs: ${v}`} className="h-full hover:brightness-110 transition-all border-r border-white/20 dark:border-black/20 last:border-0 cursor-crosshair" />
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                {Object.entries(densityData).map(([k, v], i) => (
                  <div key={k} className="flex items-center gap-1.5 text-[10px] text-amber-700/80 dark:text-amber-500/80 font-medium">
                    <div className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: colors[i % colors.length] }} />
                    <span>{k} attrs <span className="font-mono opacity-60">({v})</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 业务属性的值分布 */}
          {densityData && Object.keys(densityData).length > 0 && (
             <h5 className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-3 flex items-center gap-2">
               <Tags className="w-3 h-3"/> Semantic Attributes
             </h5>
          )}

          <div className="space-y-5">
            {attributes.map((attrName) => {
              const entries = Object.entries(detailsData[attrName] || {});
              const total = entries.reduce((acc, [_, v]) => acc + (v as number), 0) || 1;
              if (entries.length === 0) return null;
              
              return (
                <div key={attrName} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{attrName}</span>
                    <span className="text-[9px] text-neutral-400 font-mono">{total} tags</span>
                  </div>
                  <div className="flex h-5 w-full rounded overflow-hidden shadow-inner bg-neutral-100 dark:bg-neutral-800">
                    {entries.map(([k, v], i) => (
                      <div key={k} style={{ width: `${((v as number)/total)*100}%`, backgroundColor: colors[i % colors.length] }} title={`${k}: ${v}`} className="h-full hover:brightness-110 transition-all border-r border-white/20 dark:border-black/20 last:border-0 cursor-crosshair" />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                    {entries.map(([k, v], i) => (
                      <div key={k} className="flex items-center gap-1.5 text-[9px] text-neutral-500">
                        <div className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: colors[i % colors.length] }} />
                        <span className="truncate max-w-[80px]" title={k}>{k}</span> <span className="font-mono text-neutral-400">({v})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ================= 右侧：饼图矩阵 ================= */}
      <div className="w-full xl:w-1/2 flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-2 shrink-0">
          Proportions Summary (Pies)
        </h4>
        
        {/* 🌟 核心修复 3：移除饼图区的 min-h，同步为 max-h-[300px] */}
        <div className="overflow-y-auto custom-scrollbar max-h-[300px] pr-2">
          
          {densityData && Object.keys(densityData).length > 0 && (
            <div className="flex items-center gap-4 p-3 mb-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/50 shadow-sm">
              <div className="w-12 h-12 rounded-full shadow-sm border-2 border-white dark:border-neutral-800 shrink-0" style={{ background: `conic-gradient(${getConicGradient(densityData)})` }} />
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-black text-amber-700 dark:text-amber-500 uppercase tracking-widest">Tags Per Object</span>
                  <span className="text-[8px] bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-400 px-1 rounded font-bold">QA</span>
                </div>
                <span className="text-[9px] text-amber-600/70 dark:text-amber-500/70 leading-tight pr-2">
                  Inspect if objects are missing mandatory tags.
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
            {attributes.map((attrName) => {
              if (Object.keys(detailsData[attrName] || {}).length === 0) return null;
              return (
                <div key={attrName} className="flex flex-col items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all aspect-square">
                  <span className="text-[10px] font-black text-neutral-600 dark:text-neutral-300 uppercase tracking-widest truncate w-full text-center px-1 mb-2" title={attrName}>{attrName}</span>
                  <div className="w-[80%] aspect-square rounded-full shadow-sm border-[3px] border-white dark:border-neutral-600 shrink-0" style={{ background: `conic-gradient(${getConicGradient(detailsData[attrName])})` }} />
                </div>
              );
            })}
          </div>
          
        </div>
      </div>

    </div>
  );
};

// 🌟 新增：提取高复用的统一属性包裹卡片 (Wrapper)
const AttributeAnalysisCard = ({ title, icon: Icon, totalTags, densityData, detailsData, variant = "default", emptyMsg }: any) => {
  // 防御性空数据校验
  if (!detailsData || Object.values(detailsData)[0] === undefined || Object.keys(Object.values(detailsData)[0] as any).length === 0) {
     return (
       <div className="h-48 flex flex-col items-center justify-center text-neutral-400 opacity-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm">
         <Tags className="w-10 h-10 mb-3 opacity-30" />
         <p className="text-xs font-bold">{emptyMsg || `No data found for '${title}'`}</p>
       </div>
     );
  }

  const isPurple = variant === "purple";
  const isClass = variant === "class";

  return (
    <div className={`bg-white dark:bg-neutral-950 border ${isPurple ? 'border-purple-200 dark:border-purple-900/50 border-2 shadow-md' : 'border-neutral-200 dark:border-neutral-800 shadow-sm'} rounded-xl p-5 relative overflow-hidden animate-in fade-in`}>
      
      {/* 紫色模式的侧边高亮条 */}
      {isPurple && <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500" />}
      
      {/* 统一的头部设计 */}
      <div className={`flex items-center gap-3 mb-5 pb-3 border-b ${isPurple ? 'border-purple-100 dark:border-purple-900/30' : 'border-neutral-100 dark:border-neutral-800'}`}>
        
        {/* 如果是单类模式，Icon 传进来的是颜色 Hex 代码 */}
        {isClass && typeof Icon === 'string' && (
          <div className="w-3.5 h-3.5 rounded shadow-sm border border-black/10 shrink-0" style={{ backgroundColor: Icon }} />
        )}
        {/* 常规模式传入的是 React 组件图标 */}
        {!isClass && typeof Icon !== 'string' && Icon && (
          <Icon className={`w-4 h-4 shrink-0 ${isPurple ? 'text-purple-600' : 'text-neutral-500'}`} />
        )}
        
        <h4 className={`text-sm font-black uppercase tracking-widest ${isPurple ? 'text-purple-700 dark:text-purple-400' : 'text-neutral-700 dark:text-neutral-200'}`}>
          {title}
        </h4>
        
        {totalTags !== undefined && (
          <span className={`ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isPurple ? 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/40' : 'text-neutral-500 bg-neutral-100 dark:bg-neutral-800'}`}>
            {isClass ? 'Tags: ' : 'Total Tags: '} {totalTags}
          </span>
        )}
      </div>
      
      {/* 渲染自适应的高度数据流 */}
      <CombinedAttributeView densityData={densityData} detailsData={detailsData} />
    </div>
  );
};

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
  const [activeAttrShapeTab, setActiveAttrShapeTab] = useState<string>('polygon'); // 🌟 新增：Attribute 页面的 Shape 切换
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [renameValue, setRenameValue] = useState('');
  const [showClassDeleteConfirm, setShowClassDeleteConfirm] = useState(false);
  const initRef = useRef(false);
  const activeClass = taxonomyClasses.find((c: any) => c.id === selectedClassId);
  const activeAttribute = taxonomyAttributes.find((a: any) => a.id === selectedAttributeId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🌟 修改 TaxonomyDashboard.tsx 中的初始化逻辑
  useEffect(() => {
    // 1. 修复：只拦截 null/undefined，【允许空数组通过】，否则新项目永远加不了 background！
    if (!taxonomyClasses) return;

    // 2. 检查是否已经存在任何大小写变体的 background
    const hasBackground = taxonomyClasses.some(
      (c: any) => c.name.trim().toLowerCase() === 'background'
    );
    
    // 3. 如果已经存在，或者当前组件生命周期内已经触发过，就跳过
    if (initRef.current || hasBackground) return;

    // 4. 执行添加
    initRef.current = true; 
    
    addTaxonomyClass({
      // 🌟 核心：使用固定 ID 字符串，防止重复
      id: 'system-default-background-class', 
      name: 'background',
      color: '#9CA3AF',
      description: 'System reserved class for soft-deleted items.',
    });
  }, [taxonomyClasses, addTaxonomyClass]);
  useEffect(() => { if (folders.length > 0) loadStatistics(false); }, []);
  useEffect(() => { 
    if (activeClass) { 
      setRenameValue(activeClass.name); 
      setMergeTargetId(''); 
      setShowClassDeleteConfirm(false); // 🌟 切换类别时重置删除状态
    } 
  }, [activeClass]);
  // 只要发现类别被彻底清空（比如刚调用了 resetProject），就把锁重置
    useEffect(() => {
      if (taxonomyClasses && taxonomyClasses.length === 0) {
        initRef.current = false;
      }
    }, [taxonomyClasses]);
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
    const targetClass = taxonomyClasses.find((c: any) => c.id === mergeTargetId);
    if (!targetClass) return;

    if (!window.confirm(`Merge all '${activeClass.name}' into '${targetClass.name}'?\n\nThis will re-assign all boxes. \n${activeClass.name.toLowerCase() !== 'background' ? 'The original class will be deleted.' : 'The background class will be kept empty.'}`)) return;

    setIsProcessing(true);
    try {
      const safeSaveDirs = folders.map((f: any) => f.path).filter(Boolean);
      
      await batchMergeClass({ 
        save_dirs: safeSaveDirs, 
        old_names: [activeClass.name], 
        new_name: targetClass.name 
      });

      // 🌟 核心特权逻辑：如果是 background，只转移数据，不销毁类别！
      if (activeClass.name.toLowerCase() === 'background') {
        // 不执行 deleteTaxonomyClass，保留类别
        // 最好在这里触发一次全局的统计数据刷新，让界面上的数量归 0
        // fetchProjectStatistics(safeSaveDirs);
        setMergeTargetId('');
        alert(`Successfully moved all shapes to '${targetClass.name}'. The 'background' class remains active.`);
      } else {
        // 普通类别：转移完数据后，销毁自己
        deleteTaxonomyClass(activeClass.id, true); 
        setSelectedClassId(null);
      }

    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 🌟 1. 替换原有的 handleDeleteClass 为接收明确布尔值的执行函数
  const executeDeleteClass = async (isHardDelete: boolean) => {
    if (!activeClass) return;
    setIsProcessing(true);
    try {
      const safeSaveDirs = folders.map((f: any) => f.path).filter(Boolean);

      const payload = { 
        save_dirs: safeSaveDirs, 
        class_name: activeClass.name, 
        hard_delete: isHardDelete 
      };

      await batchDeleteClass(payload);
      
      deleteTaxonomyClass(activeClass.id, isHardDelete);
      setSelectedClassId(null);
      setShowClassDeleteConfirm(false); // 执行完毕后收起菜单
    } catch (err: any) { 
      alert(`Delete failed: ${err.message}`); 
    } finally { 
      setIsProcessing(false); 
    }
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
                  {Array.from(new Map(taxonomyClasses.map((c: any) => [c.id, c])).values())
                    .map((cls: any, index: number) => (
                      <div 
                        key={`${cls.id}-${index}`} // 🌟 就算 ID 重复，加上 index 后 key 也绝对唯一，彻底干掉警告
                        onClick={() => { setActiveTab('classes'); setSelectedClassId(cls.id); }} 
                        className={`flex items-center p-2 rounded-md text-xs cursor-pointer transition-colors ${selectedClassId === cls.id && activeTab === 'classes' ? 'bg-neutral-100 dark:bg-neutral-800 font-bold shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400'}`}
                      >
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
                  <div className="flex flex-col gap-6">
                    
                    {/* --- 第一行：全局紧凑视图 --- */}
                  <div className="flex flex-col xl:flex-row gap-6 shrink-0">
                    <div className="w-full xl:w-1/3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm flex flex-col justify-center">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-4">Dataset Footprint</h4>
                      <div className="text-5xl font-black text-blue-600 dark:text-blue-500 mb-2">{statsData.global.total_objects} <span className="text-base text-neutral-400 font-bold">Objects</span></div>
                      <p className="text-sm text-neutral-500 flex items-center"><Layers className="w-4 h-4 mr-1.5"/> Across {statsData.global.total_images} Scanned Images</p>
                    </div>
                    <div className="w-full xl:w-2/3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm flex flex-col justify-center overflow-hidden">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Shape Type Distribution</h4>
                      <ShapeDistribution data={statsData.global.shape_types} />
                    </div>
                  </div>

                  {/* --- 第二行：属性分布大盘 (另起一行！) --- */}
                  {statsData.global.attribute_details && Object.keys(statsData.global.attribute_details).length > 0 && (
                    <div className="flex flex-col gap-4 shrink-0">
                      <div className="flex items-center gap-2 px-1">
                        <div className="w-1.5 h-4 bg-purple-500 rounded-full" />
                        <h3 className="text-sm font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400">
                          Attributes Analytics
                        </h3>
                      </div>
                      
                      {/* 🌟 核心：一键渲染合并后的新看板 */}
                      <CombinedAttributeView 
                        densityData={statsData.global.attribute_counts} 
                        detailsData={statsData.global.attribute_details} 
                      />
                      
                    </div>
                  )}
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
            
            {/* 顶栏：干净内联的编辑工具栏 (已去重合并) */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0 shadow-sm z-10">
              
              {/* 左侧：颜色修改与名称重命名 */}
              <div className="flex items-center gap-4">
                <div className="relative w-8 h-8 rounded-md shadow-sm border border-neutral-200 overflow-hidden shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                  <input type="color" value={activeClass.color} onChange={e => updateTaxonomyClass(activeClass.id, { color: e.target.value })} className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer" />
                </div>
                
                {/* 🌟 保护 1：禁止修改 background 的名字 */}
                <div className="flex flex-col">
                  <Input 
                    value={renameValue} 
                    onChange={e => setRenameValue(e.target.value)} 
                    onBlur={() => { if (renameValue.trim() && renameValue !== activeClass.name) updateTaxonomyClass(activeClass.id, { name: renameValue.trim() }); }} 
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} 
                    disabled={activeClass.name.toLowerCase() === 'background'} 
                    className={`text-xl font-black border-transparent bg-transparent px-2 h-8 w-64 shadow-none ${
                      activeClass.name.toLowerCase() === 'background' 
                        ? 'opacity-60 cursor-not-allowed' 
                        : 'hover:border-neutral-200 focus:border-blue-500'
                    }`} 
                    placeholder="Class Name" 
                  />
                  {activeClass.name.toLowerCase() === 'background' && (
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest px-2">
                      System Class (Recycle Bin)
                    </span>
                  )}
                </div>
              </div>

              {/* 右侧：Merge合并 与 删除操作 */}
              <div className="flex items-center gap-3">
                
                {/* Merge 模块 (全部放开) */}
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
                
                {/* 🌟 只有这里有一份 Delete 逻辑：非黑即白，绝不重复 */}
                {activeClass.name.toLowerCase() === 'background' ? (
                  
                  // 如果是背景类：显示灰色保护按钮
                  <Button disabled variant="outline" size="sm" className="h-9 px-4 font-bold shadow-sm border-dashed text-neutral-400 bg-neutral-50 dark:bg-neutral-900 cursor-not-allowed">
                    <ShieldCheck className="w-4 h-4 mr-2" /> Protected
                  </Button>

                ) : (

                  // 如果是普通类：显示确认删除菜单
                  <>
                    {showClassDeleteConfirm ? (
                      <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 p-1 rounded-lg border border-red-200 dark:border-red-900/50 animate-in fade-in zoom-in-95">
                        <span className="text-[10px] font-bold text-red-600 px-2 uppercase tracking-wider">Confirm:</span>
                        <Button
                          size="sm"
                          className="h-7 px-3 text-[10px] bg-red-600 hover:bg-red-700 text-white font-bold"
                          onClick={() => executeDeleteClass(true)}
                          disabled={isProcessing}
                          title="Destroy all boxes of this class"
                        >
                          Hard Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-[10px] border-red-200 text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50 font-bold"
                          onClick={() => executeDeleteClass(false)}
                          disabled={isProcessing}
                          title="Keep boxes, but mark as 'background'"
                        >
                          Soft Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                          onClick={() => setShowClassDeleteConfirm(false)}
                          disabled={isProcessing}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="h-9 px-4 font-bold shadow-sm" 
                        onClick={() => setShowClassDeleteConfirm(true)} 
                        disabled={isProcessing}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    )}
                  </>

                )}
                
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
                    {/* 右侧：内容展示区 */}
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white dark:bg-neutral-900">
                      {['bbox', 'polygon'].includes(activeClassShapeTab) ? (
                        statsData.classes[activeClass.name].shapes && statsData.classes[activeClass.name].shapes[activeClassShapeTab] ? (
                          
                          <div className="flex flex-col w-full gap-10">
                            
                            {/* 上半部分：4个基础图形图表 (维持 2 列网格) */}
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

                            {/* 🌟 下半部分：属性统计大盘 (脱离网格，独占 100% 宽度) */}
                            {statsData.classes[activeClass.name].shapes[activeClassShapeTab].attribute_details && 
                             Object.keys(statsData.classes[activeClass.name].shapes[activeClassShapeTab].attribute_details).length > 0 && (
                              <div className="animate-in fade-in slide-in-from-bottom-4">
                                {/* 完美复用刚刚抽离出来的 Wrapper 卡片 */}
                                <AttributeAnalysisCard 
                                  title={`${activeClass.name} - ${activeClassShapeTab} Attributes`}
                                  icon={activeClass.color}
                                  variant="class"
                                  totalTags={Object.values(statsData.classes[activeClass.name].shapes[activeClassShapeTab].attribute_counts || {}).reduce((a:any, b:any) => a + b, 0)}
                                  densityData={statsData.classes[activeClass.name].shapes[activeClassShapeTab].attribute_counts}
                                  detailsData={statsData.classes[activeClass.name].shapes[activeClassShapeTab].attribute_details}
                                />
                              </div>
                            )}
                            
                          </div>

                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-400 opacity-50">
                            <Activity className="w-12 h-12 mb-4 opacity-50" />
                            <p>No `{activeClassShapeTab}` data found for class '{activeClass.name}'.</p>
                          </div>
                        )
                      ) : (
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

        {/* 🌟 模式 C：Attributes 详情与统计看板 */}
        {activeTab === 'attributes' && activeAttribute && (
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
            
            {/* 1. 顶部：内联编辑工具栏 */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center border border-purple-100 dark:border-purple-800">
                  <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex flex-col">
                  <Input 
                    value={activeAttribute.name}
                    onChange={e => updateTaxonomyAttribute(activeAttribute.id, { name: e.target.value })}
                    className="text-xl font-black border-transparent hover:border-neutral-200 focus:border-blue-500 bg-transparent px-1 h-8 w-64 shadow-none"
                    placeholder="Attribute Name"
                  />
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest px-1">Global Semantic Attribute</span>
                </div>
              </div>

              <Button variant="destructive" size="sm" className="h-9 px-4 font-bold shadow-sm" onClick={() => deleteTaxonomyAttribute(activeAttribute.id)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Attribute
              </Button>
            </div>

            {/* 2. 主体区：上下两部分 */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-6">
              
              {/* --- 上半部分：配置 (左) & 全局大盘 (右) --- */}
              <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in shrink-0">
                
                {/* 🌟 左上角：Dropdown Options 编辑器 (保持不变) */}
                <div className="w-full xl:w-1/3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm flex flex-col">
                  {/* ... 这里的代码完全保持你刚才确认过的样子 ... */}
                  <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 flex items-center justify-between rounded-t-xl">
                    <div className="flex items-center gap-2">
                      <List className="w-4 h-4 text-purple-500" />
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-300">
                        Dropdown Options
                      </h3>
                    </div>
                    <Button 
                      size="sm" variant="outline" className="h-7 text-[10px] font-bold border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400 dark:hover:bg-purple-900/30"
                      onClick={() => {
                        const newOptions = [...(activeAttribute.options || []), `new_option_${(activeAttribute.options?.length||0)+1}`];
                        updateTaxonomyAttribute(activeAttribute.id, { options: newOptions, defaultValue: newOptions[0] });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>

                  <div className="p-5 flex-1 overflow-y-auto custom-scrollbar max-h-[300px]">
                    <div className="flex flex-col gap-3">
                      {activeAttribute.options?.map((opt: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 group p-1.5 rounded-lg border border-neutral-100 dark:border-neutral-800 hover:border-purple-200 dark:hover:border-purple-900 bg-neutral-50/50 dark:bg-neutral-950 transition-all">
                          <div className="flex-1 relative flex items-center">
                            <div className={`w-3 h-3 rounded-full border shrink-0 ml-2 ${activeAttribute.defaultValue === opt ? 'bg-purple-500 border-purple-500' : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800'}`} />
                            <Input 
                              value={opt}
                              onChange={(e) => {
                                const newOptions = [...activeAttribute.options];
                                newOptions[idx] = e.target.value;
                                updateTaxonomyAttribute(activeAttribute.id, { options: newOptions });
                              }}
                              className={`pl-3 h-8 text-xs font-bold border-transparent focus:ring-0 shadow-none bg-transparent ${activeAttribute.defaultValue === opt ? 'text-purple-700 dark:text-purple-400' : ''}`}
                            />
                            
                            {/* Default 文字角标 */}
                            {activeAttribute.defaultValue === opt && (
                              <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-[8px] font-black uppercase tracking-widest rounded-sm shrink-0 mr-2 shadow-sm select-none">
                                Default
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                            <Button variant="ghost" size="sm" className={`h-6 text-[9px] font-bold px-2 ${activeAttribute.defaultValue === opt ? 'hidden' : 'text-neutral-500'}`} onClick={() => updateTaxonomyAttribute(activeAttribute.id, { defaultValue: opt })}>
                              Set Default
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => {
                                const newOptions = activeAttribute.options.filter((_:any, i:number) => i !== idx);
                                updateTaxonomyAttribute(activeAttribute.id, { options: newOptions, defaultValue: newOptions[0] || '' });
                              }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!activeAttribute.options || activeAttribute.options.length === 0) && (
                        <div className="text-center py-6 text-neutral-400 border-2 border-dashed border-neutral-100 dark:border-neutral-800 rounded-xl">
                          <p className="text-xs">No options defined.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 附加一个总体统计角标 */}
                  <div className="px-5 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/30 flex justify-between items-center text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                    <span>Total Tags in Project:</span>
                    <span className="text-purple-600 text-sm">{Object.values(statsData?.global?.attribute_details?.[activeAttribute.name] || {}).reduce((a:any, b:any) => a + b, 0) as number}</span>
                  </div>
                </div>

                {/* 🌟 极致精简：右上角全局大盘直接调用 Wrapper */}
                <div className="w-full xl:w-2/3 flex flex-col h-fit">
                  <AttributeAnalysisCard 
                    title="Global Distribution Overview"
                    icon={Layers}
                    totalTags={Object.values(statsData?.global?.attribute_details?.[activeAttribute.name] || {}).reduce((a:any, b:any) => a + b, 0)}
                    densityData={{}} 
                    detailsData={{ [activeAttribute.name]: statsData?.global?.attribute_details?.[activeAttribute.name] }}
                    emptyMsg={`No global data found for '${activeAttribute.name}'.`}
                  />
                </div>

              </div>

              {/* --- 下半部分：Shape Tab 切换 & Class 细分 --- */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm flex overflow-hidden min-h-[500px] shrink-0 animate-in fade-in slide-in-from-bottom-4">


                {/* 1. 左侧：Shape 垂直导航栏 */}
                <div className="w-56 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20 flex flex-col p-3 gap-1 shrink-0">
                  <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Geometry Filter
                  </h4>
                  
                  {['bbox', 'polygon', 'point', 'linestrip', 'ellipse'].map((shapeId) => {
                    const isActive = activeAttrShapeTab === shapeId;
                    const isImplemented = ['bbox', 'polygon'].includes(shapeId);
                    
                    return (
                      <button 
                        key={shapeId}
                        onClick={() => setActiveAttrShapeTab(shapeId)} 
                        className={`group text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                          isActive 
                            ? 'bg-white dark:bg-neutral-800 text-purple-600 dark:text-purple-400 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700' 
                            : 'text-neutral-500 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50'
                        }`}
                      >
                        <span className="flex items-center gap-2 capitalize">
                          {shapeId === 'bbox' ? 'Bounding Box' : shapeId}
                          {!isImplemented && <span className="text-[8px] px-1 bg-neutral-200 dark:bg-neutral-800 text-neutral-400 rounded-sm font-normal">WIP</span>}
                        </span>
                        {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>

                {/* 🌟 极致精简：右侧明细列表直接复用 Wrapper */}
                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-neutral-50/30 dark:bg-neutral-900">
                  {['bbox', 'polygon'].includes(activeAttrShapeTab) ? (
                    <div className="space-y-6">
                      
                      {/* 1. 当前 Shape 的全局大盘 */}
                      {statsData?.shapes?.[activeAttrShapeTab]?.attribute_details?.[activeAttribute.name] && (
                        <AttributeAnalysisCard 
                          title={`Total in ${activeAttrShapeTab.toUpperCase()}`}
                          icon={Layers}
                          variant="purple"
                          totalTags={Object.values(statsData.shapes[activeAttrShapeTab].attribute_details[activeAttribute.name]).reduce((a:any, b:any) => a + b, 0)}
                          densityData={{}}
                          detailsData={{ [activeAttribute.name]: statsData.shapes[activeAttrShapeTab].attribute_details[activeAttribute.name] }}
                        />
                      )}

                      {/* 分割线 */}
                      {taxonomyClasses.some((cls: any) => statsData?.classes?.[cls.name]?.shapes?.[activeAttrShapeTab]?.attribute_details?.[activeAttribute.name]) && (
                        <div className="flex items-center gap-3 opacity-50 py-2">
                           <div className="flex-1 h-px bg-neutral-300 dark:bg-neutral-700" />
                           <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Breakdown by Class</span>
                           <div className="flex-1 h-px bg-neutral-300 dark:bg-neutral-700" />
                        </div>
                      )}

                      {/* 2. 遍历各 Class 的分布 */}
                      {taxonomyClasses.map((cls: any) => {
                        const clsData = statsData?.classes?.[cls.name]?.shapes?.[activeAttrShapeTab]?.attribute_details?.[activeAttribute.name];
                        if (!clsData || Object.keys(clsData).length === 0) return null;

                        return (
                          <AttributeAnalysisCard 
                            key={cls.id}
                            title={`Class: ${cls.name}`}
                            icon={cls.color} // 传颜色代码
                            variant="class"
                            totalTags={Object.values(clsData).reduce((a:any, b:any) => a + b, 0)}
                            densityData={{}}
                            detailsData={{ [activeAttribute.name]: clsData }}
                          />
                        );
                      })}

                      {/* 兜底状态 */}
                      {(!statsData?.shapes?.[activeAttrShapeTab]?.attribute_details?.[activeAttribute.name]) && (
                        <div className="h-64 flex flex-col items-center justify-center text-neutral-400 opacity-50">
                          <Tags className="w-12 h-12 mb-4" />
                          <p className="text-sm font-bold">No '{activeAttribute.name}' tags found in '{activeAttrShapeTab}'</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                       <Settings className="w-10 h-10 text-neutral-400 animate-spin-slow" />
                       <h3 className="text-lg font-black uppercase tracking-widest text-neutral-500">Under Development</h3>
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