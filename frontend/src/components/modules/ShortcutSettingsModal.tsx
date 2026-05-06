import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Keyboard, Command, ChevronUp, RotateCcw } from 'lucide-react'; // 🌟 引入 RotateCcw 图标
import { useTranslation } from 'react-i18next';
import { useToolNames } from '../../hooks/useToolNames';

interface ShortcutSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KEY_LABELS: Record<string, string> = {
  'arrowleft': '←',
  'arrowright': '→',
  'arrowup': '↑',
  'arrowdown': '↓',
  'delete': 'Del',
  'escape': 'Esc',
  'space': 'Space',
};

const formatShortcut = (setting: { key: string; ctrl?: boolean; shift?: boolean }) => {
  if (!setting) return '';
  const key = KEY_LABELS[setting.key.toLowerCase()] || setting.key.toUpperCase();
  const parts = [];
  if (setting.ctrl) parts.push('Ctrl');
  if (setting.shift) parts.push('Shift');
  parts.push(key);
  return parts.join(' + ');
};

export function ShortcutSettingsModal({ open, onClose }: ShortcutSettingsModalProps) {
  const { t } = useTranslation();
  const shortcutsSettings = useStore((s) => s.shortcutsSettings);
  const updateShortcutSettings = useStore((s) => s.updateShortcutSettings);
  const resetShortcutSettings = useStore((s) => s.resetShortcutSettings); 
  
  const [recordingTool, setRecordingTool] = useState<string | null>(null);
  const toolNames = useToolNames();

  const recordingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recordingTool && recordingRef.current) {
      const timeoutId = setTimeout(() => {
        recordingRef.current?.focus();
      }, 10);
      return () => clearTimeout(timeoutId);
    }
  }, [recordingTool]);

  const handleKeyDown = (e: React.KeyboardEvent, tool: string) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecordingTool(null);
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }
    updateShortcutSettings(tool, {
      key: e.key.toLowerCase(),
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
    });
    setRecordingTool(null);
  };

  const handleReset = () => {
    if (resetShortcutSettings) {
      resetShortcutSettings();
      setRecordingTool(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px] bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
            <Keyboard className="w-5 h-5 text-blue-500" />
            {t('shortcuts.title', 'Shortcut Settings')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {Object.entries(shortcutsSettings).map(([tool, setting]) => (
            <div 
              key={tool} 
              className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-black/40 border border-neutral-100 dark:border-neutral-800/50"
            >
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {toolNames[tool] || tool}
              </span>

              {recordingTool === tool ? (
                <div
                  ref={recordingRef}
                  className="px-3 py-1.5 h-8 min-w-[100px] text-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded ring-2 ring-blue-500 outline-none animate-pulse cursor-default focus:outline-none flex items-center justify-center"
                  tabIndex={0}
                  onKeyDown={(e) => handleKeyDown(e, tool)}
                  onBlur={() => setRecordingTool(null)}
                >
                  {t('shortcuts.pressKey', 'Press Key...')}
                </div>
              ) : (
                <button
                  onClick={() => setRecordingTool(tool)}
                  className="px-3 py-1.5 h-8 min-w-[100px] bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-bold rounded border border-neutral-200 dark:border-neutral-700 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center gap-1 shadow-sm"
                >
                  {setting?.ctrl && <Command className="w-3 h-3 text-blue-500" />}
                  {setting?.shift && <ChevronUp className="w-3 h-3 text-amber-500" />}
                  <span>{setting ? formatShortcut(setting) : ''}</span>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 mt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 flex justify-between items-center">
          <span>{t('shortcuts.pressCombineKey', 'Click a button to rebind')}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
              <RotateCcw className="w-3 h-3 mr-1.5" />
              {t('common.reset', 'Reset')}
            </Button>
            <Button onClick={onClose} size="sm">{t('common.done', 'Done')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}