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
  Eye, Square, AlertTriangle, Trash2, Image as ImageIcon, Frame,
  Hexagon, CircleDot, Activity, Circle, Diamond, Box, Pencil, Cloud, 
  Tag, Type, Hash, Route, EyeOff, Check, X, Scan, MapPin, Copy
} from 'lucide-react';
import { Slider } from '../../ui/slider';
import { COLOR_MAPS } from '../../../config/colors';
import { ObjectEditorForm } from './ObjectEditorForm'; // 🌟 引入新组件

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
  hiddenAnnotations: string[];
  toggleAnnotationVisibility: (id: string) => void;
}

export function RightPanel({ 
  tool, showFullExtent, toggleFullExtent, pushAction, 
  focusedViewId, setFocusedViewId,
  layerOrder, setLayerOrder,
  visibleLayers, setVisibleLayers,
  hiddenAnnotations, toggleAnnotationVisibility,
}: RightPanelProps) {
  const { t } = useTranslation();
  
  const { 
    folders, views, annotations, updateAnnotation, removeAnnotation, 
    stems, currentStem, setCurrentStem, taxonomyClasses, taxonomyAttributes, 
    activeAnnotationId, setActiveAnnotationId, setActiveModule, updateStemMetadata, currentMeta,
    updateView, tempViewSettings, setTempViewSettings, applyViewSettingsToAll, addTaxonomyClass,
    hiddenClasses, setHiddenClasses, toggleClassVisibility, classOrder, viewport, setViewport,
  } = useStore() as any;

  const sortedClasses = React.useMemo(() => 
    [...(taxonomyClasses || [])].sort((a: any, b: any) => 
      (classOrder || []).indexOf(a.id) - (classOrder || []).indexOf(b.id)
    ),
    [taxonomyClasses, classOrder]
  );

  const [taxonomyPanelOpen, setTaxonomyPanelOpen] = React.useState(false);
  const [taxonomyTab, setTaxonomyTab] = React.useState<'classes' | 'attributes'>('classes');

  // 🌟 核心修复：智能类别发现引擎 (Auto-Discover Missing Classes)
  // 当导入外部数据后，如果标注中出现了全新未注册的 label，自动将其补全到全局 Taxonomy 中
  React.useEffect(() => {
    // 确保数据和函数已就绪
    if (!annotations || annotations.length === 0 || !taxonomyClasses || !addTaxonomyClass) return;

    const existingNames = new Set(taxonomyClasses.map((c: any) => c.name));
    const missingLabels = new Set<string>();

    // 1. 扫描内存中所有的标注，提取未知的 label
    annotations.forEach((anno: any) => {
      if (anno.label && !existingNames.has(anno.label)) {
        missingLabels.add(anno.label);
      }
    });

    // 2. 如果存在未知类别，自动注册并分配颜色
    if (missingLabels.size > 0) {
      // 预设一套好看的备选颜色库
      const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#6366f1'];
      
      missingLabels.forEach((label) => {
        const newId = `class-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        // 根据当前已有类别的数量取余，分配一个确定性的颜色
        const color = DEFAULT_COLORS[existingNames.size % DEFAULT_COLORS.length];
        
        addTaxonomyClass({ id: newId, name: label, color: color });
        existingNames.add(label); // 立即更新 Set，防止同一次循环内分配相同颜色
      });
    }
  }, [annotations, taxonomyClasses, addTaxonomyClass]);
  const [openLayerId, setOpenLayerId] = React.useState<string | null>(null);

  // 控制各个板块的展开状态
  const [expanded, setExpanded] = React.useState({
    layers: true,
    vlm: false,      // VLM 默认收起
    classes: true,
    editor: true,    // 编辑器默认展开
    objects: true,
    scenes: false    // 场景列表较长，默认收起
  });

  const [confirmDeleteAll, setConfirmDeleteAll] = React.useState(false);

  const [nmsPanelOpen, setNmsPanelOpen] = React.useState(false);
  const [nmsMode, setNmsMode] = React.useState<'iou' | 'ios'>('ios');
  const [nmsThreshold, setNmsThreshold] = React.useState(80);
  // 核心数据结构：{ annoId: { groupName: 'OP_1', isMaster: boolean } }
  const [nmsGroups, setNmsGroups] = React.useState<Record<string, { groupName: string, isMaster: boolean }>>({});
  const [hasScanned, setHasScanned] = React.useState(false);
  const [showHiddenObjects, setShowHiddenObjects] = React.useState(false);
  const toggleSection = (section: keyof typeof expanded) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const SectionHeader = ({ title, icon: Icon, isExpanded, onToggle, badge, colorClass, actionNode }: any) => (
    <div 
      onClick={onToggle}
      className={`p-2.5 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors shrink-0 ${
        isExpanded ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-neutral-950'  // ← 背景改为蓝色调
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${isExpanded ? 'text-blue-500' : 'text-neutral-400'}`} />
        <h3 className={`font-bold text-[10px] uppercase tracking-wider ${
          isExpanded ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500'  // ← 改这里
        }`}>
          {title}
        </h3>
        {badge !== undefined && (
          <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-mono ${
            isExpanded 
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'  // ← badge 也变蓝
              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
          }`}>
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actionNode && (
          <div onClick={(e) => e.stopPropagation()}>
            {actionNode}
          </div>
        )}
        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${
          isExpanded ? 'rotate-90 text-blue-500' : 'text-neutral-400'  // ← 箭头也变蓝
        }`} />
      </div>
    </div>
  );
  const currentAnnotations = annotations.filter((a: any) => a.stem === currentStem);

  const handleResetNms = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNmsGroups({});
    setHasScanned(false);
    // 这里如果需要通知 Canvas 取消高亮，也可以在此处理
  };

// 工具 1：提取对象的 BBox (兼容各类图形)
  const getBBoxFromPoints = (points: {x: number, y: number}[]) => {
    if (!points || points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
  };

  // 工具 2：计算重叠度
  const calculateOverlap = (box1: any, box2: any, mode: 'iou' | 'ios') => {
    if (!box1 || !box2) return 0;
    const xA = Math.max(box1.minX, box2.minX);
    const yA = Math.max(box1.minY, box2.minY);
    const xB = Math.min(box1.maxX, box2.maxX);
    const yB = Math.min(box1.maxY, box2.maxY);

    const interW = Math.max(0, xB - xA);
    const interH = Math.max(0, yB - yA);
    const interArea = interW * interH;

    if (interArea === 0) return 0;

    if (mode === 'ios') {
      return interArea / Math.min(box1.area, box2.area); // 交小比 (针对嵌套)
    }
    return interArea / (box1.area + box2.area - interArea); // 交并比
  };

  // 🌟 工具：计算重叠并分组 (连通分量算法)
  const handleScanOverlaps = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentAnnos = annotations.filter((a: any) => a.stem === currentStem);
    if (currentAnnos.length < 2) {
      setHasScanned(true); // 即使没法扫（数量不够），也标记为扫过
      setNmsGroups({});
      return;
    }

    const candidates = currentAnnos.map(a => ({
      id: a.id,
      bbox: getBBoxFromPoints(a.points) // 复用之前的 BBox 提取函数
    })).filter(c => c.bbox);

    // 构建邻接表
    const adj: Record<string, string[]> = {};
    candidates.forEach(c => adj[c.id] = []);
    
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const overlap = calculateOverlap(candidates[i].bbox, candidates[j].bbox, nmsMode);
        if (overlap >= nmsThreshold / 100) {
          adj[candidates[i].id].push(candidates[j].id);
          adj[candidates[j].id].push(candidates[i].id);
        }
      }
    }

    // 寻找连通分量 (BFS)
    const visited = new Set<string>();
    const newGroups: Record<string, { groupName: string, isMaster: boolean }> = {};
    let groupCount = 0;

    candidates.forEach(c => {
      if (!visited.has(c.id) && adj[c.id].length > 0) {
        groupCount++;
        const component: string[] = [];
        const queue = [c.id];
        visited.add(c.id);
        
        while (queue.length > 0) {
          const curr = queue.shift()!;
          component.push(curr);
          adj[curr].forEach(neighbor => {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          });
        }

        // 组内决策：面积最大的作为 Master
        component.sort((a, b) => {
          const boxA = candidates.find(cand => cand.id === a)!.bbox;
          const boxB = candidates.find(cand => cand.id === b)!.bbox;
          return (boxB?.area || 0) - (boxA?.area || 0);
        });

        component.forEach((id, idx) => {
          newGroups[id] = { groupName: `OP_${groupCount}`, isMaster: idx === 0 };
        });
      }
    });

    setNmsGroups(newGroups);
    setHasScanned(true); // 🌟 标记扫描已完成
  };

  const handleDeleteOverlaps = () => {
    const idsToDelete = Object.keys(nmsGroups).filter(id => !nmsGroups[id].isMaster);
    idsToDelete.forEach(id => {
      const target = annotations.find((a: any) => a.id === id);
      if (target) pushAction({ type: 'delete', anno: target });
      removeAnnotation(id);
    });
    setNmsGroups({});
    setNmsPanelOpen(false);
  };

  const zoomToAnnotation = (ann: any) => {
    if (!ann.points || ann.points.length === 0) return;
    
    // 计算包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ann.points.forEach((p: any) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    
    const objW = maxX - minX;
    const objH = maxY - minY;
    const objCX = (minX + maxX) / 2;
    const objCY = (minY + maxY) / 2;
    
    // 找 Canvas 尺寸
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    
    // 计算缩放比（留 20% 边距）
    const padding = 0.8;
    const zoom = Math.min((viewW * padding) / objW, (viewH * padding) / objH, 10);
    
    // 居中
    const panX = (viewW / 2) - objCX * zoom;
    const panY = (viewH / 2) - objCY * zoom;
    
    setViewport(zoom, panX, panY);
    setActiveAnnotationId(ann.id);
  };
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
          <div className="p-2 space-y-1 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900/30 max-h-[228px]">
            {/* 🌟 需求 2：按照 layerOrder 排序渲染 */}
            {[...views].sort((a, b) => layerOrder.indexOf(a.id) - layerOrder.indexOf(b.id)).map((v: any) => {
              const originalIndex = views.findIndex((orig: any) => orig.id === v.id);
              
              // 🌟 获取 DIY 配置，兜底默认值
              const settings = v.settings || { brightness: 1, contrast: 1, saturation: 1, minMax: [0, 100] };
              const isOpen = openLayerId === v.id;
              
              return (
                <div key={v.id} className="flex flex-col bg-white dark:bg-neutral-900/50 rounded border border-neutral-200 dark:border-neutral-800/50 mb-1">
                  
                  {/* === 图层头部（拖拽、基础操作） === */}
                  <div className="flex items-center justify-between p-1.5 gap-2 hover:border-blue-400 transition-colors h-[36px]">
                    
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
                        {v.bands?.length === 3 ? (
                          <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded shadow-sm">
                            {/* 🌟 三色图标：模拟 RGB 通道叠加效果 */}
                            <div className="flex -space-x-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-[#FF0000] border border-black/10 shadow-sm" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#00FF00] border border-black/10 shadow-sm" />
                              <div className="w-2.5 h-2.5 rounded-full bg-[#0000FF] border border-black/10 shadow-sm" />
                            </div>
                            <span className="text-blue-500 font-bold text-[9px] ml-0.5">RGB</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded shadow-sm">
                            {/* 🌟 读取全局配置中的 CSS 渐变 */}
                            <div className={`w-3.5 h-2.5 rounded-sm bg-gradient-to-r ${COLOR_MAPS.find(c => c.name === (v.colormap || 'gray'))?.css || 'from-black to-white'} border border-black/10`} />
                            <span className="text-purple-500 font-bold text-[9px] uppercase">
                              {v.colormap || 'gray'}
                            </span>
                          </div>
                        )}
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
                                {/* 🌟 0. 现有的 Colormap 选择器 (二值化时自动置灰) */}
                                <div className={`flex justify-between items-center bg-white dark:bg-neutral-900/40 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700/50 transition-opacity ${settings.binarize?.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                                  <span className="text-[9px] text-neutral-500 font-bold uppercase">Color Map</span>
                                  <Select 
                                      value={v.colormap || 'gray'} 
                                      onValueChange={(val: any) => updateView(v.id, { colormap: val })}
                                    >
                                      <SelectTrigger className="h-6 w-[130px] text-[10px] bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-700">
                                        {/* 🌟 核心修复：让选中的值也带有色带预览 */}
                                        <div className="flex items-center gap-2">
                                          <div className={`h-2.5 w-6 rounded-sm shadow-sm bg-gradient-to-r ${COLOR_MAPS.find(c => c.name === (v.colormap || 'gray'))?.css || 'from-black to-white'}`} />
                                          <SelectValue />
                                        </div>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {COLOR_MAPS.map((cm) => (
                                          <SelectItem key={cm.name} value={cm.name} className="text-xs">
                                            <div className="flex items-center gap-2 w-full">
                                              {/* 列表里的预览 */}
                                              <div className={`h-2 w-12 rounded-sm bg-gradient-to-r ${cm.css} border border-black/10`} />
                                              <span className="capitalize">{cm.label}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                </div>

                                {/* 🌟 1. 现有的 Stretch Range (非 manual 模式时置灰锁定) */}
                                <div className={`space-y-1 pt-1 transition-opacity ${settings.enhancementMode && settings.enhancementMode !== 'manual' ? 'opacity-40 pointer-events-none' : ''}`}>
                                  <div className="flex justify-between text-[9px] text-neutral-500 font-bold uppercase">
                                    <span>Stretch Range</span>
                                    <span className="font-mono">{settings.minMax?.[0] ?? 0}% - {settings.minMax?.[1] ?? 100}%</span>
                                  </div>
                                  <Slider 
                                    disabled={settings.enhancementMode && settings.enhancementMode !== 'manual'}
                                    value={Array.isArray(settings.minMax) ? settings.minMax : [0, 100]} 
                                    max={100} step={1} 
                                    onValueChange={(val: any) => {
                                      const newArr = Array.isArray(val) ? val : [val, val];
                                      if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, minMax: newArr });
                                    }} 
                                  />
                                </div>

                                {/* 🌟 2. 现有的 B/C/S 三剑客 */}
                                {[
                                  { label: 'Brightness', key: 'brightness', default: 1, min: 0.5, max: 2 },
                                  { label: 'Contrast', key: 'contrast', default: 1, min: 0.5, max: 2 },
                                  { label: 'Saturation', key: 'saturation', default: 1, min: 0, max: 2 }
                                ].map((item) => {
                                  const val = (settings as any)[item.key] ?? item.default;
                                  return (
                                    <div key={item.key} className={`space-y-1 pt-1 transition-opacity ${settings.binarize?.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                                      <div className="flex justify-between text-[9px] text-neutral-500 uppercase">
                                        <span>{item.label}</span>
                                        <span className="font-mono">{val}</span>
                                      </div>
                                      <Slider 
                                        value={Array.isArray(val) ? val : [val]} 
                                        min={item.min} max={item.max} step={0.1} 
                                        onValueChange={(val: any) => {
                                          const newVal = Array.isArray(val) ? val[0] : val;
                                          if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, [item.key]: newVal });
                                        }} 
                                      />
                                    </div>
                                  );
                                })}

                                <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-3" />

                                {/* 🌟 新增行 1：Gamma Correction (二值化时置灰) */}
                                <div className={`space-y-1 transition-opacity ${settings.binarize?.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                                  <div className="flex justify-between text-[9px] text-blue-500 font-bold uppercase">
                                    <span>Gamma Correction</span>
                                    <span className="font-mono">{(settings.gamma ?? 1.0).toFixed(1)}</span>
                                  </div>
                                  <Slider 
                                    value={[settings.gamma ?? 1.0]} min={0.1} max={3.0} step={0.1}
                                    onValueChange={(val: any) => {
                                      // 🌟 修复：兼容数字或数组
                                      const newVal = Array.isArray(val) ? val[0] : val;
                                      if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, gamma: newVal });
                                    }}
                                  />
                                </div>

                                {/* 🌟 新增行 2：空间滤波 + 反相 + 二值化 */}
                                <div className="flex gap-1.5 pt-2">
                                  <Button 
                                    variant={settings.spatialFilter === 'sharpen' ? 'default' : 'outline'}
                                    className={`h-6 text-[9px] flex-1 px-1 font-bold ${settings.spatialFilter === 'sharpen' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, spatialFilter: settings.spatialFilter === 'sharpen' ? 'none' : 'sharpen' });
                                    }}
                                  >Sharpen</Button>
                                  <Button 
                                    variant={settings.invert ? 'default' : 'outline'}
                                    className={`h-6 text-[9px] flex-1 px-1 font-bold ${settings.invert ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, invert: !settings.invert });
                                    }}
                                  >Invert</Button>
                                  <Button 
                                    variant={settings.binarize?.enabled ? 'default' : 'outline'}
                                    className={`h-6 text-[9px] flex-1 px-1 font-bold ${settings.binarize?.enabled ? 'bg-red-500 hover:bg-red-600 text-white border-transparent' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, binarize: { threshold: 128, ...settings.binarize, enabled: !settings.binarize?.enabled } });
                                    }}
                                  >Binarize</Button>
                                </div>

                                {/* 🎯 隐藏福利：如果开启了二值化，自动弹出阈值调节滑块 */}
                                {settings.binarize?.enabled && (
                                   <div className="space-y-1 pt-1 animate-in fade-in zoom-in-95 duration-200">
                                     <div className="flex justify-between text-[9px] text-red-500 font-bold uppercase">
                                       <span>Threshold (Binarize)</span>
                                       <span className="font-mono">{settings.binarize.threshold}</span>
                                     </div>
                                     <Slider
                                       value={[settings.binarize.threshold ?? 128]} min={0} max={255} step={1}
                                       className="[&_[role=slider]]:bg-red-500 [&_[data-orientation=horizontal]]:bg-red-200"
                                       onValueChange={(val: any) => {
                                         // 🌟 修复：兼容数字或数组
                                         const newVal = Array.isArray(val) ? val[0] : val;
                                         if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, binarize: { ...settings.binarize, threshold: newVal } });
                                       }}
                                     />
                                   </div>
                                )}

                                {/* 🌟 新增行 3：对比度映射单选框 (二值化时置灰) */}
                                <div className={`pt-2 transition-opacity ${settings.binarize?.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                                  <div className="text-[9px] text-blue-500 uppercase font-bold mb-1.5">Contrast Mapping Mode</div>
                                  <div className="grid grid-cols-3 gap-1 bg-white dark:bg-neutral-900/50 p-1.5 rounded border border-neutral-200 dark:border-neutral-700/50">
                                    {['manual', 'he', 'clahe'].map((mode) => (
                                      <label key={mode} className="flex flex-col items-center justify-center gap-1 cursor-pointer py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors">
                                        <input 
                                          type="radio" name={`mode-${v.id}`} 
                                          checked={settings.enhancementMode === mode || (!settings.enhancementMode && mode === 'manual')}
                                          onChange={() => {
                                            if (setTempViewSettings) setTempViewSettings(currentStem, v.id, { ...settings, enhancementMode: mode });
                                          }}
                                          className="accent-blue-500 w-3 h-3"
                                        />
                                        <span className="text-[9px] uppercase font-bold text-center leading-tight">
                                          {mode === 'manual' ? 'Manual\nStretch' : mode === 'he' ? 'Global\nHE' : 'Auto\nCLAHE'}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
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

                            {/* 🌟 底部操作区：Reset & Apply to All */}
                            <div className="pt-3 mt-3 border-t border-neutral-200 dark:border-neutral-700/50 flex justify-between items-center animate-in fade-in">
                              <span className="text-[9px] text-neutral-400">
                                {hasLocalChanges ? '* Current image only' : 'Saved to Project Meta'}
                              </span>
                              
                              <div className="flex items-center gap-1.5">
                                {/* 🌟 1. Reset 按钮 (完美支持单波段科研参数与多波段归位) */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // 提取所有参数的初始默认值
                                    const defaultSettings = v.bands?.length === 1 
                                      ? { 
                                          minMax: [0, 100], brightness: 1, contrast: 1, saturation: 1,
                                          gamma: 1.0, enhancementMode: 'manual', spatialFilter: 'none', 
                                          invert: false, binarize: { enabled: false, threshold: 128 }
                                        } 
                                      : { brightness: 1, contrast: 1, saturation: 1 };
                                    
                                    // 写入暂态，瞬间重置当前图像，并点亮 Apply 按钮
                                    if (setTempViewSettings) setTempViewSettings(currentStem, v.id, defaultSettings);
                                  }}
                                  className="text-[9px] font-bold px-2 py-1.5 rounded transition-all bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-300"
                                  title="Reset to default settings (current image only)"
                                >
                                  Reset
                                </button>

                                {/* 🌟 2. Apply to All 按钮 */}
                                <button
                                  onClick={async (e) => { 
                                    e.stopPropagation(); 
                                    
                                    // 1. 触发应用到所有
                                    if (applyViewSettingsToAll) applyViewSettingsToAll(currentStem, v.id); 
                                    
                                    // 2. 自动呼出保存 JSON 对话框
                                    try {
                                      const { generateProjectMetaConfig } = await import('../../../lib/projectUtils');
                                      const state = useStore.getState(); 
                                      const projectMeta = generateProjectMetaConfig(state);
                                      const jsonStr = JSON.stringify(projectMeta, null, 2);
                                      
                                      if ('showSaveFilePicker' in window) {
                                        const handle = await (window as any).showSaveFilePicker({
                                          suggestedName: `${state.projectName || 'project'}_meta.json`,
                                          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
                                        });
                                        const writable = await handle.createWritable();
                                        await writable.write(jsonStr);
                                        await writable.close();
                                      } else {
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
                                  title="Apply current settings to all images and save"
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

        {/* === 🌟 Taxonomy Manager === */}
        <SectionHeader 
          title={t('workspace.taxonomy', 'Taxonomy')} 
          icon={Tag} 
          isExpanded={expanded.taxonomy} 
          onToggle={() => toggleSection('taxonomy')} 
          colorClass="text-violet-500"
        />

        {expanded.taxonomy && (
          <div className="border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900/30">
            {/* Tab Switcher */}
            <div className="flex bg-neutral-100 dark:bg-black/20 p-1 mx-2 mt-2 rounded-lg">
              <button
                onClick={() => setTaxonomyTab('classes')}
                className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${
                  taxonomyTab === 'classes'
                    ? 'bg-white dark:bg-neutral-800 text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Classes ({taxonomyClasses?.length || 0})
              </button>
              <button
                onClick={() => setTaxonomyTab('attributes')}
                className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${
                  taxonomyTab === 'attributes'
                    ? 'bg-white dark:bg-neutral-800 text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Attributes ({taxonomyAttributes?.length || 0})
              </button>
            </div>

            {/* === Classes Tab === */}
            {taxonomyTab === 'classes' && (
              <div className="max-h-[40vh] overflow-y-auto custom-scrollbar p-2 space-y-1 max-h-[228px]">
                {/* Quick Actions */}
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => setHiddenClasses([])}
                    className="flex-1 text-[9px] font-bold px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors h-[40px]"
                  >
                    Show All
                  </button>
                  <button
                    onClick={() => setHiddenClasses(taxonomyClasses?.map((c: any) => c.name) || [])}
                    className="flex-1 text-[9px] font-bold px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    Hide All
                  </button>
                </div>

                {sortedClasses.map((cls: any) => {
                  const isHidden = hiddenClasses.includes(cls.name);
                  const count = currentAnnotations.filter((a: any) => a.label === cls.name).length;

                  return (
                    <div
                      key={cls.id}
                      onClick={() => toggleClassVisibility(cls.name)}
                      className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${
                        isHidden
                          ? 'bg-neutral-100/50 dark:bg-neutral-900/20 border-neutral-100 dark:border-neutral-800/30 opacity-50'
                          : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      {/* Color Swatch */}
                      <div
                        className="w-4 h-4 rounded-md shrink-0 ring-1 ring-black/10"
                        style={{ backgroundColor: cls.color || '#3B82F6' }}
                      />
                      
                      {/* Class Name */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-medium truncate ${
                          isHidden 
                            ? 'text-neutral-400 dark:text-neutral-500' 
                            : 'text-neutral-700 dark:text-neutral-300'
                        }`}>
                          {cls.name}
                        </div>
                        {cls.description && (
                          <div className="text-[9px] text-neutral-400 truncate">{cls.description}</div>
                        )}
                      </div>

                      {/* Instance Count */}
                      <span className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-full ${
                        isHidden
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                          : 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                      }`}>
                        {count}
                      </span>

                      {/* 🌟 统一的眼睛开关 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleClassVisibility(cls.name);
                        }}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-all shrink-0 ${
                          isHidden
                            ? 'text-neutral-300 dark:text-neutral-600 hover:text-neutral-500'
                            : 'text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        }`}
                        title={isHidden ? 'Show class' : 'Hide class'}
                      >
                        {isHidden ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}

                {(!taxonomyClasses || taxonomyClasses.length === 0) && (
                  <div className="text-center py-6 text-[11px] text-neutral-400">
                    <Tag className="w-5 h-5 mx-auto mb-2 opacity-50" />
                    No classes defined yet
                  </div>
                )}
              </div>
            )}

            {/* === Attributes Tab === */}
            {taxonomyTab === 'attributes' && (
              <div className="max-h-[40vh] overflow-y-auto custom-scrollbar p-2 space-y-2 max-h-[228px]">
                {taxonomyAttributes?.map((attr: any) => {
                  // Calculate value distribution for current scene
                  const valueCounts: Record<string, number> = {};
                  currentAnnotations.forEach((a: any) => {
                    const val = a.attributes?.[attr.name] || '(unset)';
                    valueCounts[val] = (valueCounts[val] || 0) + 1;
                  });

                  return (
                    <div
                      key={attr.id}
                      className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                    >
                      {/* Attribute Header */}
                      <div className="flex items-center gap-2 p-2.5 bg-neutral-50 dark:bg-black/20 border-b border-neutral-100 dark:border-neutral-800/50">
                        <Type className="w-3.5 h-3.5 text-amber-500" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 truncate">
                            {attr.name}
                          </div>
                          <div className="text-[9px] text-neutral-400 uppercase">
                            {attr.type}
                            {attr.applyToAll && ' · Apply to All'}
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-neutral-400">
                          {Object.keys(valueCounts).length} values
                        </span>
                      </div>

                      {/* Value Tree */}
                      <div className="p-1">
                        {Object.entries(valueCounts)
                          .sort(([, a], [, b]) => b - a)
                          .map(([value, count]) => (
                            <div
                              key={value}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors"
                            >
                              {/* Tree line */}
                              <div className="w-3 flex justify-center">
                                <div className="w-px h-3 bg-neutral-300 dark:bg-neutral-700" />
                              </div>
                              
                              {/* Value name */}
                              <span className="text-[10px] text-neutral-600 dark:text-neutral-400 truncate flex-1">
                                {value}
                              </span>
                              
                              {/* Count badge */}
                              <span className="text-[9px] font-mono text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full">
                                {count}
                              </span>
                            </div>
                          ))}
                      </div>

                      {Object.keys(valueCounts).length === 0 && (
                        <div className="text-center py-3 text-[10px] text-neutral-400">
                          No instances in current scene
                        </div>
                      )}
                    </div>
                  );
                })}

                {(!taxonomyAttributes || taxonomyAttributes.length === 0) && (
                  <div className="text-center py-6 text-[11px] text-neutral-400">
                    <Hash className="w-5 h-5 mx-auto mb-2 opacity-50" />
                    No attributes defined yet
                  </div>
                )}
              </div>
            )}
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
          <>
            <SectionHeader 
              title={t('workspace.editorTitle')} icon={Edit3} 
              isExpanded={expanded.editor} onToggle={() => toggleSection('editor')} 
              colorClass="text-blue-500"
            />
            {expanded.editor && (
              <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900/30 transition-all animate-in fade-in relative">
                {(() => {
                  const activeAnno = annotations.find((a: any) => a.id === activeAnnotationId);
                  
                  // 🌟 没有选中时显示空状态
                  if (!activeAnno) {
                    return (
                      <div className="text-center py-4 text-[11px] text-neutral-400">
                        <Edit3 className="w-5 h-5 mx-auto mb-2 opacity-50" />
                        {t('workspace.selectObjectHint', 'Select an object to edit')}
                      </div>
                    );
                  }
                  
                  const activeClassDef = taxonomyClasses.find((c: any) => c.name === activeAnno.label);
                  const activeColor = activeClassDef?.color || '#3B82F6';

                  return (
                    <div className="pl-2">
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 transition-colors duration-300" style={{ backgroundColor: activeColor }} />
                      
                      <ObjectEditorForm 
                        label={activeAnno.label} onLabelChange={(val) => updateAnnotation(activeAnno.id, { label: val })}
                        text={activeAnno.text || ''} onTextChange={(val) => updateAnnotation(activeAnno.id, { text: val })}
                        groupId={activeAnno.group_id || ''} onGroupIdChange={(val) => updateAnnotation(activeAnno.id, { group_id: val ? Number(val) : null })}
                        trackId={activeAnno.track_id || ''} onTrackIdChange={(val) => updateAnnotation(activeAnno.id, { track_id: val ? Number(val) : null })}
                        difficult={!!activeAnno.difficult} onDifficultChange={(val) => updateAnnotation(activeAnno.id, { difficult: val })}
                        occluded={!!activeAnno.occluded} onOccludedChange={(val) => updateAnnotation(activeAnno.id, { occluded: val })}
                        truncated={!!activeAnno.truncated} onTruncatedChange={(val) => updateAnnotation(activeAnno.id, { truncated: val })}
                        attributes={activeAnno.attributes || {}} onAttributesChange={(val) => updateAnnotation(activeAnno.id, { attributes: val })}
                        taxonomyClasses={sortedClasses} taxonomyAttributes={taxonomyAttributes} activeColor={activeColor}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </>

        {/* 5. Objects List (设置为 Flex-1 充满剩余空间) */}
        <SectionHeader 
          title={t('workspace.objects')} icon={Square} 
          isExpanded={expanded.objects} onToggle={() => toggleSection('objects')} 
          badge={currentAnnotations.filter((a: any) => !hiddenClasses.includes(a.label)).length}
          actionNode={
            currentAnnotations.length > 0 && (
              <div className="flex items-center gap-1">{/* 🌟 显示/隐藏已隐藏的对象 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHiddenObjects(prev => !prev);
                }}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  showHiddenObjects 
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40' 
                    : 'text-neutral-400 hover:text-amber-500'
                }`}
                title={showHiddenObjects ? "Hide hidden objects" : "Show hidden objects"}
              >
                {showHiddenObjects ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                  onClick={(e) => { e.stopPropagation(); setNmsPanelOpen(!nmsPanelOpen); }}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${nmsPanelOpen || hasScanned ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40' : 'text-neutral-400 hover:text-blue-500'}`}
                  title="Find Overlapping Objects"
                >
                  <Copy className="w-3.5 h-3.5" /> {/* 🌟 修改为交叠矩形图标 */}
                </button>

                {confirmDeleteAll ? (
                  // 🛡️ 点击后展开的原地确认菜单
                  <div className="flex items-center gap-1 bg-red-100 dark:bg-red-900/40 rounded px-1 animate-in fade-in zoom-in-95">
                    <span className="text-[9px] text-red-600 font-bold px-1 uppercase tracking-wider">Sure?</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // 只有点 绿钩 才会真正删除！
                        currentAnnotations.forEach((anno: any) => removeAnnotation(anno.id));
                        setActiveAnnotationId(null);
                        setConfirmDeleteAll(false);
                      }}
                      className="w-5 h-5 flex items-center justify-center text-red-600 hover:bg-red-200 dark:hover:bg-red-800/60 rounded transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // 点 X 取消操作，恢复垃圾桶
                        setConfirmDeleteAll(false);
                      }}
                      className="w-5 h-5 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  // 默认状态下的垃圾桶图标
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 点击垃圾桶，激活二次确认 UI
                      setConfirmDeleteAll(true);
                    }}
                    className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                    title="Delete All Objects in Current Image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          }
        />
        {expanded.objects && (

          <div className="flex flex-col max-h-[50vh]">
          {/* 🌟 2. 嵌入式 Overlap Cleaner 面板 */}
          {/* 🌟 Overlap Cleaner 面板 (独立一级，类似 Editor) */}
          {nmsPanelOpen && (
            <div className="mx-2 mt-2 mb-1 p-3 bg-white dark:bg-neutral-900 rounded-md border border-blue-200 dark:border-blue-900/50 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase text-blue-600 flex items-center gap-1.5">
                  <Copy className="w-3 h-3" /> Overlap Cleaner
                </span>
                <button onClick={() => setNmsPanelOpen(false)}><X className="w-3 h-3 text-neutral-400" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                  <label className="text-[9px] text-neutral-500 font-bold uppercase">Metric</label>
                  <Select value={nmsMode} onValueChange={(v: any) => setNmsMode(v)}>
                    <SelectTrigger className="h-7 text-[10px] font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ios" className="text-[10px]">IoS (Nested)</SelectItem>
                      <SelectItem value="iou" className="text-[10px]">IoU (Standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-neutral-500 font-bold uppercase">
                    <span>Threshold</span>
                    <span className="text-blue-600 font-mono">{nmsThreshold}%</span>
                  </div>
                  <Slider value={[nmsThreshold]} min={10} max={100} step={1} onValueChange={(v) => setNmsThreshold(v[0])} />
                </div>
              </div>

              {/* 🌟 动态按钮区域 */}
              {!hasScanned ? (
                <Button className="w-full h-8 text-[11px] font-bold bg-blue-600 hover:bg-blue-700" onClick={handleScanOverlaps}>
                  Scan Overlapping Objects
                </Button>
              ) : (
                <div className="flex gap-2">
                  {Object.values(nmsGroups).filter((g: any) => !g.isMaster).length > 0 ? (
                    <Button className="flex-1 h-8 text-[11px] font-bold bg-red-600 hover:bg-red-700" onClick={handleDeleteOverlaps}>
                      Delete {Object.values(nmsGroups).filter((g: any) => !g.isMaster).length} Masks
                    </Button>
                  ) : (
                    <Button disabled className="flex-1 h-8 text-[11px] font-bold bg-neutral-100 text-neutral-400 border border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700">
                      Found 0 Overlaps
                    </Button>
                  )}
                  <Button variant="outline" className="h-8 px-3 text-[11px] font-bold" onClick={handleResetNms}>
                    Reset
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="max-h-[40vh] overflow-y-auto p-2 space-y-1 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/30 custom-scrollbar max-h-[228px]">
            {currentAnnotations
            .filter((ann: any) => showHiddenObjects || !hiddenClasses.includes(ann.label))
            .map((ann: any) => {
              const clsDef = taxonomyClasses.find((c: any) => c.name === ann.label);
              const color = clsDef?.color || '#3B82F6';
              const isActive = ann.id === activeAnnotationId;

              const classHidden = hiddenClasses.includes(ann.label);
              const individuallyHidden = hiddenAnnotations.includes(ann.id);
              const isHidden = classHidden || individuallyHidden;

              const groupInfo = nmsGroups[ann.id];
              const isRedundant = groupInfo && !groupInfo.isMaster;
              const isMaster = groupInfo && groupInfo.isMaster;
              
              // 🌟 新增：根据标注类型映射对应的 Icon 组件
              const getShapeIcon = (type: string) => {
                switch (type) {
                  case 'bbox': return Square;
                  case 'polygon': return Hexagon;
                  case 'point': return CircleDot;
                  case 'line': return Activity;
                  case 'ellipse': 
                  case 'circle': return Circle;
                  case 'oriented_bbox': return Diamond;
                  case 'cuboid': return Box;
                  case 'lasso': return Pencil;
                  case 'freemask': return Cloud;
                  default: return Square;
                }
              };
              const ShapeIcon = getShapeIcon(ann.type);

              return (
                <div 
                  key={ann.id} 
                  onClick={() => setActiveAnnotationId(ann.id)}
                  onDoubleClick={() => {
                    setActiveAnnotationId(ann.id);
                    setExpanded(prev => ({ ...prev, editor: true }));
                  }}
                  className={`group p-2 rounded border text-[11px] flex items-center justify-between transition-all h-[40px] ${
                    isHidden
                      ? 'opacity-40 bg-neutral-100/50 dark:bg-neutral-900/20'
                      : isRedundant 
                        ? 'bg-red-50/50 dark:bg-red-900/10 border-red-300' 
                        : (groupInfo?.isMaster 
                            ? 'bg-blue-50/30 dark:bg-blue-900/10 border-blue-300' 
                            : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800')
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    <ShapeIcon 
                      className={`w-3.5 h-3.5 shrink-0 ml-0.5 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400'}`} 
                      title={`Type: ${ann.type}`}
                    />
                    {ann.difficult && <AlertTriangle className="w-3.5 h-3.5 inline text-orange-500 shrink-0 ml-0.5" title="Difficult"/>}
                    
                    {/* 🌟 渲染组标签 */}
                    {groupInfo && (
                      <span className={`px-1 rounded-[2px] text-[8px] font-bold shrink-0 ${groupInfo.isMaster ? 'bg-blue-500 text-white' : 'bg-neutral-400 text-white'}`}>
                        {groupInfo.groupName}
                      </span>
                    )}
                    <span className={`truncate font-medium ${isRedundant ? 'line-through text-red-600/60' : ''}`}>
                      {ann.label}
                    </span>
                  </div>

                  {/* 🌟 紧凑操作按钮组：眼睛 + 删除 — 始终可见 */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* 定位按钮 */}
                  <Button 
                    variant="ghost" size="icon" 
                    className="w-6 h-6 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    onClick={(e) => { 
                      e.stopPropagation();
                      zoomToAnnotation(ann);
                    }}
                    title="Zoom to object"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                  </Button>
                  {/* 眼睛开关 */}
                  <Button 
                    variant="ghost" size="icon" 
                    className={`w-6 h-6 transition-all ${
                      hiddenAnnotations.includes(ann.id)
                        ? 'text-neutral-300 dark:text-neutral-600'
                        : 'text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      toggleAnnotationVisibility(ann.id); 
                    }}
                    title={isHidden ? "Show object" : "Hide object"}
                    // title={hiddenAnnotations.includes(ann.id) ? "Show object" : "Hide object"}
                  >
                    {hiddenAnnotations.includes(ann.id) ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>

                  {/* 删除按钮 */}
                  <Button 
                    variant="ghost" size="icon" 
                    className="w-6 h-6 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
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
                </div>
              );
            })}
            {currentAnnotations.length === 0 && (
               <div className="text-center py-4 text-[10px] text-neutral-400">No objects found</div>
            )}
          </div>
          </div>
        )}

        {/* 6. Scene Groups (最大高度限制) */}
        <SectionHeader 
          title={t('workspace.scenegroup')} icon={ImageIcon} 
          isExpanded={expanded.scenes} onToggle={() => toggleSection('scenes')} 
          badge={currentStem ? `${stems.indexOf(currentStem) + 1}/${stems.length}` : `0/${stems.length}`}
        />
        {expanded.scenes && (
          <div className="max-h-[25vh] overflow-y-auto p-2 space-y-1 bg-neutral-100 dark:bg-black/20 custom-scrollbar shrink-0 max-h-[228px]">
            {stems.map((stem: string) => {
              // 🌟 核心：计算该场景下包含多少个标注对象
              const annoCount = annotations.filter((a: any) => a.stem === stem).length;

              return (
                <button
                  key={stem}
                  onClick={() => { setCurrentStem(stem); setActiveAnnotationId(null); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] rounded transition-all flex items-center justify-between group h-[40px] ${
                    currentStem === stem ? 'bg-blue-600 text-white shadow-md font-bold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                  }`}
                >
                  {/* 左侧：文件名 */}
                  <span className="font-mono truncate pr-2" title={stem}>{stem}</span>
                  
                  {/* 🌟 右侧：新增的标注数量 Badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 transition-colors ${
                    currentStem === stem 
                      ? 'bg-white/20 text-white' 
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
                  }`}>
                    {annoCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}