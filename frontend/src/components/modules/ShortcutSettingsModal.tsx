import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Keyboard, Command } from 'lucide-react';

interface ShortcutSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const TOOL_NAMES: Record<string, string> = {
  pan: '漫游拖拽 (Pan)',
  select: '选择/编辑 (Select)',
  bbox: '矩形框 (BBox)',
  polygon: '多边形 (Polygon)',
  cutout: '橡皮擦/挖洞 (Cutout)',
  cut: '切割断离 (Cut)',
};

export function ShortcutSettingsModal({ open, onClose }: ShortcutSettingsModalProps) {
  const { shortcuts, updateShortcut } = useStore() as any;
  const [recordingTool, setRecordingTool] = useState<string | null>(null);

  // 监听按键录入
  const handleKeyDown = (e: React.KeyboardEvent, tool: string) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecordingTool(null);
      return;
    }
    // 屏蔽 Tab, Enter 等控制键
    if (e.key.length === 1 || e.key.startsWith('Arrow')) {
      updateShortcut(tool, e.key);
      setRecordingTool(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
            <Keyboard className="w-5 h-5 text-blue-500" />
            快捷键设置 (Shortcuts)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {Object.keys(shortcuts).map((tool) => (
            <div key={tool} className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-black/40 border border-neutral-100 dark:border-neutral-800/50">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {TOOL_NAMES[tool] || tool}
              </span>
              
              {recordingTool === tool ? (
                <div 
                  className="px-3 py-1.5 h-8 min-w-[80px] text-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded ring-2 ring-blue-500 outline-none animate-pulse cursor-default focus:outline-none"
                  tabIndex={0}
                  autoFocus
                  onKeyDown={(e) => handleKeyDown(e, tool)}
                  onBlur={() => setRecordingTool(null)}
                >
                  请按键...
                </div>
              ) : (
                <button
                  onClick={() => setRecordingTool(tool)}
                  className="px-3 py-1.5 h-8 min-w-[80px] bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-bold rounded border border-neutral-200 dark:border-neutral-700 hover:border-blue-500 hover:text-blue-500 transition-colors uppercase flex items-center justify-center gap-1 shadow-sm"
                >
                  <Command className="w-3 h-3 opacity-50" />
                  {shortcuts[tool]}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 mt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 flex justify-between items-center">
          <span>点击按键框即可重新录入</span>
          <Button onClick={onClose} size="sm">完成</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}