import type { ShortcutBinding, ShortcutSetting } from '../store/useStore';

export const normalizeShortcutKey = (key: string) => {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === ' ' || normalizedKey === 'spacebar') return 'space';
  return normalizedKey;
};

export const getShortcutBindings = (setting?: ShortcutSetting | null): ShortcutBinding[] => {
  if (!setting || setting.key === '__separator__') return [];

  return [setting, setting.secondary].filter(
    (binding): binding is ShortcutBinding => Boolean(binding?.key),
  );
};

export const shortcutMatchesEvent = (binding: ShortcutBinding | undefined, event: KeyboardEvent) => {
  if (!binding?.key) return false;

  const keyMatches = normalizeShortcutKey(event.key) === normalizeShortcutKey(binding.key);
  const ctrlMatches = Boolean(binding.ctrl) === Boolean(event.ctrlKey || event.metaKey);
  const shiftMatches = Boolean(binding.shift) === Boolean(event.shiftKey);

  return keyMatches && ctrlMatches && shiftMatches;
};

export const areShortcutsEqual = (left?: ShortcutBinding, right?: ShortcutBinding) => {
  if (!left?.key || !right?.key) return false;

  return normalizeShortcutKey(left.key) === normalizeShortcutKey(right.key)
    && Boolean(left.ctrl) === Boolean(right.ctrl)
    && Boolean(left.shift) === Boolean(right.shift);
};
