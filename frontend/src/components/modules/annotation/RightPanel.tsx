import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { 
  Database, ChevronRight, Layers, Maximize, Minimize, Crop, Edit3,
  Eye, Square, AlertTriangle, Trash2, Image as ImageIcon, Frame
} from 'lucide-react';
import { Slider } from '../../ui/slider';

interface RightPanelProps {
  tool: string;
  showFullExtent: Record<string, boolean>;
  toggleFullExtent: (id: string) => void;
  pushAction: (action: any) => void;
  focusedViewId: string | null;            
  setFocusedViewId: (id: string | null) => void;

  // 🌟 2. 补齐本次新增的图层引擎状态
  layerOrder: string[];
  setLayerOrder: (order: string[]) => void;
  visibleLayers: Record<string, boolean>;
  setVisibleLayers: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}

export function RightPanel({ 
  tool, showFullExtent, toggleFullExtent, pushAction, 
  focusedViewId, setFocusedViewId,
  layerOrder, setLayerOrder,
  visibleLayers, setVisibleLayers
}: RightPanelProps) {
  const { t } = useTranslation();
  
  const { 
    folders, views, annotations, updateAnnotation, removeAnnotation, 
    stems, currentStem, setCurrentStem, taxonomyClasses, taxonomyAttributes, 
    activeAnnotationId, setActiveAnnotationId, setActiveModule, updateStemMetadata, currentMeta,
    updateView, tempViewSettings, setTempViewSettings, applyViewSettingsToAll
  } = useStore() as any;
  const [openLayerId, setOpenLayerId] = React.useState<string | null>(null);

  // 控制各个板块的展开状态
  const [expanded, setExpanded] = React.useState({
    layers: true,
    vlm: false,      // VLM 默认收起
    editor: true,    // 编辑器默认展开
    objects: true,
    scenes: false    // 场景列表较长，默认收起
  });

  const toggleSection = (section: keyof typeof expanded) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // 通用手风琴头部组件
  const SectionHeader = ({ title, icon: Icon, isExpanded, onToggle, badge, colorClass }: any) => (
    <div 
      onClick={onToggle}
      className={`p-2.5 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors shrink-0 ${
        isExpanded ? 'bg-neutral-100/50 dark:bg-neutral-900/50' : 'bg-white dark:bg-neutral-950'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${isExpanded ? (colorClass || 'text-primary') : 'text-neutral-400'}`} />
        <h3 className={`font-bold text-[10px] uppercase tracking-wider ${isExpanded ? 'text-neutral-700 dark:text-neutral-300' : 'text-neutral-500'}`}>
          {title}
        </h3>
        {badge !== undefined && (
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[9px] text-neutral-500 font-mono">
            {badge}
          </span>
        )}
      </div>
      <ChevronRight className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
    </div>
  );

  const currentAnnotations = annotations.filter((a: any) => a.stem === currentStem);

  return (
    <div className="w-80 h-full border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-col shrink-0 overflow-hidden shadow-xl z-10">

      {/* 1. Project Meta (固定不折叠) */}
      <div onClick={() => setActiveModule('meta')} className="p-3 border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 cursor-pointer transition-all group flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 group-hover:text-blue-500">
            {t('workspace.projectMeta')}
          </span>
        </div>
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

      {/* 整个下半部分包裹在一个列容器中，处理全局滚动与占比 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* 2. View Layers */}
        {/* 2. View Layers */}
        <SectionHeader title={t('workspace.viewLayers', 'View Layers')} icon={Layers} isExpanded={expanded.layers} onToggle={() => toggleSection('layers')} />
        
        {expanded.layers && (
          <div className="p-2 space-y-1 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900/30">
            {/* 🌟 需求 2：按照 layerOrder 排序渲染 */}
            {[...views].sort((a, b) => layerOrder.indexOf(a.id) - layerOrder.indexOf(b.id)).map((v: any) => {
              const originalIndex = views.findIndex((orig: any) => orig.id === v.id);
              
              // 🌟 获取 DIY 配置，兜底默认值
              const settings = v.settings || { brightness: 1, contrast: 1, saturation: 1, minMax: [0, 100] };
              const isOpen = openLayerId === v.id;
              
              return (
                <div key={v.id} className="flex flex-col bg-white dark:bg-neutral-900/50 rounded border border-neutral-200 dark:border-neutral-800/50 mb-1">
                  
                  {/* === 图层头部（拖拽、基础操作） === */}
                  <div className="flex items-center justify-between p-1.5 gap-2 hover:border-blue-400 transition-colors">
                    
                  {/* 🌟 体验升级：将 draggable 提升到左半边整个容器，包含图标、复选框和名称 */}
                    <div 
                      className="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing hover:bg-neutral-100 dark:hover:bg-neutral-800 p-1 -ml-1 rounded transition-colors"
                      draggable 
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', v.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sourceId = e.dataTransfer.getData('text/plain');
                        if (sourceId && sourceId !== v.id) {
                          const newOrder = [...layerOrder];
                          newOrder.splice(newOrder.indexOf(sourceId), 1);
                          newOrder.splice(newOrder.indexOf(v.id), 0, sourceId);
                          setLayerOrder(newOrder); // 触发 Z-Index 重排
                        }
                      }}
                      title="Drag to reorder"
                    >
                      <Frame className="w-3.5 h-3.5 text-neutral-400 shrink-0" />

                      {/* 保留你原有的 Checkbox (阻止拖拽事件冲突) */}
                      {focusedViewId && focusedViewId !== v.id && (
                         <input 
                           type="checkbox" 
                           className="w-3 h-3 accent-blue-500 cursor-pointer shrink-0"
                           checked={!!visibleLayers[v.id]}
                           onChange={(e) => setVisibleLayers(p => ({ ...p, [v.id]: e.target.checked }))}
                           onClick={(e) => e.stopPropagation()} // 🌟 防止点击复选框时干扰外层
                           title="Show as Overlay"
                         />
                      )}
                      
                      {/* 🌟 修改 1：名称区域回归纯文本，不再绑定任何点击事件和 pointer 样式 */}
                      <div className="flex items-center gap-2 flex-1 truncate pointer-events-none">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.isMain ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                        <span className={v.isMain ? "text-blue-500 font-bold text-[10px]" : "text-neutral-500 dark:text-neutral-300 text-[10px]"}>
                          {v.isMain ? 'Main View' : `Aug View ${originalIndex}`}
                        </span>
                      </div>
                    </div>

                    {/* 右侧：完整保留你所有的原有按钮！ */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* 🌟 修改 2：将 RGB/GRAY 标签升级为可点击的交互按钮，并绑定展开状态 */}
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setOpenLayerId(isOpen ? null : v.id); 
                        }}
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded transition-colors mr-1 ${
                          isOpen 
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 font-bold shadow-inner' 
                            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                        }`}
                        title="Adjust Color Settings"
                      >
                        {v.bands?.length === 3 ? 'RGB' : (v.colormap || 'GRAY')}
                      </button>
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFocusedViewId(focusedViewId === v.id ? null : v.id); }} 
                        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${focusedViewId === v.id ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
                        title={focusedViewId === v.id ? t('workspace.exitSingleView', 'Exit Single View') : t('workspace.isolateView', 'Isolate View')}
                      >
                        {focusedViewId === v.id ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                      </button>

                      {!v.isMain && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleFullExtent(v.id); }} 
                          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${showFullExtent[v.id] ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
                          title={showFullExtent[v.id] ? t('workspace.showCrop', 'Show Crop') : t('workspace.fullExtent', 'Show Full Extent')}
                        >
                          <Crop className={`w-3.5 h-3.5 ${!showFullExtent[v.id] && 'opacity-50'}`} />
                        </button>
                      )}
                      <button className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* === DIY 滑块调节面板（仅展开时显示） === */}
                  {isOpen && (
                    <div className="p-3 pt-1 border-t border-neutral-100 dark:border-neutral-800 space-y-4 bg-neutral-50/50 dark:bg-black/20">
                      {(() => {
                        // 🌟 1. 获取全局和本地配置进行合并
                        const globalSettings = v.settings || { brightness: 1, contrast: 1, saturation: 1, minMax: [0, 100] };
                        const localSettings = tempViewSettings?.[`${currentStem}_${v.id}`];
                        const settings = { ...globalSettings, ...localSettings };
                        const hasLocalChanges = !!localSettings;

                        return (
                          <>
                            {v.bands?.length === 1 ? (
                              <div className="space-y-3">
                                {/* 🌟 1. 带有可视化渐变条的 Colormap 选择器 */}
                                <div className="flex justify-between items-center bg-white dark:bg-neutral-900/40 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700/50">
                                  <span className="text-[9px] text-neutral-500 font-bold uppercase">Color Map</span>
                                  <Select 
                                    value={v.colormap || 'gray'} 
                                    onValueChange={(val: any) => updateView(v.id, { colormap: val })}
                                  >
                                    <SelectTrigger className="h-6 w-[120px] text-[10px] bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-700">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[
                                        { name: 'gray', range: 'from-black to-white' },
                                        { name: 'jet', range: 'from-blue-600 via-green-400 to-red-600' },
                                        { name: 'viridis', range: 'from-indigo-900 via-emerald-500 to-yellow-300' },
                                        { name: 'plasma', range: 'from-blue-900 via-fuchsia-500 to-yellow-400' },
                                        { name: 'inferno', range: 'from-black via-red-600 to-yellow-200' }
                                      ].map((cm) => (
                                        <SelectItem key={cm.name} value={cm.name} className="text-xs">
                                          <div className="flex items-center gap-2 w-full">
                                            <div className={`h-2 w-12 rounded-sm bg-gradient-to-r ${cm.range} border border-black/10`} />
                                            <span className="capitalize">{cm.name}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* 🌟 2. 拉伸控制 (Stretch Range) */}
                                <div className="space-y-1 pt-1">
                                  <div className="flex justify-between text-[9px] text-neutral-500 font-bold uppercase">
                                    <span>Stretch Range</span>
                                    <span className="font-mono">{settings.minMax[0]}% - {settings.minMax[1]}%</span>
                                  </div>
                                  <Slider 
                                    value={Array.isArray(settings.minMax) ? settings.minMax : [0, 100]} 
                                    max={100} step={1} 
                                    onValueChange={(val: any) => {
                                      const newArr = Array.isArray(val) ? val : [val, val];
                                      if (setTempViewSettings) {
                                        setTempViewSettings(currentStem, v.id, { ...settings, minMax: newArr });
                                      } else if (updateView) {
                                        updateView(v.id, { settings: { ...settings, minMax: newArr } });
                                      }
                                    }} 
                                  />
                                </div>

                                {/* 🌟 3. 色彩高级调整 (允许对伪彩色进行二次调整) */}
                                {[
                                  { label: 'Brightness', key: 'brightness', default: 1, min: 0.5, max: 2 },
                                  { label: 'Contrast', key: 'contrast', default: 1, min: 0.5, max: 2 },
                                  { label: 'Saturation', key: 'saturation', default: 1, min: 0, max: 2 }
                                ].map((item) => {
                                  const val = (settings as any)[item.key] ?? item.default;
                                  return (
                                    <div key={item.key} className="space-y-1 pt-1">
                                      <div className="flex justify-between text-[9px] text-neutral-500 uppercase">
                                        <span>{item.label}</span>
                                        <span className="font-mono">{val}</span>
                                      </div>
                                      <Slider 
                                        value={Array.isArray(val) ? val : [val]} 
                                        min={item.min} max={item.max} step={0.1} 
                                        onValueChange={(val: any) => {
                                          const newVal = Array.isArray(val) ? val[0] : val;
                                          if (setTempViewSettings) {
                                            setTempViewSettings(currentStem, v.id, { ...settings, [item.key]: newVal });
                                          } else if (updateView) {
                                            updateView(v.id, { settings: { ...settings, [item.key]: newVal } });
                                          }
                                        }} 
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {[
                                  { label: 'Brightness', key: 'brightness', default: 1, min: 0.5, max: 2 },
                                  { label: 'Contrast', key: 'contrast', default: 1, min: 0.5, max: 2 },
                                  { label: 'Saturation', key: 'saturation', default: 1, min: 0, max: 2 }
                                ].map((item) => {
                                  const val = (settings as any)[item.key] ?? item.default;
                                  return (
                                    <div key={item.key} className="space-y-1">
                                      <div className="flex justify-between text-[9px] text-neutral-500 uppercase">
                                        <span>{item.label}</span>
                                        <span className="font-mono">{val}</span>
                                      </div>
                                      <Slider 
                                        value={Array.isArray(val) ? val : [val]} 
                                        min={item.min} max={item.max} step={0.1} 
                                        onValueChange={(val: any) => {
                                          // 🌟 核心修复：防止组件返回单个数字导致解构为 undefined
                                          const newVal = Array.isArray(val) ? val[0] : val;
                                          
                                          if (setTempViewSettings) {
                                            setTempViewSettings(currentStem, v.id, { ...settings, [item.key]: newVal });
                                          } else if (updateView) {
                                            // 🌟 兜底保障：即使你的 useStore 没写暂态，也能降级保存生效
                                            updateView(v.id, { settings: { ...settings, [item.key]: newVal } });
                                          }
                                        }} 
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* 🌟 Apply To All & Reset 按钮区 */}
                            <div className="pt-2 mt-2 border-t border-neutral-200 dark:border-neutral-700/50 flex justify-between items-center animate-in fade-in">
                              <span className="text-[9px] text-neutral-400">
                                {hasLocalChanges ? '* Current image only' : 'Saved to Project Meta'}
                              </span>
                              
                              <div className="flex items-center gap-1.5">
                                {/* 🌟 新增：Reset 按钮 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // 🌟 统一提取默认值（单波段现在也支持明暗调整了）
                                    const defaultSettings = v.bands?.length === 1 
                                      ? { minMax: [0, 100], brightness: 1, contrast: 1, saturation: 1 } 
                                      : { brightness: 1, contrast: 1, saturation: 1 };
                                    
                                    // 写入暂态！这会让它只对当前图像生效，并且让 hasLocalChanges 变为 true，从而点亮 Apply 按钮！
                                    if (setTempViewSettings) setTempViewSettings(currentStem, v.id, defaultSettings);
                                  }}
                                  className="text-[9px] font-bold px-2 py-1.5 rounded transition-all bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-300"
                                  title="Reset to default settings (current image only)"
                                >
                                  Reset
                                </button>

                                {/* 🌟 升级：Apply to All 并触发保存 */}
                                <button
                                  onClick={async (e) => { 
                                    e.stopPropagation(); 
                                    
                                    // 1. 触发应用到所有 (将暂态写入全局)
                                    if (applyViewSettingsToAll) applyViewSettingsToAll(currentStem, v.id); 
                                    
                                    // 2. 自动呼出保存 JSON 对话框
                                    try {
                                      // 动态引入你已经在 DataPreload 中使用过的 projectUtils
                                      const { generateProjectMetaConfig } = await import('../../../lib/projectUtils');
                                      const state = useStore.getState(); // 获取写入后的最新状态
                                      const projectMeta = generateProjectMetaConfig(state);
                                      const jsonStr = JSON.stringify(projectMeta, null, 2);
                                      
                                      // 调用原生文件保存 API (和你的 DataPreload.tsx 逻辑一致)
                                      if ('showSaveFilePicker' in window) {
                                        const handle = await (window as any).showSaveFilePicker({
                                          suggestedName: `${state.projectName || 'project'}_meta.json`,
                                          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
                                        });
                                        const writable = await handle.createWritable();
                                        await writable.write(jsonStr);
                                        await writable.close();
                                      } else {
                                        // 兜底：传统下载方式
                                        const blob = new Blob([jsonStr], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `${state.projectName || 'project'}_meta.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      }
                                    } catch (err) {
                                      console.warn("Export cancelled or failed", err);
                                    }
                                  }}
                                  className={`text-[9px] font-bold px-2.5 py-1.5 rounded transition-all ${
                                    hasLocalChanges 
                                      ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm' 
                                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                                  }`}
                                  disabled={!hasLocalChanges}
                                  title="Apply current color settings to all images in this view and save"
                                >
                                  Apply to All
                                </button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}


                </div>
              );
            })}
          </div>
        )}

        {/* 3. Global VLM Description */}
        {currentStem && (
          <>
            <SectionHeader 
              title="Image Description (VLM)" icon={Database} 
              isExpanded={expanded.vlm} onToggle={() => toggleSection('vlm')} 
            />
            {expanded.vlm && (
              <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900/30">
                <textarea 
                  className="w-full h-16 text-xs p-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 focus:ring-1 focus:ring-primary resize-none custom-scrollbar"
                  placeholder="Describe the entire scene for Vision-Language Models..."
                  value={currentMeta?.text || ''}
                  onChange={(e) => updateStemMetadata(currentStem, { text: e.target.value })}
                />
                <div className="mt-2">
                  <Label className="text-[10px] text-neutral-400 mb-1 block">Image Tags</Label>
                  <Input 
                    className="h-7 text-xs" placeholder="city, sunny, crowded..."
                    value={currentMeta?.tags?.join(', ') || ''}
                    onChange={(e) => updateStemMetadata(currentStem, { tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* 4. Active Object Editor (仅选中时显示 Header 和 内容) */}
        {activeAnnotationId && (
          <>
            <SectionHeader 
              title={t('workspace.editorTitle')} icon={Edit3} 
              isExpanded={expanded.editor} onToggle={() => toggleSection('editor')} 
              colorClass="text-blue-500"
            />
            {expanded.editor && (
              <div className="p-3 space-y-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-blue-50/50 dark:bg-blue-900/10 transition-all animate-in fade-in">
                {(() => {
                  const activeAnno = annotations.find((a: any) => a.id === activeAnnotationId);
                  if (!activeAnno) return null;
                  return (
                    <>
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
                          <Input value={activeAnno.text || ''} onChange={(e) => updateAnnotation(activeAnno.id, { text: e.target.value })} className="h-7 text-xs bg-white dark:bg-neutral-900" placeholder="Object text..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-neutral-500">Group ID</Label>
                          <Input type="number" className="h-7 text-xs bg-white dark:bg-neutral-900" value={activeAnno.group_id || ''} onChange={(e) => updateAnnotation(activeAnno.id, { group_id: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-neutral-500">Track ID</Label>
                          <Input type="number" className="h-7 text-xs bg-white dark:bg-neutral-900" value={activeAnno.track_id || ''} onChange={(e) => updateAnnotation(activeAnno.id, { track_id: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                      </div>
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
                      {taxonomyAttributes && taxonomyAttributes.length > 0 && (
                        <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800">
                          <Label className="text-[10px] text-neutral-500 mb-2 block uppercase tracking-wider">{t('workspace.attributes')}</Label>
                          <div className="space-y-2.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                            {taxonomyAttributes.map((attr: any) => (
                              <div key={attr.id} className="flex items-center justify-between">
                                <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate mr-2">{attr.name}</span>
                                {attr.options ? (
                                  <Select value={activeAnno.attributes?.[attr.name] as string || attr.defaultValue} onValueChange={(val) => updateAnnotation(activeAnno.id, { attributes: { ...(activeAnno.attributes || {}), [attr.name]: val } })}>
                                    <SelectTrigger className="w-28 h-6 text-[10px] bg-neutral-50 dark:bg-neutral-950"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {attr.options.map((opt: string) => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input value={activeAnno.attributes?.[attr.name] as string || ''} onChange={(e) => updateAnnotation(activeAnno.id, { attributes: { ...(activeAnno.attributes || {}), [attr.name]: e.target.value } })} className="w-24 h-6 text-xs bg-white dark:bg-neutral-950" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* 5. Objects List (设置为 Flex-1 充满剩余空间) */}
        <SectionHeader 
          title={t('workspace.objects')} icon={Square} 
          isExpanded={expanded.objects} onToggle={() => toggleSection('objects')} 
          badge={currentAnnotations.length}
        />
        {expanded.objects && (
          <div className="max-h-[40vh] overflow-y-auto p-2 space-y-1 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/30 custom-scrollbar">
            {currentAnnotations.map((ann: any) => {
              const clsDef = taxonomyClasses.find((c: any) => c.name === ann.label);
              const color = clsDef?.color || '#3B82F6';
              const isActive = ann.id === activeAnnotationId;
              
              return (
                <div 
                  key={ann.id} onClick={() => setActiveAnnotationId(ann.id)}
                  className={`group p-2 rounded border text-[11px] flex items-center justify-between cursor-pointer transition-all ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-700 dark:text-blue-400 shadow-sm' : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-medium truncate max-w-[150px]">
                      {ann.label} {ann.difficult && <AlertTriangle className="w-3 h-3 inline text-red-500 ml-1"/>}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" size="icon" 
                    className="w-6 h-6 shrink-0 opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      const targetAnno = currentAnnotations.find((a: any) => a.id === ann.id);
                      if (targetAnno) pushAction({ type: 'delete', anno: targetAnno });
                      removeAnnotation(ann.id); 
                      if(isActive) setActiveAnnotationId(null); 
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
            {currentAnnotations.length === 0 && (
               <div className="text-center py-4 text-[10px] text-neutral-400">No objects found</div>
            )}
          </div>
        )}

        {/* 6. Scene Groups (最大高度限制) */}
        <SectionHeader 
          title={t('workspace.scenegroup')} icon={ImageIcon} 
          isExpanded={expanded.scenes} onToggle={() => toggleSection('scenes')} 
          badge={stems.length}
        />
        {expanded.scenes && (
          <div className="max-h-[25vh] overflow-y-auto p-2 space-y-1 bg-neutral-100 dark:bg-black/20 custom-scrollbar shrink-0">
            {stems.map((stem: string) => (
              <button
                key={stem}
                onClick={() => { setCurrentStem(stem); setActiveAnnotationId(null); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] rounded transition-all flex items-center justify-between group ${
                  currentStem === stem ? 'bg-blue-600 text-white shadow-md font-bold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="font-mono truncate">{stem}</span>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}