// hooks/useToolNames.ts
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export function useToolNames() {
  const { t } = useTranslation();
  
  return useMemo(() => ({
    bbox: t('shortcuts.bbox', 'BBox'),
    polygon: t('shortcuts.polygon', 'Polygon'),
    ai_anno: t('shortcuts.aiAnno', 'AI Auto'),

    rbbox: t('shortcuts.rbbox', 'Rotated Box'),
    cuboid: t('shortcuts.cuboid', 'Cuboid'),
    ellipse: t('shortcuts.ellipse', 'Ellipse'),
    circle: t('shortcuts.circle', 'Circle'),
    freemask: t('shortcuts.freemask', 'FreeMask'),
    point: t('shortcuts.point', 'Point'),
    line: t('shortcuts.line', 'Line'),
    lasso: t('shortcuts.lasso', 'Lasso'),

    pan: t('shortcuts.pan', 'Pan'),
    select: t('shortcuts.select', 'Select'),
    cut: t('shortcuts.cut', 'Cut'),
    cutout: t('shortcuts.cutout', 'Cutout'),

    home: t('shortcuts.home', 'Home'),
    prev: t('shortcuts.prev', 'Prev'),
    next: t('shortcuts.next', 'Next'),
    undo: t('shortcuts.undo', 'Undo'),
    redo: t('shortcuts.redo', 'Redo'),
    delete: t('shortcuts.delete', 'Delete'),
    clear: t('shortcuts.clear', 'Clear'),
    save: t('shortcuts.save', 'Save'),
  }), [t]);
}