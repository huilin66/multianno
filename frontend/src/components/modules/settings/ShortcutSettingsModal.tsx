import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Keyboard, Command, ChevronUp, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToolNames } from '../../../hooks/useToolNames';

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

interface ShortcutSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

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

  const groups: { label?: string; items: [string, any][] }[] = [];
  let currentGroup: [string, any][] = [];
  
  Object.entries(shortcutsSettings).forEach(([tool, setting]) => {
    if ((setting as any)?.key === '__separator__') {
      if (currentGroup.length > 0) {
        groups.push({ items: currentGroup });
        currentGroup = [];
      }
    } else {
      currentGroup.push([tool, setting]);
    }
  });
  if (currentGroup.length > 0) {
    groups.push({ items: currentGroup });
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-md p-0 border-border overflow-hidden">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto custom-scrollbar">
          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="h-px bg-border mx-4" />}
              <div className="p-4 space-y-1.5">
                {group.items.map(([tool, setting]) => (
                  <div 
                    key={tool} 
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs font-medium">
                      {toolNames[tool] || tool}
                    </span>

                    {recordingTool === tool ? (
                      <div
                        ref={recordingRef}
                        className="px-3 py-1 h-7 min-w-[90px] text-center bg-primary/10 text-primary text-[10px] font-bold rounded ring-2 ring-primary outline-none animate-pulse cursor-default flex items-center justify-center"
                        tabIndex={0}
                        onKeyDown={(e) => handleKeyDown(e, tool)}
                        onBlur={() => setRecordingTool(null)}
                      >
                        {t('shortcuts.pressKey')}
                      </div>
                    ) : (
                      <button
                        onClick={() => setRecordingTool(tool)}
                        className="px-3 py-1 h-7 min-w-[90px] bg-background border border-border text-xs font-bold rounded hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1"
                      >
                        {setting?.ctrl && <span className="text-[10px] font-semibold">⌃</span>}
                        {setting?.shift && <span className="text-[10px] font-semibold">⇧</span>}
                        <span className="text-[10px]">{setting ? formatShortcut(setting) : ''}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {t('shortcuts.pressCombineKey')}
          </span>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              {t('common.reset')}
            </Button>
            <Button onClick={onClose} size="sm" className="text-white">
              {t('common.done')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}