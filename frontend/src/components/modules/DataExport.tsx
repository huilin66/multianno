import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Download, Folder, Target, GripVertical, Lock, Image as ImageIcon, Copy, FileText } from 'lucide-react';
import { FileExplorerDialog } from './FileExplorerDialog';
import { processDataExchange, getFileContent } from '../../api/client';

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
const EXTENSION_MAP: Record<string, string> = {
  yolo: '.txt',
  coco: '.json',
  multianno: '.json'
};
// 🌟 任务到格式的映射逻辑
const TASK_TO_FORMATS: Record<string, string[]> = {
  object_detection: ['yolo', 'coco', 'multianno'],
  instance_segmentation: ['yolo', 'coco', 'multianno'],
  semantic_segmentation: ['multianno', 'images_only']
};
export function DataExport({ onClose }: { onClose?: () => void }) {
  const { folders, taxonomyClasses = [] } = useStore() as any;
  const safeSaveDirs = folders?.map((f: any) => f.path).filter(Boolean) || [];

  // 1. 基础配置状态
  const [taskType, setTaskType] = useState('object_detection');
  const [format, setFormat] = useState('yolo');
  const [targetDir, setTargetDir] = useState('');
  const [customSuffix, setCustomSuffix] = useState('');
  const [extension, setExtension] = useState('.jpg');
  // 2. 类别选择与排序状态 (核心优化)
  const [exportClasses, setExportClasses] = useState<any[]>([]);
  const [yoloClassSource, setYoloClassSource] = useState<'current' | 'file'>('current');
  const [externalClassFile, setExternalClassFile] = useState('');
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [explorerOpen, setExplorerOpen] = useState(false);

  // 初始化类别列表：background 默认不选，其他默认选
  // 🌟 初始化类别列表：background 默认置顶且不勾选，其他保持原序
  useEffect(() => {
    // 1. 先映射出带有 selected 属性的数组
    const mappedClasses = taxonomyClasses.map((c: any) => ({
      ...c,
      selected: c.name.toLowerCase() !== 'background'
    }));

    // 2. 排序：强制把 background 提到 index 0
    const sortedClasses = mappedClasses.sort((a: any, b: any) => {
      const isABg = a.name.toLowerCase() === 'background';
      const isBBg = b.name.toLowerCase() === 'background';
      if (isABg && !isBBg) return -1; // a 是背景，a 排前面
      if (!isABg && isBBg) return 1;  // b 是背景，b 排前面
      return 0; // 其他类别保持原有的相对顺序不变
    });

    setExportClasses(sortedClasses);
  }, [taxonomyClasses]);
// 🌟 当任务改变时，校验并重置格式
  useEffect(() => {
    const available = TASK_TO_FORMATS[taskType];
    if (!available.includes(format)) {
      setFormat(available[0]);
    }
  }, [taskType]);
  // 🌟 当格式改变时，自动将 extension 重置为该格式支持的第一个后缀
  useEffect(() => {
    if (format === 'yolo') setExtension('.txt');
    else if (format === 'coco' || format === 'multianno') setExtension('.json');
    else if (format === 'images_only' && !['.jpg', '.png', '.tif', '.bmp'].includes(extension)) {
      setExtension('.jpg'); 
    }
  }, [format]);
  // 类别拖拽排序逻辑 (简单实现)
  const moveClass = (dragIndex: number, hoverIndex: number) => {
    const draggedItem = exportClasses[dragIndex];
    const newList = [...exportClasses];
    newList.splice(dragIndex, 1);
    newList.splice(hoverIndex, 0, draggedItem);
    setExportClasses(newList);
  };
// 🌟 新增：读取外部 classes.txt 并联动右侧列表
  const handleLoadClassFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // 按行分割，去掉首尾空格和空行
      const importedNames = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      
      const existingNames = taxonomyClasses.map((c: any) => c.name);
      
      // 校验：是否有不在现有 taxonomy 中的类别
      const missing = importedNames.filter(name => !existingNames.includes(name));
      if (missing.length > 0) {
        alert(`❌ 加载失败！以下类别不在当前项目中：\n${missing.join(', ')}`);
        return;
      }

      // 如果完全匹配，开始重排右侧列表
      const newExportClasses: any[] = [];
      
      // 1. 优先按 classes.txt 的顺序压入数组，并设为勾选
      importedNames.forEach(name => {
        const match = taxonomyClasses.find((c: any) => c.name === name);
        if (match) newExportClasses.push({ ...match, selected: true });
      });

      // 2. 将剩余的、没在 classes.txt 里出现的类别放到底部，并取消勾选
      taxonomyClasses.forEach((c: any) => {
        if (!importedNames.includes(c.name)) {
          newExportClasses.push({ ...c, selected: false });
        }
      });

      setExportClasses(newExportClasses);
      alert(`✅ 成功加载并应用了 ${importedNames.length} 个类别顺序！`);
    };
    reader.readAsText(file);
    
    // 清空 input，允许用户反复上传同一个文件
    e.target.value = '';
  };
  const handleExecute = async () => {
    if (!targetDir) return alert("请选择目标路径");
    
    const selectedClassNames = exportClasses.filter(c => c.selected).map(c => c.name);

    const payload = {
      source_dirs: safeSaveDirs,
      target_dir: targetDir,
      task_type: taskType,
      format,
      mode: 'export' as const,
      selected_classes: selectedClassNames,
      custom_suffix: customSuffix, 
      extension: extension,  // 👈 🌟 恢复：直接用状态里最新的后缀名
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

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 p-6 max-w-3xl mx-auto w-full overflow-y-auto space-y-6">
      <h2 className="text-xl font-black flex items-center gap-2"><Download /> 导出标注数据</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* 左侧：任务与格式配置 */}
        <div className="space-y-4">
          <section className="p-4 bg-white dark:bg-neutral-900 rounded-lg border shadow-sm space-y-4">
            <Label className="text-xs font-bold text-neutral-400">1. 任务与格式</Label>
            
            {/* 第一行：任务 */}
            <div className="flex items-center gap-3">
              <Label className="w-10 text-right text-xs font-bold">任务：</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className="flex-1"><span className="font-bold">{TASK_EN_DISPLAY[taskType]}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="object_detection">目标检测 (Object Detection)</SelectItem>
                  <SelectItem value="instance_segmentation">实例分割 (Instance Segmentation)</SelectItem>
                  <SelectItem value="semantic_segmentation">语义分割 (Semantic Segmentation)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 第二行：格式 */}
            <div className="flex items-center gap-3">
              <Label className="w-10 text-right text-xs font-bold">格式：</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="flex-1">
                  <span className="font-bold">{FORMAT_EN_DISPLAY[format]}</span>
                </SelectTrigger>
                <SelectContent>
                  {/* 🌟 动态渲染当前任务支持的格式 */}
                  {TASK_TO_FORMATS[taskType].includes('yolo') && (
                    <SelectItem value="yolo">YOLO 格式</SelectItem>
                  )}
                  {TASK_TO_FORMATS[taskType].includes('coco') && (
                    <SelectItem value="coco">COCO 格式</SelectItem>
                  )}
                  {TASK_TO_FORMATS[taskType].includes('multianno') && (
                    <SelectItem value="multianno">MultiAnno (文件夹复制)</SelectItem>
                  )}
                  {TASK_TO_FORMATS[taskType].includes('images_only') && (
                    <SelectItem value="images_only">纯图像导出 (Images Only)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              {/* 第三行：说明标签 */}
              <div className="flex gap-2">
                <Label className="flex-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Scene Group 后缀 (可选)</Label>
                <Label className="w-[100px] text-[10px] font-bold text-neutral-500 uppercase tracking-wider">标注格式</Label>
              </div>

              {/* 第四行：输入框与动态下拉框 */}
              <div className="flex gap-2">
                <Input 
                  placeholder="例如: _v2" 
                  value={customSuffix} 
                  onChange={(e) => setCustomSuffix(e.target.value)} 
                  className="flex-1 h-9 text-xs font-bold"
                />
                
                {/* 🌟 统一使用下拉框，只渲染当前格式支持的选项 */}
                <Select value={extension} onValueChange={setExtension}>
                  <SelectTrigger className="w-[100px] h-9 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
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

              {/* 第五行：实时示例演示 */}
              <div className="p-2.5 mt-2 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-100 dark:border-blue-900/30">
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  以 "scene001" 为例，最终保存文件名为：<br/>
                  <strong className="text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                    scene001<span className="text-amber-600 dark:text-amber-400">{customSuffix}</span>
                    {/* 🌟 直接读取 extension 状态即可 */}
                    {extension}
                  </strong>
                </p>
              </div>

            </div>
          </section>

          <section className="p-4 bg-white dark:bg-neutral-900 rounded-lg border shadow-sm space-y-3">
            <Label className="text-xs font-bold text-neutral-400">2. 存储路径</Label>
            <Button variant="outline" className="w-full justify-start text-xs truncate" onClick={() => { setExplorerMode('dir'); setExplorerOpen(true); }}>
              <Folder className="w-4 h-4 mr-2 text-blue-500" /> {targetDir || "选择导出文件夹..."}
            </Button>
            
            {format === 'yolo' && (
              <div className="pt-2 border-t space-y-2">
                <Label className="text-[11px] font-bold">YOLO 类别定义 (Class.txt)</Label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" checked={yoloClassSource === 'current'} onChange={() => setYoloClassSource('current')} /> 使用右侧顺序
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" checked={yoloClassSource === 'file'} onChange={() => setYoloClassSource('file')} /> 加载外部文件
                  </label>
                </div>
                
                {/* 🌟 替换为原生的文件上传控件 */}
                {yoloClassSource === 'file' && (
                  <Button 
                    variant="outline" 
                    className="w-full h-8 text-[10px] border-dashed" 
                    onClick={() => { setExplorerMode('file'); setExplorerOpen(true); }}
                  >
                    <FileText className="w-3 h-3 mr-2 text-amber-500" />
                    {externalClassFile ? externalClassFile.split('/').pop() : "选择服务器上的 classes.txt"}
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>

        {/* 右侧：类别选择与排序 */}
        <div className="space-y-2">
          <Label className="text-xs font-bold text-neutral-400 flex justify-between">
            3. 类别选择与排序 (拖拽调整顺序)
            <span className="text-[10px] font-normal">顺序决定 YOLO/Image pixel ID</span>
          </Label>
          <div className="bg-white dark:bg-neutral-900 border rounded-lg p-2 min-h-[300px] space-y-1">
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
                className={`flex items-center gap-2 p-2 rounded border group transition-all ${cls.selected ? 'bg-white dark:bg-neutral-800' : 'bg-neutral-50 opacity-60'}`}
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
                <span className="text-xs font-bold truncate flex-1">{cls.name}</span>
                <span className="text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 italic">ID: {index}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Button size="lg" className="w-full font-black mt-4 shadow-lg" onClick={handleExecute}>
        执行数据导出任务
      </Button>

      <FileExplorerDialog 
        open={explorerOpen} 
        initialPath="/" 
        selectType={explorerMode}
        onClose={() => setExplorerOpen(false)} 
        onConfirm={async (paths) => {
          if (explorerMode === 'dir') {
            setTargetDir(paths[0]);
          } else {
            // 🌟 核心逻辑：选择 classes.txt 后的处理
            setExternalClassFile(paths[0]);
            try {
              const { content } = await getFileContent(paths[0]);
              // 这里的解析逻辑和你之前的 handleLoadClassFile 一模一样
              const importedNames = content.split(/\r?\n/).map((l:any) => l.trim()).filter(Boolean);
              
              // 校验与排序 (同上一轮逻辑)
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