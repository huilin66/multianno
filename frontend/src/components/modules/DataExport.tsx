import React, { useState, useEffect } from 'react';
import { useStore, Annotation } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Download, Folder, GripVertical, FileText, RotateCcw } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { exportData, getFileContent } from '../../api/client';
import { SUPPORTED_TASKS, FORMAT_DETAILS, TaskType } from '../../config/supportedFormats';


// --- 🌟 1. 静态字典与映射配置 ---
const ALL_SHAPES: Annotation['type'][] = [
  'bbox', 'polygon', 'ellipse', 'circle', 'oriented_bbox', 
  'cuboid', 'keypoints', 'point', 'line'
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
  const { folders, views, taxonomyClasses = [] } = useStore() as any;
  const mainViewFolder = folders?.find((f: any) => 
    f.id === views?.find((v: any) => v.isMain)?.folderId
  ) || folders?.[0];
  
  const workspacePath = useStore(s => s.workspacePath);
  const safeWorkspacePath = workspacePath || mainViewFolder?.path || '';

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
  
  // 🌟 提取初始化类别的函数（用于首次加载和重置按钮）
  const resetClasses = () => {
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
    setExternalClassFile('');
    setYoloClassSource('current');
  };

  useEffect(() => {
    resetClasses();
  }, [taxonomyClasses]);

  useEffect(() => {
    const available = SUPPORTED_TASKS[taskType as TaskType].formats;
    if (!available.includes(format)) setFormat(available[0]);
    
    const mapping = TASK_MAPPINGS[taskType];
    const newSelection: Record<string, boolean> = {};
    ALL_SHAPES.forEach(shape => {
      newSelection[shape] = mapping[shape] !== 'incompatible';
    });
    setShapeSelection(newSelection);
  }, [taskType]);

  useEffect(() => {
    const detail = FORMAT_DETAILS[format];
    if (detail && !detail.extensions.includes(extension)) {
      setExtension(detail.defaultExtension);
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
      source_dirs: [safeWorkspacePath],
      target_dir: targetDir,
      task_type: taskType,
      format,
      selected_classes: selectedClassNames,
      custom_suffix: customSuffix, 
      extension: extension,
      allowed_shapes: allowedShapes,
      generate_report: generateReport,
    };

    try {
      const res = await exportData(payload); // 🌟 改用 exportData
      alert(`导出成功: ${res.message}`);
      if (onClose) onClose();
    } catch (err: any) {
      alert(`导出失败: ${err.message}`);
    }
  };

  // 🌟 动态计算有效勾选项的名称列表，用于分配 ID
  const checkedNames = exportClasses.filter(c => c.selected).map(c => c.name);

  // --- UI 渲染 ---
  return (
    // 🌟 外层容器改为 overflow-hidden，禁止整体滚动
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 w-full overflow-hidden">
      
      {/* 🌟 冻结的顶部标题栏 */}
      <div className="shrink-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto w-full">
          <h2 className="text-xl font-black flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
            <Download className="text-blue-500" /> 导出标注数据
          </h2>
        </div>
      </div>

      {/* 🌟 内部独立滚动区域 */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-5xl mx-auto w-full space-y-6">

          {/* 1. 任务与格式 (两栏宽) */}
          <section className="p-5 bg-white dark:bg-neutral-900 rounded-xl border shadow-sm space-y-4">
            <Label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">1. 任务与格式配置 (Task & Format)</Label>
            <div className="grid grid-cols-2 gap-8">
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="w-12 text-right text-xs font-bold">任务：</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{SUPPORTED_TASKS[taskType as TaskType]?.label}</span></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUPPORTED_TASKS).map(([id, t]) => (
                        <SelectItem key={id} value={id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-12 text-right text-xs font-bold">格式：</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger className="flex-1 font-bold"><span className="font-bold">{FORMAT_DETAILS[format]?.label}</span></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_TASKS[taskType as TaskType]?.formats.map(fId => (
                        <SelectItem key={fId} value={fId}>{FORMAT_DETAILS[fId].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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
                      {FORMAT_DETAILS[format]?.extensions.map(ext => (
                        <SelectItem key={ext} value={ext}>{ext}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </div>
            <div className="p-2.5 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-100 dark:border-blue-900/30 text-[10px] text-neutral-500 font-mono text-center">
              预览文件名: scene001<span className="text-amber-600 dark:text-amber-400">{customSuffix}</span>{extension}
            </div>
          </section>

          {/* 2. Shape筛选 与 类别排序 */}
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
                3. 类别规则 (拖拽排序) <span className="text-[9px] font-normal normal-case">基于勾选动态分配 ID</span>
              </Label>
              <div className="flex-1 overflow-y-auto pr-2 space-y-1.5">
                {exportClasses.map((cls, index) => {
                  // 🌟 动态获取当前勾选状态下的视觉 ID
                  const displayId = cls.selected ? checkedNames.indexOf(cls.name) : '-';

                  return (
                    <div 
                      key={cls.name} 
                      draggable 
                      onDragStart={(e) => e.dataTransfer.setData('index', index.toString())} 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const fromIndex = parseInt(e.dataTransfer.getData('index'));
                        moveClass(fromIndex, index);
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded border transition-all ${
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
                      
                      {/* 🌟 显示真实的过滤后 ID */}
                      <span className={`text-[11px] w-8 text-right italic ${cls.selected ? 'text-amber-600 font-black' : 'text-neutral-400 font-medium'}`}>
                        ID:{displayId}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* 3. 存储路径 与 生成报告 */}
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
                    
                    {/* 🌟 重新布局：一长一短按钮搭配 */}
                    <div className="flex gap-2">
                      {yoloClassSource === 'file' ? (
                        <Button variant="ghost" className="flex-1 h-8 text-[10px] border-dashed border" onClick={() => { setExplorerMode('file'); setExplorerOpen(true); }}>
                          <FileText className="w-3 h-3 mr-2 text-amber-500 shrink-0" />
                          <span className="truncate">{externalClassFile ? externalClassFile.split('/').pop() : "加载 classes.txt"}</span>
                        </Button>
                      ) : (
                        <div className="flex-1" />
                      )}
                      
                      {/* 🌟 独立的重置按钮 */}
                      <Button 
                        variant="outline" 
                        className="h-8 px-3 text-[10px] text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 transition-colors" 
                        onClick={resetClasses}
                        title="恢复类别的初始顺序和勾选状态"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        重置
                      </Button>
                    </div>
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

          {/* 4. 执行按钮 */}
          <Button 
            size="lg" 
            className="w-full font-black py-7 shadow-xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white transition-all mt-4 mb-8" 
            onClick={handleExecute}
          >
            启动数据导出引擎
          </Button>
        </div>
      </div>

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