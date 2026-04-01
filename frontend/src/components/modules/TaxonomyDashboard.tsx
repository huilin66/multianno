// src/components/modules/TaxonomyDashboard.tsx
import React, { useState } from 'react';
import { useStore, TaxonomyClass } from '../../store/useStore';
import { 
  Tags, Settings, Trash2, Edit3, GitMerge, AlertTriangle, 
  Plus, Check, X, Loader2, Search, ArrowRight 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { batchMergeClass, batchDeleteClass } from '../../api/client';
import { useTranslation } from 'react-i18next';

// 🌟 1. 增加标准的 Props 接口
interface TaxonomyDashboardProps {
  onClose?: () => void;
}

export function TaxonomyDashboard({ onClose }: TaxonomyDashboardProps = {}) {
  const { t } = useTranslation();
  const { 
    taxonomyClasses, addTaxonomyClass, updateTaxonomyClass, deleteTaxonomyClass, mergeTaxonomyClasses,
    folders, annotations
  } = useStore();

  const [activeTab, setActiveTab] = useState<'classes' | 'attributes'>('classes');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3B82F6');

  const activeClass = taxonomyClasses.find(c => c.id === selectedClassId);

  const getActiveClassCount = () => {
    if (!activeClass) return 0;
    return annotations.filter(a => a.label === activeClass.name).length;
  };

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    if (taxonomyClasses.some(c => c.name === newClassName.trim())) {
      alert('Class name already exists!');
      return;
    }
    addTaxonomyClass({ id: `class-${Date.now()}`, name: newClassName.trim(), color: newClassColor });
    setNewClassName('');
    setShowAddClass(false);
  };

  const handleMergeClass = async () => {
    if (!activeClass) return;
    const targetClassName = prompt(`Enter the TARGET class name to merge '${activeClass.name}' into:\n(e.g., 'vehicle')`);
    if (!targetClassName || targetClassName === activeClass.name) return;

    const targetExists = taxonomyClasses.some(c => c.name === targetClassName);
    if (!targetExists) {
      const confirmCreate = window.confirm(`Target class '${targetClassName}' does not exist in the taxonomy. Create it automatically?`);
      if (!confirmCreate) return;
      addTaxonomyClass({ id: `class-${Date.now()}`, name: targetClassName, color: '#888888' });
    }

    setIsProcessing(true);
    try {
      const saveDirs = folders.map(f => f.path);
      const res = await batchMergeClass({ save_dirs: saveDirs, old_names: [activeClass.name], new_name: targetClassName });
      mergeTaxonomyClasses([activeClass.name], targetClassName);
      alert(`Success! Merged into '${targetClassName}'.\nModified ${res.modified_files} files on disk.`);
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

  // 🌟 2. 外层容器重构：采用 Flex 列布局，完美衔接底部 Footer
  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden relative">
      
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
            {activeTab === 'classes' && (
              <>
                {taxonomyClasses.map(cls => (
                  <div 
                    key={cls.id} onClick={() => setSelectedClassId(cls.id)}
                    className={`flex items-center p-2 rounded-md cursor-pointer transition-colors border ${selectedClassId === cls.id ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                  >
                    <div className="w-4 h-4 rounded-full border border-neutral-900/20 dark:border-white/20 mr-3 shrink-0" style={{ backgroundColor: cls.color }} />
                    <span className="font-medium text-sm flex-1 truncate">{cls.name}</span>
                    <ArrowRight className={`w-4 h-4 text-primary transition-opacity ${selectedClassId === cls.id ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                ))}

                {!showAddClass ? (
                  <Button variant="ghost" className="w-full mt-2 border border-dashed border-neutral-300 dark:border-neutral-700" onClick={() => setShowAddClass(true)}>
                    <Plus className="w-4 h-4 mr-2" /> {t('taxonomy.addNewClass', 'Add New Class')}
                  </Button>
                ) : (
                  <div className="p-3 mt-2 bg-neutral-100 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700 space-y-2 animate-in slide-in-from-top-2">
                    <Input autoFocus placeholder={t('taxonomy.className', 'Class name...')} value={newClassName} onChange={e => setNewClassName(e.target.value)} className="h-8 text-sm" />
                    <div className="flex gap-2">
                      <input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer shrink-0" />
                      <Button size="sm" className="flex-1 h-8 bg-green-600 hover:bg-green-700 text-white" onClick={handleAddClass}>Save</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-neutral-500" onClick={() => setShowAddClass(false)}><X className="w-4 h-4"/></Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 右侧详情区 */}
        <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
          {activeClass ? (
            <div className="p-8 max-w-4xl w-full mx-auto space-y-8 overflow-y-auto h-full custom-scrollbar">
              <div className="flex items-start justify-between pb-6 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg border-2 border-neutral-900/10 dark:border-white/10 shadow-sm" style={{ backgroundColor: activeClass.color }} />
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">{activeClass.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">ID: {activeClass.id}</p>
                  </div>
                </div>
                <Button variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <Edit3 className="w-4 h-4 mr-2" /> {t('taxonomy.editInfo', 'Edit Info')}
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                  <p className="text-sm font-medium text-muted-foreground">{t('taxonomy.activeObjects', 'Active Objects')}</p>
                  <p className="text-3xl font-bold mt-2">{getActiveClassCount()}</p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-5 h-5" /> {t('taxonomy.dangerZone', 'Danger Zone')}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">{t('taxonomy.dangerDesc', 'These actions will rewrite JSON files.')}</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-orange-50 dark:bg-orange-950/20 p-5 rounded-xl border border-orange-200 dark:border-orange-900/50">
                    <h4 className="font-bold text-orange-800 dark:text-orange-400 flex items-center gap-2">
                      <GitMerge className="w-4 h-4" /> {t('taxonomy.mergeTitle', 'Merge Class')}
                    </h4>
                    <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-2 mb-4">Re-assign all objects of this class.</p>
                    <Button onClick={handleMergeClass} className="w-full bg-orange-600 hover:bg-orange-700 text-white">{t('taxonomy.mergeBtn', 'Merge...')}</Button>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950/20 p-5 rounded-xl border border-red-200 dark:border-red-900/50">
                    <h4 className="font-bold text-red-800 dark:text-red-400 flex items-center gap-2">
                      <Trash2 className="w-4 h-4" /> {t('taxonomy.deleteTitle', 'Delete Class')}
                    </h4>
                    <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-2 mb-4">Remove this class globally.</p>
                    <Button onClick={handleDeleteClass} variant="destructive" className="w-full">{t('taxonomy.deleteBtn', 'Delete...')}</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-600">
              <Tags className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium">{t('taxonomy.selectHint', 'Select a class to manage')}</h3>
            </div>
          )}
        </div>
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