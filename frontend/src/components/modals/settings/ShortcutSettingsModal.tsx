import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Keyboard, Pencil, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useToolNames } from '../../../hooks/useToolNames';
import { useStore } from '../../../store/useStore';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';

export const KEY_LABELS: Record<string, string> = {
  'arrowleft': '←',
  'arrowright': '→',
  'arrowup': '↑',
  'arrowdown': '↓',
  'delete': 'Del',
  'backspace': 'Backspace',
  'enter': 'Enter',
  'escape': 'Esc',
  'tab': 'Tab',
  'space': 'Space',
  'home': 'Home',
  'end': 'End',
  'pageup': 'Page Up',
  'pagedown': 'Page Down',
};

type ShortcutSetting = { key: string; ctrl?: boolean; shift?: boolean };
type ShortcutGroup = { label: string; items: [string, ShortcutSetting][] };

const normalizeShortcutKey = (key: string) => {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === ' ' || normalizedKey === 'spacebar') return 'space';
  return normalizedKey;
};

const getShortcutParts = (setting?: ShortcutSetting) => {
  if (!setting?.key) return [];
  const normalizedKey = normalizeShortcutKey(setting.key);
  const key = KEY_LABELS[normalizedKey] || setting.key.toUpperCase();
  const parts: string[] = [];
  if (setting.ctrl) parts.push('Ctrl');
  if (setting.shift) parts.push('Shift');
  parts.push(key);
  return parts;
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
  const recordingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (recordingTool && recordingRef.current) {
      const timeoutId = setTimeout(() => {
        recordingRef.current?.focus();
      }, 10);
      return () => clearTimeout(timeoutId);
    }
  }, [recordingTool]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, tool: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecordingTool(null);
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }
    updateShortcutSettings(tool, {
      key: normalizeShortcutKey(e.key),
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

  const groupLabels = [
    t('shortcuts.drawingTools'),
    t('shortcuts.additionalDrawingTools'),
    t('shortcuts.viewEditingTools'),
    t('shortcuts.sceneNavigation'),
    t('shortcuts.editActions'),
  ];
  const groups: ShortcutGroup[] = [];
  let currentGroup: [string, ShortcutSetting][] = [];

  const appendCurrentGroup = () => {
    if (currentGroup.length > 0) {
      groups.push({
        label: groupLabels[groups.length] || t('shortcuts.other'),
        items: currentGroup,
      });
      currentGroup = [];
    }
  };

  Object.entries(shortcutsSettings).forEach(([tool, setting]) => {
    if (setting?.key === '__separator__') {
      appendCurrentGroup();
    } else {
      currentGroup.push([tool, setting]);
    }
  });
  appendCurrentGroup();

  const shortcutCount = groups.reduce((count, group) => count + group.items.length, 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-neutral-200 p-0 dark:border-neutral-800 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Keyboard className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">{t('shortcuts.title')}</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('shortcuts.description')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold text-muted-foreground">
              {t('shortcuts.count', { count: shortcutCount })}
            </span>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-4 p-4 sm:p-5">
            {groups.map((group, gi) => (
              <section key={`shortcut-group-${gi}`} className="rounded-xl border border-border bg-muted/20 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <h3 className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {group.items.map(([tool, setting]) => {
                    const shortcutParts = getShortcutParts(setting);
                    return (
                      <div
                        key={tool}
                        className="flex min-h-[52px] items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
                      >
                        <span
                          className="min-w-0 truncate text-xs font-medium text-foreground"
                          title={toolNames[tool] || tool}
                        >
                          {toolNames[tool] || tool}
                        </span>

                        {recordingTool === tool ? (
                          <button
                            type="button"
                            ref={recordingRef}
                            className="flex h-8 min-w-[116px] shrink-0 cursor-default items-center justify-center rounded-lg bg-primary/10 px-3 text-center text-[10px] font-bold text-primary outline-none ring-2 ring-primary animate-pulse"
                            tabIndex={0}
                            onKeyDown={(e) => handleKeyDown(e, tool)}
                            onBlur={() => setRecordingTool(null)}
                            aria-label={t('shortcuts.pressKey')}
                          >
                            {t('shortcuts.pressKey')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRecordingTool(tool)}
                            className="group/key flex h-8 min-w-[116px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-bold shadow-sm transition-colors hover:border-primary hover:text-primary"
                            title={t('shortcuts.editHint')}
                            aria-label={`${toolNames[tool] || tool}: ${shortcutParts.join(' + ')}`}
                          >
                            {shortcutParts.length > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                {shortcutParts.map((part, index) => (
                                  <span key={`${tool}-${part}-${index}`} className="inline-flex items-center gap-1">
                                    {index > 0 && <span className="text-[10px] text-muted-foreground/60">+</span>}
                                    <kbd className="min-w-[20px] rounded-md border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] leading-none text-foreground group-hover/key:border-primary/30 group-hover/key:bg-primary/10">
                                      {part}
                                    </kbd>
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                            <Pencil className="ml-0.5 h-3 w-3 text-muted-foreground/60 transition-colors group-hover/key:text-primary" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('shortcuts.pressCombineKey')}</span>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} title={t('shortcuts.resetHint')}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
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
