// src/components/modules/AISettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { CloudLightning, Loader2, Save, FolderSearch, History } from 'lucide-react';
import { updateAIConfig } from '../../api/client';
import { FileExplorerDialog } from './FileExplorerDialog'; 

interface AISettingsModalProps { open: boolean; onClose: () => void; }

export function AISettingsModal({ open, onClose }: AISettingsModalProps) {
  const { aiSettings, setAISettings } = useStore() as any;
  const [localSettings, setLocalSettings] = useState(aiSettings);
  const [isVerifying, setIsVerifying] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  
  // 🌟 1. 像 DataPreload 一样，使用本地 state 维护历史记录
  const [recentPaths, setRecentPaths] = useState<string[]>([]);

  // 🌟 2. 弹窗打开时，同步设置并读取 localStorage 里的历史记录
  useEffect(() => { 
    if (open) {
      setLocalSettings(aiSettings); 
      const savedHistory = localStorage.getItem('multiAnno_aiModelPaths');
      if (savedHistory) {
        try {
          setRecentPaths(JSON.parse(savedHistory));
        } catch (e) {
          console.error("Failed to parse AI history", e);
        }
      }
    }
  }, [open, aiSettings]);

  // 🌟 3. 完美的历史记录去重与保存逻辑 (同 DataPreload)
  const savePathsToHistory = (path: string) => {
    const trimmed = path.trim().replace(/\\/g, '/');
    if (!trimmed) return;
    
    let newHistory = [...recentPaths];
    // 去重并放到最前面
    newHistory = newHistory.filter(p => p !== trimmed);
    newHistory.unshift(trimmed);
    // 只保留最近 5 条
    newHistory = newHistory.slice(0, 5);
    
    setRecentPaths(newHistory);
    localStorage.setItem('multiAnno_aiModelPaths', JSON.stringify(newHistory));
  };

const handleSaveAndVerify = async () => {
  if (!localSettings.modelPath.trim()) return alert("请输入模型权重路径");
  
  setIsVerifying(true);
  try {
    // 1. 调用后端接口装载模型
    await updateAIConfig({
      model_path: localSettings.modelPath,
      model_type: localSettings.model,
      confidence: localSettings.confidence
    });
    
    // 2. 保存路径到本地 localStorage 历史记录
    savePathsToHistory(localSettings.modelPath);

    // 3. 更新全局状态，解锁 AI 功能
    setAISettings({ ...localSettings, isConfigured: true });

    // 🌟 4. 新增：加载成功提示
    // 如果你有 Toast 组件（如 sonner），建议用 toast.success
    alert("✨ AI 模型装载成功！后台引擎已就绪。"); 

    onClose(); // 提示完后再关闭弹窗
  } catch (error: any) {
    // 失败时已有的提示
    alert(`❌ AI 配置失败: ${error.message}`);
  } finally {
    setIsVerifying(false);
  }
};

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-white dark:bg-neutral-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CloudLightning className="w-5 h-5 text-blue-500" /> AI 引擎设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 模型类型 */}
          <div className="space-y-2">
            <Label className="text-xs text-neutral-500">模型架构</Label>
            <Select value={localSettings.model} onValueChange={(v) => setLocalSettings({ ...localSettings, model: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAM3">Segment Anything 3</SelectItem>
                <SelectItem value="MobileSAM">Mobile SAM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 模型路径输入 + 浏览按钮 */}
          <div className="space-y-2">
            <Label className="text-xs text-neutral-500">权重路径 (.pt / .pth)</Label>
            <div className="flex gap-2">
              <input 
                className="flex-1 text-xs p-2 border rounded-md"
                placeholder="选择或输入模型路径..."
                value={localSettings.modelPath}
                onChange={(e) => setLocalSettings({ ...localSettings, modelPath: e.target.value })}
              />
              <Button variant="outline" className="px-3" onClick={() => setFileExplorerOpen(true)}>
                <FolderSearch className="w-4 h-4" />
              </Button>
            </div>
            
            {/* 🌟 5. 渲染 localStorage 中读取到的历史记录 */}
            {recentPaths.length > 0 && (
              <div className="pt-1">
                <span className="text-[10px] text-neutral-400 flex items-center gap-1 mb-1">
                  <History className="w-3 h-3" /> 最近使用的模型:
                </span>
                <div className="flex flex-wrap gap-1">
                  {recentPaths.map((p: string, i: number) => (
                    <span 
                      key={i} onClick={() => setLocalSettings({ ...localSettings, modelPath: p })}
                      className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded cursor-pointer hover:bg-blue-100 text-neutral-600 truncate max-w-[200px] border border-transparent hover:border-blue-300"
                      title={p}
                    >
                      {p.split('/').pop() || p.split('\\').pop()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 置信度 */}
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-neutral-500">默认置信度</Label>
              <span className="text-xs">{localSettings.confidence.toFixed(2)}</span>
            </div>
            <Slider 
              value={[localSettings.confidence * 100]} max={100} step={1}
              onValueChange={(val) => setLocalSettings({ ...localSettings, confidence: (Array.isArray(val) ? val[0] : val) / 100 })}
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveAndVerify} disabled={isVerifying}>
            {isVerifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 加载模型中...</> : <><Save className="w-4 h-4 mr-2" /> 保存并装载模型</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 弹出文件浏览器 */}
    <FileExplorerDialog 
      open={fileExplorerOpen}
      initialPath="/"
      selectType="file" 
      onClose={() => setFileExplorerOpen(false)}
      onConfirm={(paths) => {
        if (paths.length > 0) setLocalSettings({ ...localSettings, modelPath: paths[0] });
        setFileExplorerOpen(false);
      }}
    />
    </>
  );
}