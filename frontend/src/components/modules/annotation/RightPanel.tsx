import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { 
  Database, ChevronRight, Layers, Maximize, Crop, 
  Eye, Square, AlertTriangle, Trash2, Image as ImageIcon 
} from 'lucide-react';

interface RightPanelProps {
  tool: string;
  showFullExtent: Record<string, boolean>;
  toggleFullExtent: (id: string) => void;
  pushAction: (action: any) => void; // 🌟 接收新函数
}

export function RightPanel({ 
  tool, showFullExtent, toggleFullExtent, pushAction
}: RightPanelProps) {
  const { t } = useTranslation();
  
  // 🌟 直接从全局拿数据，不用父组件传！
  const { 
    folders, views, annotations, updateAnnotation, removeAnnotation, 
    stems, currentStem, setCurrentStem, taxonomyClasses, taxonomyAttributes, 
    activeAnnotationId, setActiveAnnotationId, setActiveModule, updateStemMetadata, currentMeta
  } = useStore() as any;

  // 过滤出当前图片的标注
  const currentAnnotations = annotations.filter((a: any) => a.stem === currentStem);

  return (
    <div className="w-80 border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-col shrink-0 overflow-hidden shadow-xl z-10">
      
      {/* 1. Project Meta */}
      <div onClick={() => setActiveModule('meta')} className="p-3 border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 cursor-pointer transition-all group flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 group-hover:text-blue-500">
            {t('workspace.projectMeta')}
          </span>
        </div>
        
        {/* 🌟 补回你丢失的精美数据药丸标签 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[10px] font-mono text-neutral-500 dark:text-neutral-400 group-hover:border-blue-500/30 transition-colors shadow-sm">
            <span className="text-blue-500 font-bold">{folders?.length || 0}</span>
            <span className="opacity-60 text-[9px] uppercase tracking-wider">{t('workspace.folders', 'Folders')}</span>
            <div className="w-[1px] h-2.5 bg-neutral-300 dark:bg-neutral-700 mx-0.5" />
            <span className="text-emerald-500 font-bold">{views?.length || 0}</span>
            <span className="opacity-60 text-[9px] uppercase tracking-wider">{t('workspace.views', 'Views')}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-blue-500 transition-colors" />
        </div>
      </div>

      {/* 2. View Layers (图层管理区) - 极致压缩高度 */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <h3 className="font-semibold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2 mb-2">
          <Layers className="w-3.5 h-3.5" /> {t('workspace.viewLayers', 'View Layers')}
        </h3>
        <div className="space-y-1">
          {views.map((v: any, idx: number) => (
            <div key={v.id} className="flex items-center justify-between bg-white dark:bg-neutral-900/50 p-1.5 rounded border border-neutral-200 dark:border-neutral-800/50 text-[10px]">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${v.isMain ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                <span className={v.isMain ? "text-blue-500 font-bold" : "text-neutral-500 dark:text-neutral-300"}>
                  {v.isMain ? 'Main View' : `Aug View ${idx}`}
                </span>
              </div>
              
              {/* 🌟 新增：右侧控制按钮区 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono text-neutral-400 uppercase mr-1">
                  {v.bands?.length === 3 ? 'RGB' : (v.colormap || 'GRAY')}
                </span>
                
                {/* 全景切换按钮 (主视图不需要该按钮，因为主视图本身就是基准) */}
                {!v.isMain && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFullExtent(v.id); }}
                    title={showFullExtent[v.id] ? "Crop to Main View" : "Show Full Extent"}
                    className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                      showFullExtent[v.id] 
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' 
                        : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                    }`}
                  >
                    {showFullExtent[v.id] ? <Crop className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                  </button>
                )}
                
                {/* 保留的小眼睛图标 */}
                <button className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 🌟 新增：1. 全局图像描述 (VLM Support) */}
      {currentStem && (
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500">Image Description (VLM)</h3>
          </div>
          <textarea 
            className="w-full h-16 text-xs p-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 focus:ring-1 focus:ring-primary resize-none custom-scrollbar"
            placeholder="Describe the entire scene for Vision-Language Models..."
            // 🌟 确保对应 JSON 中的 text 字段
            value={currentMeta?.text || ''}
            onChange={(e) => updateStemMetadata(currentStem, { text: e.target.value })}
          />
          <div className="mt-2">
            <Label className="text-[10px] text-neutral-400 mb-1 block">Image Tags</Label>
            <Input 
              className="h-7 text-xs" 
              placeholder="city, sunny, crowded..."
              // 🌟 对应 JSON 中的 image_tags 字段
              value={currentMeta?.tags?.join(', ') || ''}
              onChange={(e) => {
                const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
                updateStemMetadata(currentStem, { tags });
              }}
            />
          </div>
        </div>
      )}
      {/* 🌟 3. Active Object Editor (动态属性编辑器) */}
{/* 🌟 3. Active Object Editor (动态属性编辑器) */}
      <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-blue-50/50 dark:bg-blue-900/10 transition-all">
        <div className="p-3 pb-2 flex items-center justify-between border-b border-neutral-200/50 dark:border-neutral-800/50">
          <h3 className="font-bold text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {t('workspace.editorTitle')}
          </h3>
        </div>
        
        <div className="p-3 space-y-3 min-h-[100px]">
          {activeAnnotationId ? (() => {
            const activeAnno = annotations.find((a: any) => a.id === activeAnnotationId);
            if (!activeAnno) return <div className="text-xs text-neutral-500">{t('workspace.notFound')}</div>;
            
            return (
              <div className="space-y-3 animate-in fade-in">
                {/* 标签与描述 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-neutral-500">{t('workspace.label')}</Label>
                    <Select value={activeAnno.label} onValueChange={(val) => updateAnnotation(activeAnno.id, { label: val })}>
                      <SelectTrigger className="h-7 text-xs bg-white dark:bg-neutral-900"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {taxonomyClasses.map((c: any) => <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-neutral-500">Shape Text</Label>
                    <Input 
                      value={activeAnno.text || ''} 
                      onChange={(e) => updateAnnotation(activeAnno.id, { text: e.target.value })} 
                      className="h-7 text-xs bg-white dark:bg-neutral-900" 
                      placeholder="Object text..."
                    />
                  </div>
                </div>

                {/* 🌟 新增：ID 管理 (Group & Track) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-neutral-500">Group ID</Label>
                    <Input 
                      type="number" className="h-7 text-xs bg-white dark:bg-neutral-900" 
                      value={activeAnno.group_id || ''} 
                      onChange={(e) => updateAnnotation(activeAnno.id, { group_id: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-neutral-500">Track ID</Label>
                    <Input 
                      type="number" className="h-7 text-xs bg-white dark:bg-neutral-900" 
                      value={activeAnno.track_id || ''} 
                      onChange={(e) => updateAnnotation(activeAnno.id, { track_id: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>

                {/* 🌟 新增：标志位管理 (Difficult & Occluded) */}
                <div className="grid grid-cols-2 gap-2 p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Switch checked={!!activeAnno.difficult} onCheckedChange={(val) => updateAnnotation(activeAnno.id, { difficult: val })} />
                    <Label className="text-[10px]">Difficult</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!activeAnno.occluded} onCheckedChange={(val) => updateAnnotation(activeAnno.id, { occluded: val })} />
                    <Label className="text-[10px]">Occluded</Label>
                  </div>
                </div>

                {/* 动态 Attributes 渲染 */}
                {taxonomyAttributes && taxonomyAttributes.length > 0 && (
                  <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800">
                    <Label className="text-[10px] text-neutral-500 mb-2 block uppercase tracking-wider">{t('workspace.attributes')}</Label>
                    <div className="space-y-2.5">
                      {taxonomyAttributes.map((attr: any) => (
                        <div key={attr.id} className="flex items-center justify-between">
                          <span className="text-xs text-neutral-700 dark:text-neutral-300">{attr.name}</span>
                          {/* 🌟 核心修改：如果是枚举属性则显示下拉框 */}
                          {attr.options ? (
                            <Select 
                              value={activeAnno.attributes?.[attr.name] as string || attr.defaultValue} 
                              onValueChange={(val) => updateAnnotation(activeAnno.id, { 
                                attributes: { ...(activeAnno.attributes || {}), [attr.name]: val } 
                              })}
                            >
                              <SelectTrigger className="w-28 h-6 text-[10px] bg-neutral-50 dark:bg-neutral-950"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {attr.options.map((opt: string) => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input 
                              value={activeAnno.attributes?.[attr.name] as string || ''}
                              onChange={(e) => updateAnnotation(activeAnno.id, { 
                                attributes: { ...(activeAnno.attributes || {}), [attr.name]: e.target.value } 
                              })}
                              className="w-24 h-6 text-xs bg-white dark:bg-neutral-950"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="text-center py-4 text-[11px] text-neutral-400 dark:text-neutral-600 italic">
              {t('workspace.unselected')}
            </div>
          )}
        </div>
      </div>

      {/* 4. Objects List */}
      <div className="flex-grow flex flex-col border-b border-neutral-200 dark:border-neutral-800 overflow-hidden min-h-[120px]">
        <div className="p-3 pb-2 flex items-center justify-between shrink-0 bg-neutral-100 dark:bg-neutral-900/50">
          <h3 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <Square className="w-3.5 h-3.5" /> {t('workspace.objects')} ({currentAnnotations.length})
          </h3>
        </div>
        <div className="flex-grow overflow-y-auto p-2 pt-0 space-y-1 custom-scrollbar">
          {currentAnnotations.map((ann: any) => {
            const clsDef = taxonomyClasses.find((c: any) => c.name === ann.label);
            const color = clsDef?.color || '#3B82F6';
            const isActive = ann.id === activeAnnotationId;
            
            return (
              <div 
                key={ann.id} 
                onClick={() => setActiveAnnotationId(ann.id)}
                className={`group p-2 rounded border text-[11px] flex items-center justify-between cursor-pointer transition-all ${
                  isActive 
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-700 dark:text-blue-400 shadow-sm' 
                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="font-medium">
                    {ann.label} {ann.difficult && <AlertTriangle className="w-3 h-3 inline text-red-500"/>}
                  </span>
                </div>

                {/* 🌟 核心修改：删除按钮 */}
                {/* 🌟 核心修改：垃圾桶删除也支持撤销 */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-6 h-6 opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const targetAnno = currentAnnotations.find((a: any) => a.id === ann.id);
                    if (targetAnno) {
                      pushAction({ type: 'delete', anno: targetAnno });
                    }
                    removeAnnotation(ann.id); 
                    if(isActive) setActiveAnnotationId(null); 
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Scene Groups */}
      <div className="h-[20%] flex flex-col overflow-hidden bg-neutral-100 dark:bg-black/20 shrink-0">
        <div className="p-3 pb-2 shrink-0">
          <h3 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" /> {t('workspace.scenegroup')}
          </h3>
        </div>
        <div className="flex-grow overflow-y-auto p-2 pt-0 space-y-1 custom-scrollbar">
          {stems.map((stem: string) => (
            <button
              key={stem}
              onClick={() => {
                setCurrentStem(stem);
                setActiveAnnotationId(null);
              }}
              className={`w-full text-left px-3 py-1.5 text-[11px] rounded transition-all flex items-center justify-between group ${
                currentStem === stem 
                  ? 'bg-blue-600 text-white shadow-md font-bold' 
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <span className="font-mono truncate">{stem}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}