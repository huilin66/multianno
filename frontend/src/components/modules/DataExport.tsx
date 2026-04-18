import React, { useState, useEffect } from 'react';
import { useStore, Annotation } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Download, Folder, GripVertical, FileText } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { processDataExchange, getFileContent } from '../../api/client';

// --- 🌟 1. 静态字典与映射配置 ---

const TASK_EN_DISPLAY: Record<string, string> = {
  object_detection: 'Object Detection',
  instance_segmentation: 'Instance Segmentation',
  semantic_segmentation: 'Semantic Segmentation'
};

const FORMAT_EN_DISPLAY: Record<string, string> = {
  yolo: 'YOLO Format',
  coco: 'COCO Format',
  multianno: 'MultiAnno Copy',
  images_only: 'Images Only'
};


const TASK_TO_FORMATS: Record<string, string[]> = {
  object_detection: ['yolo', 'coco', 'multianno'],
  instance_segmentation: ['yolo', 'coco', 'multianno'],
  semantic_segmentation: ['multianno', 'images_only']
};

// 🌟 2. 使用 Annotation['type'] 强绑定类型，并将 point 和 line 移到最后
const ALL_SHAPES: Annotation['type'][] = [
  'bbox', 'polygon', 'oriented_bbox', 
  'cuboid', 'ellipse', 'circle',  'keypoints', 'point', 'line'
];

type ShapeStatus = 'native' | 'convertible' | 'incompatible';

const TASK_MAPPINGS: Record<string, Record<string, ShapeStatus>> = {
  object_detection: {
    bbox: 'native', oriented_bbox: 'convertible', polygon: 'convertible', ellipse: 'convertible', circle: 'convertible', cuboid: 'convertible', point: 'incompatible', line: 'incompatible', keypoints: 'incompatible'
  },
  instance_segmentation: {
    polygon: 'native', bbox: 'convertible', ellipse: 'convertible', circle: 'convertible', oriented_bbox: 'convertible', point: 'incompatible', line: 'incompatible', cuboid: 'incompatible', keypoints: 'incompatible'
  },
  semantic_segmentation: {
    polygon: 'native', bbox: 'convertible', ellipse: 'convertible', circle: 'convertible', oriented_bbox: 'convertible', point: 'incompatible', line: 'incompatible', cuboid: 'incompatible', keypoints: 'incompatible'
  }
};

// --- 🌟 2. 主组件 ---

export function DataExport({ onClose }: { onClose?: () => void }) {
  const { folders, taxonomyClasses = [] } = useStore() as any;
  const safeSaveDirs = folders?.map((f: any) => f.path).filter(Boolean) || [];

  // --- 状态定义 ---
  const [taskType, setTaskType] = useState('object_detection');
  const [format, setFormat] = useState('yolo');
  const [targetDir, setTargetDir] = useState('');
  
  const [customSuffix, setCustomSuffix] = useState(''); 
  const [extension, setExtension] = useState('.txt');
  
  const [exportClasses, setExportClasses] = useState<any[]>([]);
  const [shapeSelection, setShapeSelection] = useState<Record<string, boolean>>({});
  
  const [yoloClassSource, setYoloClassSource] = useState<'current' | 'file'>('current');
  const [externalClassFile, setExternalClassFile] = useState('');
  
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [generateReport, setGenerateReport] = useState(true);

  // --- 联动钩子 (Hooks) ---

  // 1. 初始化类别列表：background 默认置顶且不勾选
  useEffect(() => {
    const mappedClasses = taxonomyClasses.map((c: any) => ({
      ...c, selected: c.name.toLowerCase() !== 'background'
    }));
    const sortedClasses = mappedClasses.sort((a: any, b: any) => {
      const isABg = a.name.toLowerCase() === 'background';
      const isBBg = b.name.toLowerCase() === 'background';
      if (isABg && !isBBg) return -1;
      if (!isABg && isBBg) return 1;
      return 0;
    });
    setExportClasses(sortedClasses);
  }, [taxonomyClasses]);

  // 2. 任务切换 -> 格式防错 + Shape 状态重算
  useEffect(() => {
    // 检查并重置非法格式
    const available = TASK_TO_FORMATS[taskType];
    if (!available.includes(format)) {
      setFormat(available[0]);
    }
    // 重新计算 Shape 的允许状态
    const mapping = TASK_MAPPINGS[taskType];
    const newSelection: Record<string, boolean> = {};
    ALL_SHAPES.forEach(shape => {
      newSelection[shape] = mapping[shape] !== 'incompatible';
    });
    setShapeSelection(newSelection);
  }, [taskType]);

  // 3. 格式切换 -> 后缀名智能切换
  useEffect(() => {
    if (format === 'yolo') setExtension('.txt');
    else if (format === 'coco' || format === 'multianno') setExtension('.json');
    else if (format === 'images_only' && !['.jpg', '.png', '.tif', '.bmp'].includes(extension)) {
      setExtension('.jpg'); 
    }
  }, [format]);

  // --- 动作函数 ---

  const moveClass = (dragIndex: number, hoverIndex: number) => {
    const draggedItem = exportClasses[dragIndex];
    const newList = [...exportClasses];
    newList.splice(dragIndex, 1);
    newList.splice(hoverIndex, 0, draggedItem);
    setExportClasses(newList);
  };

  const handleExecute = async () => {
    if (!targetDir) return alert("请选择目标路径");
    
    const selectedClassNames = exportClasses.filter(c => c.selected).map(c => c.name);
    const allowedShapes = Object.entries(shapeSelection).filter(([_, checked]) => checked).map(([s]) => s);

    const payload = {
        source_dirs: safeSaveDirs,
        target_dir: targetDir,
        task_type: taskType,
        format,
        mode: 'export' as const,
        selected_classes: selectedClassNames,
        custom_suffix: customSuffix, 
        
        // 🌟 直接使用当前组件状态里的 extension 即可！
        extension: extension, 
        
        allowed_shapes: allowedShapes,
        generate_report: generateReport,
        yolo_config: format === 'yolo' ? { source: yoloClassSource, file: externalClassFile } : null
    };

    try {
      const res = await processDataExchange(payload);
      alert(`导出成功: ${res.message}`);
      if (onClose) onClose();
    } catch (err: any) {
      alert(`导出失败: ${err.message}`);
    }
  };

  // --- UI 渲染 ---
  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 p-6 max-w-5xl mx-auto w-full overflow-y-auto space-y-6">
      <h2 className="text-xl font-black flex items-center gap-2 mb-2"><Download /> 导出标注数据</h2>

      {/* 🌟 1. 任务与格式 (两栏宽) */}
      <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
        <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">1. 任务与格式配置 (Task & Format)</Label>
        <div className="grid grid-cols-2 gap-8">
          
          {/* 左侧：任务与格式 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="w-12 text-right text-xs font-bold">任务：</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{TASK_EN_DISPLAY[taskType]}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="object_detection">目标检测 (Object Detection)</SelectItem>
                  <SelectItem value="instance_segmentation">实例分割 (Instance Segmentation)</SelectItem>
                  <SelectItem value="semantic_segmentation">语义分割 (Semantic Segmentation)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Label className="w-12 text-right text-xs font-bold">格式：</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{FORMAT_EN_DISPLAY[format]}</span></SelectTrigger>
                <SelectContent>
                  {TASK_TO_FORMATS[taskType].map(f => (
                    <SelectItem key={f} value={f}>{FORMAT_EN_DISPLAY[f] || f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 右侧：后缀与扩展名 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="w-20 text-right text-[11px] font-bold">Scene Suffix：</Label>
              <Input placeholder="例如: _v2" value={customSuffix} onChange={(e) => setCustomSuffix(e.target.value)} className="flex-1 h-9 text-xs font-bold" />
            </div>
            <div className="flex items-center gap-3">
              <Label className="w-20 text-right text-[11px] font-bold">标注格式：</Label>
              <Select value={extension} onValueChange={setExtension}>
                <SelectTrigger className="flex-1 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {format === 'yolo' && <SelectItem value=".txt">.txt</SelectItem>}
                  {(format === 'coco' || format === 'multianno') && <SelectItem value=".json">.json</SelectItem>}
                  {format === 'images_only' && (
                    <>
                      <SelectItem value=".jpg">.jpg</SelectItem>
                      <SelectItem value=".png">.png</SelectItem>
                      <SelectItem value=".tif">.tif</SelectItem>
                      <SelectItem value=".bmp">.bmp</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>
        {/* 实时预览提示 */}
        <div className="p-2.5 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-100 dark:border-blue-900/30 text-[10px] text-neutral-500 font-mono text-center">
          预览文件名: scene001<span className="text-amber-600 dark:text-amber-400">{customSuffix}</span>{extension}
        </div>
      </section>

      {/* 🌟 2. Shape筛选 与 类别排序 (左右分布，等高) */}
      <div className="grid grid-cols-2 gap-6">
        
        {/* 左侧：Shape筛选 */}
        <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-4">2. Shape 过滤与转换</Label>
          <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-2">
            {ALL_SHAPES.map(shape => {
              const status = TASK_MAPPINGS[taskType]?.[shape] || 'incompatible';
              const isChecked = shapeSelection[shape];
              const isDisabled = status === 'incompatible';
              return (
                <div 
                  key={shape} 
                  onClick={() => !isDisabled && setShapeSelection(prev => ({...prev, [shape]: !prev[shape]}))}
                  className={`flex items-center justify-between p-2.5 rounded border transition-all ${
                    isDisabled ? 'opacity-30 bg-neutral-100 dark:bg-neutral-800/50 cursor-not-allowed border-transparent' : 'cursor-pointer hover:border-blue-400 bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} disabled={isDisabled} className="pointer-events-none" />
                    <span className="text-xs font-bold capitalize">{shape.replace('_', ' ')}</span>
                  </div>
                  {status === 'convertible' && !isDisabled && (
                    <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-bold">Auto-Convert</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 右侧：类别排序 */}
        <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-4 flex justify-between">
            3. 类别规则 (拖拽排序) <span className="text-[9px] font-normal normal-case">id is used for yolo/image</span>
          </Label>
          <div className="flex-1 overflow-y-auto pr-2 space-y-1.5">
            {exportClasses.map((cls, index) => (
              <div 
                key={cls.name} 
                draggable 
                onDragStart={(e) => e.dataTransfer.setData('index', index.toString())} 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const fromIndex = parseInt(e.dataTransfer.getData('index'));
                  moveClass(fromIndex, index);
                }}
                className={`flex items-center gap-3 p-2.5 rounded border group transition-all ${
                  cls.selected ? 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700' : 'bg-neutral-50 dark:bg-neutral-900/50 opacity-60 border-transparent'
                }`}
              >
                <GripVertical className="w-4 h-4 text-neutral-300 cursor-grab active:cursor-grabbing" />
                <Checkbox 
                  checked={cls.selected} 
                  onCheckedChange={(val) => {
                    const newList = [...exportClasses];
                    newList[index].selected = !!val;
                    setExportClasses(newList);
                  }} 
                />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                <span className="text-xs font-bold flex-1 truncate">{cls.name}</span>
                <span className="text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 italic">ID: {index}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 🌟 3. 存储路径 与 生成报告 */}
      <section className="grid grid-cols-2 gap-6">
        
        {/* 左侧：存储路径与YOLO配置 */}
        <div className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
          <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">4. 交付设置 (Delivery)</Label>
          <Button variant="outline" className="w-full justify-start text-xs font-bold truncate" onClick={() => { setExplorerMode('dir'); setExplorerOpen(true); }}>
            <Folder className="w-4 h-4 mr-2 text-blue-500 shrink-0" /> {targetDir || "选择存储文件夹..."}
          </Button>
          
          {format === 'yolo' && (
             <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex gap-4">
                   <label className="flex items-center gap-2 text-[11px] font-bold cursor-pointer">
                     <input type="radio" checked={yoloClassSource === 'current'} onChange={() => setYoloClassSource('current')} /> 使用面板顺序
                   </label>
                   <label className="flex items-center gap-2 text-[11px] font-bold cursor-pointer">
                     <input type="radio" checked={yoloClassSource === 'file'} onChange={() => setYoloClassSource('file')} /> 加载外部文件
                   </label>
                </div>
                {yoloClassSource === 'file' && (
                  <Button variant="ghost" className="w-full h-8 text-[10px] border-dashed border" onClick={() => { setExplorerMode('file'); setExplorerOpen(true); }}>
                    <FileText className="w-3 h-3 mr-2 text-amber-500" />
                    {externalClassFile ? externalClassFile.split('/').pop() : "加载 classes.txt"}
                  </Button>
                )}
             </div>
          )}
        </div>

        {/* 右侧：生成报告选项 */}
        <div 
          className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-center gap-3 ${
            generateReport ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30' : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
          }`} 
          onClick={() => setGenerateReport(!generateReport)}
        >
          <div className="flex items-center gap-3">
             <Checkbox checked={generateReport} className="pointer-events-none data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
             <Label className="text-xs font-black text-blue-900 dark:text-blue-100 cursor-pointer">生成详细导出报告 (Export Report)</Label>
          </div>
          <p className="text-[10px] text-blue-700/70 dark:text-blue-300/70 leading-relaxed pl-7">
            自动生成 <code>export_report.txt</code>。详细记录每个场景中 Native、Converted 和 Discarded 形状的具体统计数据，确保数据交付的可追溯性。
          </p>
        </div>
      </section>

      {/* 🌟 4. 执行按钮 */}
      <Button 
        size="lg" 
        className="w-full font-black py-7 shadow-xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white transition-all mt-4" 
        onClick={handleExecute}
      >
        启动数据导出引擎
      </Button>

      {/* --- 弹窗组件 --- */}
      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath="/" 
        selectType={explorerMode}
        onClose={() => setExplorerOpen(false)} 
        onConfirm={async (paths) => {
          if (explorerMode === 'dir') {
            setTargetDir(paths[0]);
          } else {
            setExternalClassFile(paths[0]);
            try {
              const { content } = await getFileContent(paths[0]);
              const importedNames = content.split(/\r?\n/).map((l:any) => l.trim()).filter(Boolean);
              
              const existingNames = taxonomyClasses.map((c: any) => c.name);
              const missing = importedNames.filter((name:any) => !existingNames.includes(name));
              
              if (missing.length > 0) {
                alert(`❌ 类别不匹配：${missing.join(', ')}`);
                return;
              }

              const newExportClasses = [
                ...importedNames.map((name:any) => ({ ...taxonomyClasses.find((c:any) => c.name === name), selected: true })),
                ...taxonomyClasses.filter((c:any) => !importedNames.includes(c.name)).map((c:any) => ({ ...c, selected: false }))
              ];
              setExportClasses(newExportClasses);
            } catch (err) {
              alert("读取文件失败");
            }
          }
          setExplorerOpen(false);
        }} 
      />
    </div>
  );
}