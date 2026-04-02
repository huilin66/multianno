// src/components/modules/TaxonomyDashboard.tsx
import React, { useState } from 'react';
import { useStore, TaxonomyClass } from '../../store/useStore';
import { 
  Tags, Settings, Trash2, Edit3, GitMerge, AlertTriangle, 
  Plus, Check, X, Loader2, Search, ArrowRight, Upload, Database, Activity
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { batchMergeClass, batchDeleteClass, fetchProjectStatisticsStream } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { TAXONOMY_COLORS } from '../../config/colors';

// 🌟 1. 增加标准的 Props 接口
interface TaxonomyDashboardProps {
  onClose?: () => void;
}

export function TaxonomyDashboard({ onClose }: TaxonomyDashboardProps = {}) {
  const { t } = useTranslation();
  const { 
    taxonomyClasses, addTaxonomyClass, updateTaxonomyClass, deleteTaxonomyClass, mergeTaxonomyClasses,
    taxonomyAttributes, addTaxonomyAttribute, // 👈 补充解构这俩
    folders, annotations
  } = useStore();

  const [activeTab, setActiveTab] = useState<'classes' | 'attributes'>('classes');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [colorValue, setColorValue] = useState('');

  // 🌟 新增：全局统计数据的状态管理
  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [statsProgress, setStatsProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });
  const [statsData, setStatsData] = useState<any>(null); // 存储后端返回的统计结果
  const [shapeFilter, setShapeFilter] = useState<string | null>(null); // 点击柱状图/列表进行筛选


  const activeClass = taxonomyClasses.find(c => c.id === selectedClassId);
  const getActiveClassCount = () => {
    if (!activeClass) return 0;
    return annotations.filter(a => a.label === activeClass.name).length;
  };
    React.useEffect(() => {
        if (activeClass) {
        setRenameValue(activeClass.name);
        setColorValue(activeClass.color);
        setRenameDialogOpen(false);
        setColorDialogOpen(false);
        
        // 👇 切换类别时，重置统计面板
        setStatsStatus('idle');
        setStatsData(null);
        setShapeFilter(null);
        }
    }, [activeClass]);

  // 👇 新增：隐藏的文件上传组件 Ref 与处理逻辑
  const fileInputRef = React.useRef<HTMLInputElement>(null);
// 🌟 核心修改 1：点击 Add 直接生成占位符
  const handlePlaceholderAdd = () => {
    if (activeTab === 'classes') {
      const newId = `class-${Date.now()}`;
      const newName = `new_class_${taxonomyClasses.length + 1}`;
      const color = TAXONOMY_COLORS[taxonomyClasses.length % TAXONOMY_COLORS.length];
      addTaxonomyClass({ id: newId, name: newName, color });
      setSelectedClassId(newId); // 自动选中，方便右侧修改
    } else {
      const newId = `attr-${Date.now()}`;
      const newName = `new_attribute_${taxonomyAttributes.length + 1}`;
      addTaxonomyAttribute({ id: newId, name: newName, type: 'text', applyToAll: true });
    }
  };

  // 🌟 核心修改 2：读取 TXT 文件，按行生成
  const handleImportTXT = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // 按换行符分割，去除首尾空格，过滤空行
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      
      let addedCount = 0;
      if (activeTab === 'classes') {
        lines.forEach((line) => {
          if (!taxonomyClasses.some(c => c.name === line)) {
            addTaxonomyClass({ 
              id: `class-${Math.random().toString(36).substr(2,9)}`, 
              name: line, 
              color: TAXONOMY_COLORS[(taxonomyClasses.length + addedCount) % TAXONOMY_COLORS.length] 
            });
            addedCount++;
          }
        });
      } else {
        lines.forEach((line) => {
          if (!taxonomyAttributes?.some(a => a.name === line)) {
            addTaxonomyAttribute({ 
              id: `attr-${Math.random().toString(36).substr(2,9)}`, 
              name: line, type: 'text', applyToAll: true 
            });
            addedCount++;
          }
        });
      }
      alert(`Successfully imported ${addedCount} items from TXT!`);
      if (fileInputRef.current) fileInputRef.current.value = ''; // 重置 input
    };
    reader.readAsText(file);
  };


  const handleMergeClass = async () => {
    if (!activeClass || !mergeTargetId) return;
    const target = taxonomyClasses.find(c => c.id === mergeTargetId);
    if (!target) return;

    setIsProcessing(true);
    try {
      const saveDirs = folders.map(f => f.path);
      await batchMergeClass({ save_dirs: saveDirs, old_names: [activeClass.name], new_name: target.name });
      mergeTaxonomyClasses([activeClass.name], target.name);
      setMergeTargetId('');
      setSelectedClassId(null);
    } catch (error: any) {
      alert(`Merge failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!activeClass) return;
    const isHardDelete = window.confirm(
      `DELETE CLASS: '${activeClass.name}'\n\n[OK] Hard Delete (Destroy boxes)\n[Cancel] Soft Delete (Mark 'Uncategorized')`
    );
    const finalConfirm = window.confirm(`Are you absolutely sure?`);
    if (!finalConfirm) return;

    setIsProcessing(true);
    try {
      const saveDirs = folders.map(f => f.path);
      const res = await batchDeleteClass({ save_dirs: saveDirs, class_name: activeClass.name, hard_delete: isHardDelete });
      deleteTaxonomyClass(activeClass.id, isHardDelete);
      alert(`Success! Deleted class '${activeClass.name}'.\nModified ${res.modified_files} files on disk.`);
      setSelectedClassId(null);
    } catch (error: any) {
      alert(`Delete failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

// 🌟 真实调用后端流式接口，获取进度与统计数据
  const fetchGlobalStatistics = () => {
    if (!activeClass || folders.length === 0) return;
    
    setStatsStatus('loading');
    setStatsProgress({ current: 0, total: 100 }); // 初始化防闪烁

    const saveDirs = folders.map(f => f.path);

    fetchProjectStatisticsStream(
      saveDirs,
      activeClass.name,
      (current, total) => {
        // 实时更新进度条
        setStatsProgress({ current, total });
      },
      (data) => {
        // 数据接收完成，渲染图表与列表
        setStatsData(data);
        setStatsStatus('done');
      },
      (error) => {
        alert(`Failed to fetch statistics: ${error.message}`);
        setStatsStatus('idle');
      }
    );
  };

  // 🌟 2. 外层容器重构：采用 Flex 列布局，完美衔接底部 Footer
  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden relative">
      {/* 👇 插入隐藏的文件上传器 */}
      <input type="file" accept=".txt" ref={fileInputRef} className="hidden" onChange={handleImportTXT} />
      {isProcessing && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <h2 className="text-xl font-bold">Processing Batch Operation...</h2>
          <p className="text-muted-foreground mt-2">Python backend is rewriting JSON files. Please wait.</p>
        </div>
      )}

      {/* 🌟 3. 中间内容区 (去掉原本的假头部) */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧侧边栏 */}
        <div className="w-80 border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-white dark:bg-neutral-900 shrink-0">
          <div className="flex p-2 gap-1 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
            <Button variant={activeTab === 'classes' ? 'default' : 'ghost'} size="sm" className="flex-1 h-8" onClick={() => setActiveTab('classes')}>
              <Tags className="w-4 h-4 mr-2"/> {t('taxonomy.classes', 'Classes')}
            </Button>
            <Button variant={activeTab === 'attributes' ? 'default' : 'ghost'} size="sm" className="flex-1 h-8" onClick={() => setActiveTab('attributes')}>
              <Settings className="w-4 h-4 mr-2"/> {t('taxonomy.attributes', 'Attributes')}
            </Button>
          </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {/* 渲染 Classes 列表 */}
            {activeTab === 'classes' && taxonomyClasses.map(cls => (
              <div 
                key={cls.id} onClick={() => setSelectedClassId(cls.id)}
                className={`flex items-center p-2 rounded-md cursor-pointer transition-colors border ${selectedClassId === cls.id ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-900/20 dark:border-white/20 mr-3 shrink-0" style={{ backgroundColor: cls.color }} />
                <span className="font-medium text-sm flex-1 truncate">{cls.name}</span>
                <ArrowRight className={`w-4 h-4 text-primary transition-opacity ${selectedClassId === cls.id ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            ))}

            {/* 渲染 Attributes 列表 */}
            {activeTab === 'attributes' && taxonomyAttributes.map(attr => (
              <div 
                key={attr.id}
                className="flex items-center p-2 rounded-md cursor-pointer transition-colors border border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Settings className="w-4 h-4 text-neutral-500 mr-3 shrink-0" />
                <span className="font-medium text-sm flex-1 truncate">{attr.name}</span>
              </div>
            ))}

            {/* 👇 统一的极简添加与导入按钮 */}
            <div className="flex gap-2 mt-2">
              <Button variant="ghost" className="flex-1 border border-dashed border-neutral-300 dark:border-neutral-700" onClick={handlePlaceholderAdd}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
              <Button variant="ghost" className="flex-1 border border-dashed border-neutral-300 dark:border-neutral-700" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Import
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧详情区 */}
        {activeClass ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* 🌟 1. 顶部紧凑操作栏 (全部靠左对齐，自定义弹窗) */}
              <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center flex-wrap gap-3 shrink-0 relative z-10">
                
                {/* 1. Class Name */}
                <h1 className="text-lg font-bold truncate max-w-[200px]" title={activeClass.name}>
                  {activeClass.name}
                </h1>

                {/* 2. Rename 按钮与自定义弹窗 */}
                <div className="relative">
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => { setRenameDialogOpen(true); setColorDialogOpen(false); }}>
                    <Edit3 className="w-3.5 h-3.5 mr-1" /> {t('common.rename', 'Rename')}
                  </Button>
                  {renameDialogOpen && (
                    <div className="absolute top-full left-0 mt-2 p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl rounded-md flex items-center gap-2 w-64 animate-in fade-in zoom-in-95">
                      <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} className="h-7 text-xs" autoFocus />
                      <Button size="sm" className="h-7 w-7 p-0 shrink-0 bg-green-600 hover:bg-green-700" onClick={() => {
                        if (renameValue.trim() && renameValue !== activeClass.name) updateTaxonomyClass(activeClass.id, { name: renameValue.trim() });
                        setRenameDialogOpen(false);
                      }}><Check className="w-4 h-4 text-white"/></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => setRenameDialogOpen(false)}><X className="w-4 h-4"/></Button>
                    </div>
                  )}
                </div>

                {/* 3. Color 展示与修改弹窗 */}
                <div className="flex items-center gap-1 relative">
                  <div className="w-5 h-5 rounded border shadow-sm" style={{ backgroundColor: activeClass.color }} />
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => { setColorDialogOpen(true); setRenameDialogOpen(false); }}>
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                  {colorDialogOpen && (
                    <div className="absolute top-full left-0 mt-2 p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl rounded-md flex items-center gap-2 animate-in fade-in zoom-in-95">
                      <input type="color" value={colorValue} onChange={e => setColorValue(e.target.value)} className="w-7 h-7 rounded cursor-pointer shrink-0" />
                      <Button size="sm" className="h-7 w-7 p-0 shrink-0 bg-green-600 hover:bg-green-700" onClick={() => {
                        updateTaxonomyClass(activeClass.id, { color: colorValue });
                        setColorDialogOpen(false);
                      }}><Check className="w-4 h-4 text-white"/></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => setColorDialogOpen(false)}><X className="w-4 h-4"/></Button>
                    </div>
                  )}
                </div>

                {/* 分隔线 */}
                <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

                {/* 4. Merge 选择与合并 */}
                <div className="flex items-center gap-1 border border-neutral-200 dark:border-neutral-700 rounded-md p-0.5 bg-neutral-50 dark:bg-neutral-950">
                  <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                    <SelectTrigger className="w-32 h-6 text-xs border-none bg-transparent focus:ring-0 shadow-none px-2">
                      <SelectValue placeholder={t('taxonomy.mergeTarget', 'Merge into...')} />
                    </SelectTrigger>
                    <SelectContent>
                      {taxonomyClasses
                        .filter(c => c.id !== activeClass.id)
                        .map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                  <Button 
                    size="sm" className="h-6 px-2 text-[10px] bg-orange-600 hover:bg-orange-700 text-white rounded-sm"
                    disabled={!mergeTargetId} onClick={handleMergeClass} 
                  >
                    <GitMerge className="w-3 h-3 mr-1" /> {t('common.merge', 'Merge')}
                  </Button>
                </div>

                {/* 分隔线 */}
                <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

                {/* 5. Delete 按钮 */}
                <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={handleDeleteClass}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> {t('common.delete', 'Delete')}
                </Button>

              </div>

              {/* 🌟 2. 下方主体：全局异步统计区 */}
              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-neutral-50 dark:bg-neutral-950/50">
                
                {statsStatus === 'idle' && (
                  <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-900/50">
                    <Database className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mb-4" />
                    <h3 className="text-lg font-bold text-neutral-700 dark:text-neutral-300">{t('taxonomy.globalStats', 'Global Project Statistics')}</h3>
                    <p className="text-sm text-neutral-500 mt-2 mb-6 max-w-sm text-center">
                      Calculate the distribution of shapes and locate all files containing <strong className="text-primary">'{activeClass.name}'</strong> across the entire project.
                    </p>
                    <Button onClick={fetchGlobalStatistics} className="bg-primary text-white shadow-md">
                      <Activity className="w-4 h-4 mr-2" /> {t('taxonomy.calcStats', 'Calculate Statistics')}
                    </Button>
                  </div>
                )}

                {statsStatus === 'loading' && (
                  <div className="h-full flex flex-col items-center justify-center border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-900 shadow-sm">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <h3 className="text-base font-bold">Scanning JSON Files...</h3>
                    <p className="text-sm text-muted-foreground mt-2 font-mono">
                      {statsProgress.current} / {statsProgress.total} Files Processed
                    </p>
                    <div className="w-64 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full mt-4 overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, (statsProgress.current / statsProgress.total) * 100)}%` }} />
                    </div>
                  </div>
                )}

                {statsStatus === 'done' && statsData && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    {/* 顶部总览卡片 */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase">Total Objects</p>
                          <p className="text-3xl font-black mt-1 text-primary">{statsData.total}</p>
                        </div>
                        <Database className="w-8 h-8 text-primary/20" />
                      </div>
                    </div>

                    {/* 图表与竖列统计区 */}
                    <div className="grid grid-cols-3 gap-4 h-64">
                      {/* 左侧：竖列分类统计 */}
                      <div className="col-span-1 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col">
                        <h4 className="text-xs font-bold uppercase text-neutral-500 mb-3">Shape Distribution</h4>
                        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
                          {Object.entries(statsData.shapesCount).map(([shape, count]) => (
                            <div 
                              key={shape} 
                              onClick={() => setShapeFilter(shapeFilter === shape ? null : shape)}
                              className={`flex justify-between items-center p-2 rounded text-sm cursor-pointer transition-colors border ${
                                shapeFilter === shape 
                                  ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' 
                                  : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              }`}
                            >
                              <span className="capitalize">{shape}</span>
                              <span className="font-mono font-bold">{count as number}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 中间：图表占位区 (后续引入 Recharts 或 ECharts) */}
                      <div className="col-span-2 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex items-center justify-center">
                        <div className="text-center text-neutral-400">
                          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Bar Chart & Pie Chart Area</p>
                          <p className="text-xs mt-1">Ready for Recharts/ECharts integration</p>
                        </div>
                      </div>
                    </div>

                    {/* 底部：对应文件列表 */}
                    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col h-64">
                      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase text-neutral-500">
                          Files Containing '{activeClass.name}' {shapeFilter && `(${shapeFilter})`}
                        </h4>
                        {shapeFilter && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShapeFilter(null)}>Clear Filter</Button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        <table className="w-full text-left text-sm">
                          <thead className="text-xs text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                            <tr>
                              <th className="pb-2 font-medium">Stem Name</th>
                              <th className="pb-2 font-medium">Shape Type</th>
                              <th className="pb-2 font-medium text-right">Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statsData.fileList
                              .filter((item: any) => shapeFilter ? item.shape === shapeFilter : true)
                              .map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                  <td className="py-2 font-mono text-primary cursor-pointer hover:underline">{item.stem}</td>
                                  <td className="py-2 text-neutral-600 dark:text-neutral-400 capitalize">{item.shape}</td>
                                  <td className="py-2 text-right font-mono">{item.count}</td>
                                </tr>
                              ))}
                            {statsData.fileList.filter((item: any) => shapeFilter ? item.shape === shapeFilter : true).length === 0 && (
                              <tr><td colSpan={3} className="text-center py-4 text-neutral-400">No files match the current filter.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-600 bg-neutral-50 dark:bg-neutral-950">
              <Tags className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium">{t('taxonomy.selectHint', 'Select a class to manage')}</h3>
            </div>
          )}
      </div>

      {/* 🌟 4. 统一标准的底部 Footer (与 ProjectMetaDashboard 保持一致) */}
      <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center shrink-0 transition-colors">
        <span className="text-xs text-neutral-500 flex items-center gap-1">
          <Tags className="w-3 h-3"/> Live Taxonomy State
        </span>
        <div className="flex items-center gap-3">
          <Button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (onClose) onClose();
            }} 
            variant="default"
          >
            {t('common.confirm', 'Confirm')}
          </Button>
        </div>
      </div>

    </div>
  );
}