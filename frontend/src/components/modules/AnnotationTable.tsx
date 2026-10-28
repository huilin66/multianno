import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, ChevronsUpDown, Copy, Eye, EyeOff, ExternalLink, Filter, GripVertical, Link2, RotateCcw, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFileContent } from '../../api/client';
import { useStore, type Annotation, type TaxonomyAttribute, type TaxonomyClass } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { getAnnotationBounds } from '../../lib/annotationHitTest';
import {
  findAnnotationOverlaps,
  getAnnotationOverlapKey,
} from '../../lib/annotationOverlap';

export interface AnnotationTableOverlapState {
  active: boolean;
  mode: 'iou' | 'ios';
  threshold: number;
}

interface AnnotationTableProps {
  annotations: Annotation[];
  taxonomyClasses: TaxonomyClass[];
  taxonomyAttributes: TaxonomyAttribute[];
  onOpenAnnotation: (annotation: Annotation, sceneObjectIndex: number) => void;
  cacheKey?: string;
  viewStateReady?: boolean;
  overlapState?: AnnotationTableOverlapState;
  onOverlapStateChange?: (state: AnnotationTableOverlapState) => void;
  reloadToken?: number;
  selectedAnnotationIds?: string[];
  activeAnnotationId?: string | null;
}

interface AnnotationTableRow {
  annotation: Annotation;
  sceneObjectIndex: number;
  attributesText: string;
  textValue: string;
  groupIdValue: string;
  trackIdValue: string;
  pointsCount: number;
  boxWidth: number | null;
  boxHeight: number | null;
}

type ImageMetaRecord = Record<string, unknown>;

interface SceneGroupMetadata {
  imageName: string;
  imageWidth?: unknown;
  imageHeight?: unknown;
  metadata: ImageMetaRecord | null;
  error: boolean;
}

type AnnotationTableSortKey =
  | 'id'
  | 'label'
  | 'type'
  | 'boxWidth'
  | 'boxHeight'
  | 'text'
  | 'groupId'
  | 'trackId'
  | 'points'
  | 'attributes'
  | 'stem'
  | 'overlap';

type AnnotationTableColumnKey =
  | 'row'
  | 'id'
  | 'label'
  | 'type'
  | 'boxWidth'
  | 'boxHeight'
  | 'text'
  | 'groupId'
  | 'trackId'
  | 'points'
  | 'attributes'
  | 'stem'
  | 'imageName'
  | 'imageWidth'
  | 'imageHeight'
  | 'latitude'
  | 'longitude'
  | 'altitude'
  | 'heading'
  | 'utc'
  | 'overlap'
  | 'action';

const DEFAULT_COLUMN_WIDTHS: Record<AnnotationTableColumnKey, number> = {
  row: 48,
  id: 208,
  label: 176,
  type: 112,
  boxWidth: 96,
  boxHeight: 96,
  text: 220,
  groupId: 128,
  trackId: 144,
  points: 80,
  attributes: 220,
  stem: 220,
  imageName: 220,
  imageWidth: 112,
  imageHeight: 112,
  latitude: 128,
  longitude: 128,
  altitude: 128,
  heading: 128,
  utc: 220,
  overlap: 160,
  action: 48,
};

const MIN_COLUMN_WIDTHS: Record<AnnotationTableColumnKey, number> = {
  row: 40,
  id: 120,
  label: 120,
  type: 88,
  boxWidth: 72,
  boxHeight: 72,
  text: 160,
  groupId: 96,
  trackId: 96,
  points: 64,
  attributes: 160,
  stem: 160,
  imageName: 160,
  imageWidth: 88,
  imageHeight: 88,
  latitude: 96,
  longitude: 96,
  altitude: 96,
  heading: 96,
  utc: 160,
  overlap: 112,
  action: 40,
};

const DEFAULT_COLUMN_ORDER: AnnotationTableColumnKey[] = [
  'row', 'id', 'label', 'type', 'boxWidth', 'boxHeight', 'text',
  'groupId', 'trackId', 'points', 'attributes', 'stem',
  'imageName', 'imageWidth', 'imageHeight', 'latitude', 'longitude',
  'altitude', 'heading', 'utc', 'overlap', 'action',
];

const SCENE_GROUP_INFO_COLUMNS: AnnotationTableColumnKey[] = [
  'imageName', 'imageWidth', 'imageHeight', 'latitude', 'longitude',
  'altitude', 'heading', 'utc',
];

interface AnnotationTableSortState {
  key: AnnotationTableSortKey;
  direction: 'asc' | 'desc';
}

interface AnnotationTableMemoryState {
  loadedAnnotations: Annotation[] | null;
  columnWidths?: Partial<Record<AnnotationTableColumnKey, number>>;
  columnOrder?: AnnotationTableColumnKey[];
  hiddenColumns?: AnnotationTableColumnKey[];
  classFilter: string;
  typeFilter: string;
  annotationIdFilter: string;
  textFilter: string;
  groupIdFilter: string;
  trackIdFilter: string;
  pointsFilter: string;
  attributesFilter: string;
  sceneFilter: string;
  minBoxWidth: string;
  maxBoxWidth: string;
  minBoxHeight: string;
  maxBoxHeight: string;
  overlapGroupFilter: string;
  sortState: AnnotationTableSortState | null;
  overlapPanelOpen: boolean;
  overlapMode: 'iou' | 'ios';
  overlapThreshold: number;
  overlapKeys: string[] | null;
  overlapCounts: Array<[string, number]>;
  overlapGroups: Array<[string, string]>;
  hideUnselected: boolean;
  showSceneGroupInfo: boolean;
}

// Annotation Table is mounted only while its tab is active. Keep its loaded
// snapshot and controls outside the component so switching tabs or closing
// and reopening Annotation Manager does not discard the user's work.
const annotationTableMemory = new Map<string, AnnotationTableMemoryState>();

const formatAttributeValue = (value: string | number | boolean) => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const formatCellText = (value: string) => value || '—';

const getBaseName = (value: string) => {
  const normalized = String(value || '').replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
};

const getImageStem = (value: string) => getBaseName(value).replace(/\.[^.]+$/, '');

const normalizeExtension = (extension: string) => {
  if (!extension) return '';
  return extension.startsWith('.') ? extension : `.${extension}`;
};

const formatMetadataValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const readMetadataValue = (metadata: ImageMetaRecord | null, keys: string[]) => {
  if (!metadata) return undefined;
  const sources = [
    metadata,
    metadata.gps,
    metadata.GPS,
    metadata.position,
    metadata.pose,
  ].filter((source): source is ImageMetaRecord => Boolean(source) && typeof source === 'object');

  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
        return source[key];
      }
    }
  }
  return undefined;
};

const compareOptionalText = (first: string, second: string) => {
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return first.localeCompare(second, undefined, { numeric: true });
};

const formatBoxDimension = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '');
};

const parseNumberFilter = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareOptionalNumbers = (first: number | null, second: number | null) => {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first - second;
};

const cloneAnnotations = (source: Annotation[]) => source.map((annotation) => ({
  ...annotation,
  points: (annotation.points || []).map((point) => ({ ...point })),
  holes: annotation.holes?.map((hole) => hole.map((point) => ({ ...point }))),
  attributes: { ...(annotation.attributes || {}) },
  flags: annotation.flags ? { ...annotation.flags } : annotation.flags,
}));

export const AnnotationTable = React.memo(function AnnotationTable({
  annotations,
  taxonomyClasses,
  taxonomyAttributes,
  onOpenAnnotation,
  cacheKey,
  viewStateReady = true,
  overlapState,
  onOverlapStateChange,
  reloadToken = 0,
  selectedAnnotationIds = [],
  activeAnnotationId = null,
}: AnnotationTableProps) {
  const { t } = useTranslation();
  const workspacePath = useStore((state) => state.workspacePath);
  const folders = useStore((state) => state.folders);
  const views = useStore((state) => state.views);
  const sceneGroups = useStore((state) => state.sceneGroups);
  const rememberedState = cacheKey ? annotationTableMemory.get(cacheKey) : undefined;
  const [loadedAnnotations, setLoadedAnnotations] = useState<Annotation[] | null>(() => (
    rememberedState?.loadedAnnotations ?? null
  ));
  const [columnWidths, setColumnWidths] = useState<Record<AnnotationTableColumnKey, number>>(() => ({
    ...DEFAULT_COLUMN_WIDTHS,
    ...(rememberedState?.columnWidths || {}),
  }));
  const [columnWidthDrafts, setColumnWidthDrafts] = useState<Partial<Record<AnnotationTableColumnKey, string>>>(() => (
    Object.fromEntries(
      Object.entries({
        ...DEFAULT_COLUMN_WIDTHS,
        ...(rememberedState?.columnWidths || {}),
      }).map(([key, value]) => [key, String(value)]),
    ) as Partial<Record<AnnotationTableColumnKey, string>>
  ));
  const [columnOrder, setColumnOrder] = useState<AnnotationTableColumnKey[]>(() => (
    rememberedState?.columnOrder ? [...rememberedState.columnOrder] : [...DEFAULT_COLUMN_ORDER]
  ));
  const [hiddenColumns, setHiddenColumns] = useState<Set<AnnotationTableColumnKey>>(() => (
    new Set((rememberedState?.hiddenColumns || []).filter((key) => key !== 'row'))
  ));
  const [columnOrderDialogOpen, setColumnOrderDialogOpen] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<AnnotationTableColumnKey | null>(null);
  const columnResizeRef = useRef<{
    key: AnnotationTableColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [classFilter, setClassFilter] = useState(() => rememberedState?.classFilter ?? 'all');
  const [typeFilter, setTypeFilter] = useState(() => rememberedState?.typeFilter ?? 'all');
  const [annotationIdFilter, setAnnotationIdFilter] = useState(() => rememberedState?.annotationIdFilter ?? '');
  const [textFilter, setTextFilter] = useState(() => rememberedState?.textFilter ?? '');
  const [groupIdFilter, setGroupIdFilter] = useState(() => rememberedState?.groupIdFilter ?? '');
  const [trackIdFilter, setTrackIdFilter] = useState(() => rememberedState?.trackIdFilter ?? '');
  const [pointsFilter, setPointsFilter] = useState(() => rememberedState?.pointsFilter ?? '');
  const [attributesFilter, setAttributesFilter] = useState(() => rememberedState?.attributesFilter ?? '');
  const [sceneFilter, setSceneFilter] = useState(() => rememberedState?.sceneFilter ?? '');
  const [minBoxWidth, setMinBoxWidth] = useState(() => rememberedState?.minBoxWidth ?? '');
  const [maxBoxWidth, setMaxBoxWidth] = useState(() => rememberedState?.maxBoxWidth ?? '');
  const [minBoxHeight, setMinBoxHeight] = useState(() => rememberedState?.minBoxHeight ?? '');
  const [maxBoxHeight, setMaxBoxHeight] = useState(() => rememberedState?.maxBoxHeight ?? '');
  const [overlapGroupFilter, setOverlapGroupFilter] = useState(() => rememberedState?.overlapGroupFilter ?? '');
  const [sortState, setSortState] = useState<AnnotationTableSortState | null>(() => (
    rememberedState?.sortState ? { ...rememberedState.sortState } : null
  ));
  const [overlapPanelOpen, setOverlapPanelOpen] = useState(() => rememberedState?.overlapPanelOpen ?? false);
  const [overlapMode, setOverlapMode] = useState<'iou' | 'ios'>(() => rememberedState?.overlapMode ?? 'ios');
  const [overlapThreshold, setOverlapThreshold] = useState(() => rememberedState?.overlapThreshold ?? 80);
  const [overlapKeys, setOverlapKeys] = useState<Set<string> | null>(() => (
    rememberedState?.overlapKeys ? new Set(rememberedState.overlapKeys) : null
  ));
  const [overlapCounts, setOverlapCounts] = useState<Map<string, number>>(() => (
    new Map(rememberedState?.overlapCounts || [])
  ));
  const [overlapGroups, setOverlapGroups] = useState<Map<string, string>>(() => (
    new Map(rememberedState?.overlapGroups || [])
  ));
  const [isScanningOverlaps, setIsScanningOverlaps] = useState(false);
  const [hideUnselected, setHideUnselected] = useState(() => rememberedState?.hideUnselected ?? false);
  const [showSceneGroupInfo, setShowSceneGroupInfo] = useState(() => rememberedState?.showSceneGroupInfo ?? false);
  const lastExternalReloadTokenRef = useRef(0);
  const [sceneGroupMetadata, setSceneGroupMetadata] = useState<Map<string, SceneGroupMetadata>>(new Map());
  const [sceneGroupMetadataLoading, setSceneGroupMetadataLoading] = useState(false);
  const [sceneGroupMetadataProgress, setSceneGroupMetadataProgress] = useState({ current: 0, total: 0 });
  const overlapScanRequestRef = React.useRef(0);
  const sceneGroupMetadataRequestRef = useRef(0);
  const isLoaded = loadedAnnotations !== null;

  useEffect(() => {
    if (!cacheKey) return;
    annotationTableMemory.set(cacheKey, {
      loadedAnnotations,
      columnWidths,
      columnOrder,
      hiddenColumns: Array.from(hiddenColumns),
      classFilter,
      typeFilter,
      annotationIdFilter,
      textFilter,
      groupIdFilter,
      trackIdFilter,
      pointsFilter,
      attributesFilter,
      sceneFilter,
      minBoxWidth,
      maxBoxWidth,
      minBoxHeight,
      maxBoxHeight,
      overlapGroupFilter,
      sortState,
      overlapPanelOpen,
      overlapMode,
      overlapThreshold,
      overlapKeys: overlapKeys ? Array.from(overlapKeys) : null,
      overlapCounts: Array.from(overlapCounts.entries()),
      overlapGroups: Array.from(overlapGroups.entries()),
      hideUnselected,
      showSceneGroupInfo,
    });
  }, [
    annotationIdFilter,
    attributesFilter,
    cacheKey,
    classFilter,
    columnOrder,
    columnWidths,
    hiddenColumns,
    groupIdFilter,
    hideUnselected,
    loadedAnnotations,
    maxBoxHeight,
    maxBoxWidth,
    minBoxHeight,
    minBoxWidth,
    overlapCounts,
    overlapGroupFilter,
    overlapGroups,
    overlapKeys,
    overlapMode,
    overlapPanelOpen,
    overlapThreshold,
    pointsFilter,
    sceneFilter,
    showSceneGroupInfo,
    sortState,
    textFilter,
    trackIdFilter,
    typeFilter,
  ]);

  const selectedIdSet = useMemo(
    () => new Set([
      ...selectedAnnotationIds.map(String),
      ...(activeAnnotationId ? [String(activeAnnotationId)] : []),
    ]),
    [activeAnnotationId, selectedAnnotationIds],
  );
  const hasMainSelection = selectedIdSet.size > 0;

  const rows = useMemo<AnnotationTableRow[]>(() => {
    const sceneObjectCounts = new Map<string, number>();

    return (loadedAnnotations || []).map((annotation) => {
      const sceneObjectIndex = sceneObjectCounts.get(annotation.stem) || 0;
      sceneObjectCounts.set(annotation.stem, sceneObjectIndex + 1);

      const attributeEntries = Object.entries(annotation.attributes || {}) as Array<[
        string,
        string | number | boolean,
      ]>;
      const attributesText = attributeEntries.length > 0
        ? attributeEntries
          .map(([name, value]) => `${name}=${formatAttributeValue(value)}`)
          .join(' · ')
        : '—';
      const bounds = getAnnotationBounds(annotation);

      return {
        annotation,
        sceneObjectIndex,
        attributesText,
        textValue: annotation.text?.trim() || '',
        groupIdValue: annotation.group_id === undefined || annotation.group_id === null
          ? ''
          : String(annotation.group_id),
        trackIdValue: annotation.track_id === undefined || annotation.track_id === null
          ? ''
          : String(annotation.track_id),
        pointsCount: annotation.points?.length || 0,
        boxWidth: bounds ? Math.max(0, bounds.maxX - bounds.minX) : null,
        boxHeight: bounds ? Math.max(0, bounds.maxY - bounds.minY) : null,
      };
    });
  }, [loadedAnnotations]);

  const mainViewFolder = useMemo(() => {
    const mainView = views.find((view) => view.isMain) || views[0];
    return folders.find((folder) => folder.id === mainView?.folderId) || folders[0];
  }, [folders, views]);

  const metadataDirectory = useMemo(() => {
    if (workspacePath) return workspacePath;
    return mainViewFolder?.path || folders[0]?.path || '';
  }, [folders, mainViewFolder, workspacePath]);

  const sceneGroupImageNames = useMemo(() => {
    const imageNames = new Map<string, string>();
    (loadedAnnotations || []).forEach((annotation) => {
      if (imageNames.has(annotation.stem)) return;
      const fileMap = sceneGroups?.[annotation.stem] || {};
      const imageName = (mainViewFolder?.path ? fileMap[mainViewFolder.path] : '')
        || Object.values(fileMap)[0]
        || `${annotation.stem}${mainViewFolder?.suffix || ''}${normalizeExtension(mainViewFolder?.extension || '')}`;
      imageNames.set(annotation.stem, getBaseName(imageName));
    });
    return imageNames;
  }, [loadedAnnotations, mainViewFolder, sceneGroups]);

  const loadSceneGroupMetadata = useCallback(async () => {
    const requestId = sceneGroupMetadataRequestRef.current + 1;
    sceneGroupMetadataRequestRef.current = requestId;
    const targetStems: string[] = Array.from(new Set<string>(
      (loadedAnnotations || []).map((annotation) => String(annotation.stem)).filter(Boolean),
    ));

    if (!showSceneGroupInfo || loadedAnnotations === null || !metadataDirectory || targetStems.length === 0) {
      setSceneGroupMetadata(new Map());
      setSceneGroupMetadataProgress({ current: 0, total: 0 });
      setSceneGroupMetadataLoading(false);
      return;
    }

    setSceneGroupMetadataLoading(true);
    setSceneGroupMetadata(new Map());
    setSceneGroupMetadataProgress({ current: 0, total: targetStems.length });

    const separator = metadataDirectory.includes('\\') ? '\\' : '/';
    const directory = metadataDirectory.replace(/[\\/]+$/, '');
    const nextMetadata = new Map<string, SceneGroupMetadata>();
    const batchSize = 12;

    for (let index = 0; index < targetStems.length; index += batchSize) {
      const batch = targetStems.slice(index, index + batchSize);
      const loaded = await Promise.all(batch.map(async (stem) => {
        const imageName = sceneGroupImageNames.get(stem) || `${stem}${normalizeExtension(mainViewFolder?.extension || '')}`;
        const imageStem = getImageStem(imageName) || stem;
        const path = `${directory}${separator}${imageStem}.json`;
        try {
          const response = await getFileContent(path);
          const rawContent = response?.content ?? response;
          const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
          const imageMeta = parsed?.imageMeta ?? parsed?.image_meta;
          const metadata = imageMeta && typeof imageMeta === 'object' ? imageMeta as ImageMetaRecord : null;
          return {
            stem,
            data: {
              imageName,
              imageWidth: parsed?.imageWidth
                ?? parsed?.image_width
                ?? readMetadataValue(metadata, ['image_width', 'pixel_width', 'img_width']),
              imageHeight: parsed?.imageHeight
                ?? parsed?.image_height
                ?? readMetadataValue(metadata, ['image_height', 'pixel_height', 'img_height']),
              metadata,
              error: false,
            } as SceneGroupMetadata,
          };
        } catch {
          return {
            stem,
            data: { imageName, metadata: null, error: true } as SceneGroupMetadata,
          };
        }
      }));

      if (sceneGroupMetadataRequestRef.current !== requestId) return;
      loaded.forEach(({ stem, data }) => nextMetadata.set(stem, data));
      setSceneGroupMetadata(new Map(nextMetadata));
      setSceneGroupMetadataProgress({
        current: Math.min(index + batch.length, targetStems.length),
        total: targetStems.length,
      });
    }

    if (sceneGroupMetadataRequestRef.current === requestId) {
      setSceneGroupMetadataLoading(false);
    }
  }, [
    loadedAnnotations,
    mainViewFolder,
    metadataDirectory,
    sceneGroupImageNames,
    showSceneGroupInfo,
  ]);

  useEffect(() => {
    void loadSceneGroupMetadata();
    return () => {
      sceneGroupMetadataRequestRef.current += 1;
    };
  }, [loadSceneGroupMetadata]);

  const classOptions = useMemo(() => {
    const names = new Set([
      ...taxonomyClasses.map((taxonomyClass) => taxonomyClass.name),
      ...rows.map((row) => row.annotation.label),
    ]);
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rows, taxonomyClasses]);

  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.annotation.type))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedIdFilter = annotationIdFilter.trim().toLowerCase();
    const normalizedTextFilter = textFilter.trim().toLowerCase();
    const normalizedGroupIdFilter = groupIdFilter.trim().toLowerCase();
    const normalizedTrackIdFilter = trackIdFilter.trim().toLowerCase();
    const normalizedPointsFilter = pointsFilter.trim().toLowerCase();
    const normalizedAttributesFilter = attributesFilter.trim().toLowerCase();
    const normalizedSceneFilter = sceneFilter.trim().toLowerCase();
    const normalizedOverlapGroupFilter = overlapGroupFilter.trim().toLowerCase();
    const minWidth = parseNumberFilter(minBoxWidth);
    const maxWidth = parseNumberFilter(maxBoxWidth);
    const minHeight = parseNumberFilter(minBoxHeight);
    const maxHeight = parseNumberFilter(maxBoxHeight);

    return rows.filter((row) => {
      const { annotation } = row;
      if (classFilter !== 'all' && annotation.label !== classFilter) return false;
      if (typeFilter !== 'all' && annotation.type !== typeFilter) return false;
      if (overlapKeys && !overlapKeys.has(getAnnotationOverlapKey(annotation))) return false;
      if (normalizedIdFilter && !String(annotation.id).toLowerCase().includes(normalizedIdFilter)) return false;
      if (normalizedTextFilter && !row.textValue.toLowerCase().includes(normalizedTextFilter)) return false;
      if (normalizedGroupIdFilter && !row.groupIdValue.toLowerCase().includes(normalizedGroupIdFilter)) return false;
      if (normalizedTrackIdFilter && !row.trackIdValue.toLowerCase().includes(normalizedTrackIdFilter)) return false;
      if (normalizedPointsFilter && !String(row.pointsCount).includes(normalizedPointsFilter)) return false;
      if (normalizedAttributesFilter && !row.attributesText.toLowerCase().includes(normalizedAttributesFilter)) return false;
      if (normalizedSceneFilter && !annotation.stem.toLowerCase().includes(normalizedSceneFilter)) return false;
      const overlapGroup = overlapGroups.get(getAnnotationOverlapKey(annotation)) || '';
      if (normalizedOverlapGroupFilter) {
        if (!overlapGroup.toLowerCase().includes(normalizedOverlapGroupFilter)) return false;
      }
      if (minWidth !== null && (row.boxWidth === null || row.boxWidth < minWidth)) return false;
      if (maxWidth !== null && (row.boxWidth === null || row.boxWidth > maxWidth)) return false;
      if (minHeight !== null && (row.boxHeight === null || row.boxHeight < minHeight)) return false;
      if (maxHeight !== null && (row.boxHeight === null || row.boxHeight > maxHeight)) return false;
      return true;
    });
  }, [annotationIdFilter, attributesFilter, classFilter, groupIdFilter, maxBoxHeight, maxBoxWidth, minBoxHeight, minBoxWidth, overlapGroupFilter, overlapGroups, overlapKeys, pointsFilter, rows, sceneFilter, textFilter, trackIdFilter, typeFilter]);

  const taxonomyAttributeNames = new Set(taxonomyAttributes.map((attribute) => attribute.name));

  const overlapSceneCount = useMemo(
    () => new Set(
      rows
        .filter((row) => overlapKeys?.has(getAnnotationOverlapKey(row.annotation)))
        .map((row) => row.annotation.stem),
    ).size,
    [overlapKeys, rows],
  );

  const scanOverlaps = React.useCallback((mode: 'iou' | 'ios', threshold: number) => {
    if (loadedAnnotations === null) return;

    const requestId = overlapScanRequestRef.current + 1;
    overlapScanRequestRef.current = requestId;
    setIsScanningOverlaps(true);

    // Yield once so the table can render the scanning state before a large
    // project-wide pair scan begins.
    window.setTimeout(() => {
      if (requestId !== overlapScanRequestRef.current) return;

      const result = findAnnotationOverlaps(loadedAnnotations || [], mode, threshold);
      setOverlapKeys(result.matchedKeys);
      setOverlapCounts(result.overlapCounts);
      setOverlapGroups(result.overlapGroups);
      setIsScanningOverlaps(false);
      onOverlapStateChange?.({ active: true, mode, threshold });
    }, 0);
  }, [loadedAnnotations, onOverlapStateChange]);

  // Restore the last completed scan from the project-scoped table snapshot.
  // A deliberate Reload/Scan is required before the table reads or recomputes
  // anything again.
  useEffect(() => {
    if (!viewStateReady) return;

    const savedMode = overlapState?.mode || 'ios';
    const savedThreshold = Math.max(10, Math.min(100, overlapState?.threshold ?? 80));

    setOverlapMode(savedMode);
    setOverlapThreshold(savedThreshold);

    if (overlapState?.active) {
      setOverlapPanelOpen(true);
      if (loadedAnnotations !== null && overlapKeys === null) {
        scanOverlaps(savedMode, savedThreshold);
      }
      return;
    }

    overlapScanRequestRef.current += 1;
    setOverlapKeys(null);
    setOverlapCounts(new Map());
    setOverlapGroups(new Map());
    setIsScanningOverlaps(false);
  }, [
    loadedAnnotations,
    overlapKeys,
    overlapState?.active,
    overlapState?.mode,
    overlapState?.threshold,
    scanOverlaps,
    viewStateReady,
  ]);

  const loadAnnotations = useCallback(() => {
    overlapScanRequestRef.current += 1;
    setLoadedAnnotations(cloneAnnotations(annotations));
    setOverlapKeys(null);
    setOverlapCounts(new Map());
    setOverlapGroups(new Map());
    setIsScanningOverlaps(false);
  }, [annotations]);

  useEffect(() => {
    if (reloadToken <= 0 || reloadToken === lastExternalReloadTokenRef.current) return;
    lastExternalReloadTokenRef.current = reloadToken;
    loadAnnotations();
  }, [loadAnnotations, reloadToken]);

  useEffect(() => {
    if (!resizingColumn) return;

    const handlePointerMove = (event: PointerEvent) => {
      const resize = columnResizeRef.current;
      if (!resize) return;

      const nextWidth = Math.max(
        MIN_COLUMN_WIDTHS[resize.key],
        resize.startWidth + event.clientX - resize.startX,
      );
      setColumnWidths((current) => ({ ...current, [resize.key]: nextWidth }));
    };
    const stopResizing = () => {
      columnResizeRef.current = null;
      setResizingColumn(null);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing, { once: true });
    window.addEventListener('pointercancel', stopResizing, { once: true });

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [resizingColumn]);

  useEffect(() => {
    if (!columnOrderDialogOpen) return;
    setColumnWidthDrafts(Object.fromEntries(
      DEFAULT_COLUMN_ORDER.map((key) => [key, String(columnWidths[key])]),
    ));
  }, [columnOrderDialogOpen, columnWidths]);

  const resetOverlapScan = () => {
    overlapScanRequestRef.current += 1;
    setOverlapKeys(null);
    setOverlapCounts(new Map());
    setOverlapGroups(new Map());
    setIsScanningOverlaps(false);
    onOverlapStateChange?.({
      active: false,
      mode: overlapMode,
      threshold: overlapThreshold,
    });
  };

  const toggleSort = (key: AnnotationTableSortKey) => {
    setSortState((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const clearFilters = () => {
    setClassFilter('all');
    setTypeFilter('all');
    setAnnotationIdFilter('');
    setTextFilter('');
    setGroupIdFilter('');
    setTrackIdFilter('');
    setPointsFilter('');
    setAttributesFilter('');
    setSceneFilter('');
    setMinBoxWidth('');
    setMaxBoxWidth('');
    setMinBoxHeight('');
    setMaxBoxHeight('');
    setOverlapGroupFilter('');
    setHideUnselected(false);
    resetOverlapScan();
  };

  const displayRows = useMemo(() => {
    const visibleRows = hideUnselected && hasMainSelection
      ? filteredRows.filter((row) => selectedIdSet.has(String(row.annotation.id)))
      : filteredRows;

    if (!sortState && overlapKeys === null) return visibleRows;

    return [...visibleRows].sort((first, second) => {
      if (!sortState) {
        const firstGroup = overlapGroups.get(getAnnotationOverlapKey(first.annotation)) || '';
        const secondGroup = overlapGroups.get(getAnnotationOverlapKey(second.annotation)) || '';
        return firstGroup.localeCompare(secondGroup, undefined, { numeric: true })
          || first.annotation.stem.localeCompare(second.annotation.stem)
          || first.annotation.id.localeCompare(second.annotation.id);
      }

      let comparison = 0;
      switch (sortState.key) {
        case 'id':
          comparison = first.annotation.id.localeCompare(second.annotation.id, undefined, { numeric: true });
          break;
        case 'label':
          comparison = first.annotation.label.localeCompare(second.annotation.label, undefined, { numeric: true });
          break;
        case 'type':
          comparison = first.annotation.type.localeCompare(second.annotation.type, undefined, { numeric: true });
          break;
        case 'boxWidth':
          comparison = compareOptionalNumbers(first.boxWidth, second.boxWidth);
          break;
        case 'boxHeight':
          comparison = compareOptionalNumbers(first.boxHeight, second.boxHeight);
          break;
        case 'text':
          comparison = compareOptionalText(first.textValue, second.textValue);
          break;
        case 'groupId':
          comparison = compareOptionalText(first.groupIdValue, second.groupIdValue);
          break;
        case 'trackId':
          comparison = compareOptionalText(first.trackIdValue, second.trackIdValue);
          break;
        case 'points':
          comparison = first.pointsCount - second.pointsCount;
          break;
        case 'attributes':
          comparison = first.attributesText.localeCompare(second.attributesText, undefined, { numeric: true });
          break;
        case 'stem':
          comparison = first.annotation.stem.localeCompare(second.annotation.stem, undefined, { numeric: true });
          break;
        case 'overlap': {
          const firstGroup = overlapGroups.get(getAnnotationOverlapKey(first.annotation)) || '';
          const secondGroup = overlapGroups.get(getAnnotationOverlapKey(second.annotation)) || '';
          comparison = firstGroup.localeCompare(secondGroup, undefined, { numeric: true })
            || (overlapCounts.get(getAnnotationOverlapKey(first.annotation)) || 0)
              - (overlapCounts.get(getAnnotationOverlapKey(second.annotation)) || 0);
          break;
        }
        default:
          comparison = 0;
      }

      return (comparison * (sortState.direction === 'asc' ? 1 : -1))
        || first.annotation.stem.localeCompare(second.annotation.stem, undefined, { numeric: true })
        || first.annotation.id.localeCompare(second.annotation.id, undefined, { numeric: true });
    });
  }, [filteredRows, hasMainSelection, hideUnselected, overlapCounts, overlapGroups, overlapKeys, selectedIdSet, sortState]);

  const hasFilters = classFilter !== 'all'
    || typeFilter !== 'all'
    || Boolean(annotationIdFilter.trim())
    || Boolean(textFilter.trim())
    || Boolean(groupIdFilter.trim())
    || Boolean(trackIdFilter.trim())
    || Boolean(pointsFilter.trim())
    || Boolean(attributesFilter.trim())
    || Boolean(sceneFilter.trim())
    || Boolean(minBoxWidth.trim())
    || Boolean(maxBoxWidth.trim())
    || Boolean(minBoxHeight.trim())
    || Boolean(maxBoxHeight.trim())
    || Boolean(overlapGroupFilter.trim())
    || overlapKeys !== null
    || (hideUnselected && hasMainSelection);

  const configurableColumnKeys = useMemo<AnnotationTableColumnKey[]>(() => (
    DEFAULT_COLUMN_ORDER.filter((key) => {
      if (SCENE_GROUP_INFO_COLUMNS.includes(key)) return showSceneGroupInfo;
      if (key === 'overlap') return overlapKeys !== null;
      return true;
    })
  ), [overlapKeys, showSceneGroupInfo]);

  const columnSettingsKeys = useMemo<AnnotationTableColumnKey[]>(() => {
    const available = new Set(configurableColumnKeys);
    const ordered = [
      ...columnOrder.filter((key) => available.has(key)),
      ...configurableColumnKeys.filter((key) => !columnOrder.includes(key)),
    ];
    return ['row', ...ordered.filter((key) => key !== 'row')];
  }, [columnOrder, configurableColumnKeys]);

  const availableColumnKeys = useMemo<AnnotationTableColumnKey[]>(() => (
    columnSettingsKeys.filter((key) => key === 'row' || !hiddenColumns.has(key))
  ), [columnSettingsKeys, hiddenColumns]);

  const tableColumnKeys = availableColumnKeys;

  const getColumnWidth = (key: AnnotationTableColumnKey) => (
    key === 'row' ? DEFAULT_COLUMN_WIDTHS.row : columnWidths[key]
  );

  const tableWidth = tableColumnKeys.reduce(
    (total, key) => total + getColumnWidth(key),
    0,
  );

  const handleColumnResizePointerDown = (
    event: React.PointerEvent<HTMLSpanElement>,
    key: AnnotationTableColumnKey,
  ) => {
    if (key === 'row') return;
    columnResizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: getColumnWidth(key),
    };
    setResizingColumn(key);
    event.preventDefault();
    event.stopPropagation();
  };

  const renderColumnResizer = (key: AnnotationTableColumnKey) => key === 'row' ? null : (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={t('taxonomyDashboard.resizeColumn', 'Resize column')}
      title={t('taxonomyDashboard.resizeColumn', 'Drag to resize column')}
      onPointerDown={(event) => handleColumnResizePointerDown(event, key)}
      className={`absolute right-[-3px] top-0 z-20 h-full w-2 cursor-col-resize transition-colors hover:bg-blue-400/70 ${resizingColumn === key ? 'bg-blue-500' : 'bg-transparent'}`}
    />
  );

  const getColumnLabel = (key: AnnotationTableColumnKey) => {
    switch (key) {
      case 'row': return '#';
      case 'id': return t('taxonomyDashboard.annotationId', 'Annotation ID');
      case 'label': return t('taxonomyDashboard.className', 'Class');
      case 'type': return t('taxonomyDashboard.annotationType', 'Type');
      case 'boxWidth': return t('taxonomyDashboard.boxWidthShort', 'Box W');
      case 'boxHeight': return t('taxonomyDashboard.boxHeightShort', 'Box H');
      case 'text': return t('taxonomyDashboard.annotationText', 'Text');
      case 'groupId': return t('taxonomyDashboard.annotationGroupId', 'Group ID');
      case 'trackId': return t('taxonomyDashboard.annotationTrackId', 'Track ID');
      case 'points': return t('taxonomyDashboard.annotationPoints', 'Points');
      case 'attributes': return t('taxonomyDashboard.annotationAttributes', 'Attributes');
      case 'stem': return t('taxonomyDashboard.sceneGroup', 'Scene Group');
      case 'imageName': return t('sceneGroupManager.imageName', 'Image');
      case 'imageWidth': return t('sceneGroupManager.imageWidth', 'Image width');
      case 'imageHeight': return t('sceneGroupManager.imageHeight', 'Image height');
      case 'latitude': return t('sceneGroupManager.latitude', 'Latitude');
      case 'longitude': return t('sceneGroupManager.longitude', 'Longitude');
      case 'altitude': return t('sceneGroupManager.height', 'Height / Altitude');
      case 'heading': return t('sceneGroupManager.heading', 'Heading');
      case 'utc': return t('sceneGroupManager.utc', 'UTC');
      case 'overlap': return t('taxonomyDashboard.overlapGroup', 'Overlap group');
      case 'action': return t('taxonomyDashboard.openAnnotation', 'Open annotation');
      default: return key;
    }
  };

  const handleColumnDragStart = (event: React.DragEvent, key: AnnotationTableColumnKey) => {
    if (key === 'row') return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/annotation-table-column', key);
  };

  const handleColumnDrop = (event: React.DragEvent, targetKey: AnnotationTableColumnKey) => {
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData('text/annotation-table-column') as AnnotationTableColumnKey;
    if (!sourceKey || sourceKey === targetKey || sourceKey === 'row' || targetKey === 'row') return;

    setColumnOrder((current) => {
      const normalized = [
        ...current,
        ...DEFAULT_COLUMN_ORDER.filter((key) => !current.includes(key)),
      ];
      const sourceIndex = normalized.indexOf(sourceKey);
      const targetIndex = normalized.indexOf(targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...normalized];
      next.splice(sourceIndex, 1);
      next.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, sourceKey);
      return next;
    });
  };

  const resetColumnOrder = () => setColumnOrder([...DEFAULT_COLUMN_ORDER]);

  const resetColumnWidths = () => {
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    setColumnWidthDrafts(Object.fromEntries(
      DEFAULT_COLUMN_ORDER.map((key) => [key, String(DEFAULT_COLUMN_WIDTHS[key])]),
    ));
  };

  const swapColumns = (firstKey: AnnotationTableColumnKey, secondKey: AnnotationTableColumnKey) => {
    if (firstKey === secondKey || firstKey === 'row' || secondKey === 'row') return;
    setColumnOrder((current) => {
      const normalized = [
        ...current,
        ...DEFAULT_COLUMN_ORDER.filter((key) => !current.includes(key)),
      ];
      const firstIndex = normalized.indexOf(firstKey);
      const secondIndex = normalized.indexOf(secondKey);
      if (firstIndex < 0 || secondIndex < 0) return current;
      const next = [...normalized];
      [next[firstIndex], next[secondIndex]] = [next[secondIndex], next[firstIndex]];
      return next;
    });
  };

  const moveColumn = (key: AnnotationTableColumnKey, direction: 'up' | 'down') => {
    if (key === 'row') return;
    const movableKeys = tableColumnKeys.filter((columnKey) => columnKey !== 'row');
    const index = movableKeys.indexOf(key);
    const target = movableKeys[index + (direction === 'up' ? -1 : 1)];
    if (target) swapColumns(key, target);
  };

  const moveColumnToEdge = (key: AnnotationTableColumnKey, edge: 'first' | 'last') => {
    if (key === 'row') return;
    setColumnOrder((current) => {
      const normalized = [
        ...current,
        ...DEFAULT_COLUMN_ORDER.filter((columnKey) => !current.includes(columnKey)),
      ];
      const sourceIndex = normalized.indexOf(key);
      if (sourceIndex < 0) return current;

      const next = [...normalized];
      next.splice(sourceIndex, 1);
      const remainingVisible = tableColumnKeys.filter((columnKey) => columnKey !== 'row' && columnKey !== key);
      const edgeKey = edge === 'first'
        ? remainingVisible[0]
        : remainingVisible[remainingVisible.length - 1];
      const edgeIndex = edgeKey ? next.indexOf(edgeKey) : -1;
      const insertIndex = edge === 'first'
        ? edgeIndex < 0 ? next.indexOf('row') + 1 : edgeIndex
        : edgeIndex < 0 ? next.length : edgeIndex + 1;
      next.splice(insertIndex, 0, key);
      return next;
    });
  };

  const commitColumnWidth = (key: AnnotationTableColumnKey) => {
    if (key === 'row') return;
    const draft = columnWidthDrafts[key] ?? String(columnWidths[key]);
    const parsed = Number(draft);
    const nextWidth = Number.isFinite(parsed) && parsed > 0
      ? Math.max(MIN_COLUMN_WIDTHS[key], Math.round(parsed))
      : columnWidths[key];
    setColumnWidths((current) => ({ ...current, [key]: nextWidth }));
    setColumnWidthDrafts((current) => ({ ...current, [key]: String(nextWidth) }));
  };

  const toggleColumnVisibility = (key: AnnotationTableColumnKey) => {
    if (key === 'row') return;
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSortableHeader = (label: string, key: AnnotationTableSortKey, align: 'left' | 'right' = 'left') => {
    const isActive = sortState?.key === key;
    const sortIcon = isActive
      ? sortState.direction === 'asc'
        ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
        : <ChevronDown className="h-3 w-3" aria-hidden="true" />
      : <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;

    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex w-full items-center gap-1 text-[10px] font-black uppercase tracking-wider hover:text-blue-600 dark:hover:text-blue-300 ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`}
        title={t('taxonomyDashboard.sortColumnHint', 'Click to sort; click again to reverse; click a third time to reset')}
      >
        <span>{label}</span>
        {sortIcon}
      </button>
    );
  };

  const renderHeaderCell = (key: AnnotationTableColumnKey, children: React.ReactNode, className = 'px-3 py-3') => (
    <th
      key={key}
      data-column-key={key}
      draggable={key !== 'row'}
      onDragStart={key === 'row' ? undefined : (event) => handleColumnDragStart(event, key)}
      onDragOver={key === 'row' ? undefined : (event) => event.preventDefault()}
      onDrop={key === 'row' ? undefined : (event) => handleColumnDrop(event, key)}
      className={className}
    >
      {children}
      {renderColumnResizer(key)}
    </th>
  );

  const renderHeaderForKey = (key: AnnotationTableColumnKey) => {
    switch (key) {
      case 'row':
        return renderHeaderCell(key, '#', 'px-3 py-3 text-left font-black');
      case 'id':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'id'));
      case 'label':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'label'));
      case 'type':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'type'));
      case 'boxWidth':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'boxWidth', 'right'), 'px-3 py-3 text-right');
      case 'boxHeight':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'boxHeight', 'right'), 'px-3 py-3 text-right');
      case 'text':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'text'));
      case 'groupId':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'groupId'));
      case 'trackId':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'trackId'));
      case 'points':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'points', 'right'), 'px-3 py-3 text-right');
      case 'attributes':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'attributes'));
      case 'stem':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'stem'));
      case 'imageName':
      case 'imageWidth':
      case 'imageHeight':
      case 'latitude':
      case 'longitude':
      case 'altitude':
      case 'heading':
      case 'utc':
        return renderHeaderCell(key, getColumnLabel(key));
      case 'overlap':
        return renderHeaderCell(key, renderSortableHeader(getColumnLabel(key), 'overlap'));
      case 'action':
        return renderHeaderCell(key, null, 'px-3 py-3 text-right');
      default:
        return renderHeaderCell(key, getColumnLabel(key));
    }
  };

  const renderFilterCell = (key: AnnotationTableColumnKey) => {
    const cell = (children?: React.ReactNode) => (
      <th key={key} className="px-3 py-1.5">{children}</th>
    );

    switch (key) {
      case 'id':
        return cell(
          <Input value={annotationIdFilter} onChange={(event) => setAnnotationIdFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterId', 'Find ID')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />,
        );
      case 'label':
        return cell(
          <Select value={classFilter} onValueChange={setClassFilter} disabled={!isLoaded}>
            <SelectTrigger className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"><SelectValue placeholder={t('taxonomyDashboard.className', 'Class')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('taxonomyDashboard.allClasses', 'All classes')}</SelectItem>
              {classOptions.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}
            </SelectContent>
          </Select>,
        );
      case 'type':
        return cell(
          <Select value={typeFilter} onValueChange={setTypeFilter} disabled={!isLoaded}>
            <SelectTrigger className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"><SelectValue placeholder={t('taxonomyDashboard.annotationType', 'Type')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('taxonomyDashboard.allTypes', 'All types')}</SelectItem>
              {typeOptions.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>,
        );
      case 'boxWidth':
        return cell(
          <div className="space-y-1">
            <Input type="number" min="0" value={minBoxWidth} onChange={(event) => setMinBoxWidth(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.min', 'min')} className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900" />
            <Input type="number" min="0" value={maxBoxWidth} onChange={(event) => setMaxBoxWidth(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.max', 'max')} className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900" />
          </div>,
        );
      case 'boxHeight':
        return cell(
          <div className="space-y-1">
            <Input type="number" min="0" value={minBoxHeight} onChange={(event) => setMinBoxHeight(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.min', 'min')} className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900" />
            <Input type="number" min="0" value={maxBoxHeight} onChange={(event) => setMaxBoxHeight(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.max', 'max')} className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900" />
          </div>,
        );
      case 'text':
        return cell(<Input value={textFilter} onChange={(event) => setTextFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterText', 'Find text')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      case 'groupId':
        return cell(<Input value={groupIdFilter} onChange={(event) => setGroupIdFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterGroupId', 'Find group ID')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      case 'trackId':
        return cell(<Input value={trackIdFilter} onChange={(event) => setTrackIdFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterTrackId', 'Find track ID')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      case 'points':
        return cell(<Input value={pointsFilter} onChange={(event) => setPointsFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterPoints', 'Find points')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      case 'attributes':
        return cell(<Input value={attributesFilter} onChange={(event) => setAttributesFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterAttributes', 'Find attributes')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      case 'stem':
        return cell(<Input value={sceneFilter} onChange={(event) => setSceneFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterScene', 'Find scene')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      case 'overlap':
        return cell(<Input value={overlapGroupFilter} onChange={(event) => setOverlapGroupFilter(event.target.value)} disabled={!isLoaded} placeholder={t('taxonomyDashboard.filterOverlapGroup', 'Find group')} className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900" />);
      default:
        return cell();
    }
  };

  const renderDataCell = (
    key: AnnotationTableColumnKey,
    row: AnnotationTableRow,
    index: number,
    classDefinition: TaxonomyClass | undefined,
    knownAttributeCount: number,
  ) => {
    const sceneData = sceneGroupMetadata.get(row.annotation.stem);
    const metadata = sceneData?.metadata || null;
    const unavailable = sceneData?.error;
    const cellClass = 'px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400';

    switch (key) {
      case 'row': return <td key={key} className="px-3 py-2.5 text-neutral-400 font-mono">{index + 1}</td>;
      case 'id': return <td key={key} className={`${cellClass} max-w-[210px] truncate text-neutral-700 dark:text-neutral-300`} title={row.annotation.id}>{row.annotation.id}</td>;
      case 'label': return <td key={key} className="px-3 py-2.5"><span className="inline-flex max-w-full items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: classDefinition?.color || '#64748b' }} /><span className="truncate font-semibold" title={row.annotation.label}>{row.annotation.label}</span></span></td>;
      case 'type': return <td key={key} className="px-3 py-2.5"><span className="rounded bg-neutral-100 px-2 py-1 text-[10px] font-mono text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{row.annotation.type}</span></td>;
      case 'boxWidth': return <td key={key} className={`${cellClass} text-right`} title={t('taxonomyDashboard.boxWidth', 'Box width')}>{formatBoxDimension(row.boxWidth)}</td>;
      case 'boxHeight': return <td key={key} className={`${cellClass} text-right`} title={t('taxonomyDashboard.boxHeight', 'Box height')}>{formatBoxDimension(row.boxHeight)}</td>;
      case 'text': return <td key={key} className="max-w-[260px] truncate px-3 py-2.5 text-neutral-600 dark:text-neutral-400" title={row.textValue || '—'}>{formatCellText(row.textValue)}</td>;
      case 'groupId': return <td key={key} className={`${cellClass} max-w-[140px] truncate`} title={row.groupIdValue || '—'}>{formatCellText(row.groupIdValue)}</td>;
      case 'trackId': return <td key={key} className={`${cellClass} max-w-[160px] truncate`} title={row.trackIdValue || '—'}>{formatCellText(row.trackIdValue)}</td>;
      case 'points': return <td key={key} className={`${cellClass} text-right`} title={t('taxonomyDashboard.annotationPoints', 'Points')}>{row.pointsCount}</td>;
      case 'attributes': return <td key={key} className="max-w-[260px] truncate px-3 py-2.5 text-neutral-600 dark:text-neutral-400" title={row.attributesText}><span>{row.attributesText}</span>{knownAttributeCount > 0 && <span className="ml-2 text-[9px] text-purple-600 dark:text-purple-400">{knownAttributeCount}</span>}</td>;
      case 'stem': return <td key={key} className={`${cellClass} max-w-[250px] truncate`} title={row.annotation.stem}>{row.annotation.stem}</td>;
      case 'imageName': return <td key={key} className={`${cellClass} max-w-[260px] truncate`} title={sceneData?.imageName || '—'}>{formatMetadataValue(sceneData?.imageName)}</td>;
      case 'imageWidth': return <td key={key} className={cellClass}>{formatMetadataValue(sceneData?.imageWidth)}</td>;
      case 'imageHeight': return <td key={key} className={cellClass}>{formatMetadataValue(sceneData?.imageHeight)}</td>;
      case 'latitude': return <td key={key} className={cellClass}>{formatMetadataValue(readMetadataValue(metadata, ['latitude', 'lat', 'gps_latitude']))}</td>;
      case 'longitude': return <td key={key} className={cellClass}>{formatMetadataValue(readMetadataValue(metadata, ['longitude', 'lon', 'lng', 'gps_longitude']))}</td>;
      case 'altitude': return <td key={key} className={cellClass}>{formatMetadataValue(readMetadataValue(metadata, ['altitude', 'gps_altitude', 'elevation', 'height']))}</td>;
      case 'heading': return <td key={key} className={cellClass}>{formatMetadataValue(readMetadataValue(metadata, ['heading', 'yaw', 'course']))}</td>;
      case 'utc': return <td key={key} className={`${cellClass} max-w-[260px] truncate`} title={formatMetadataValue(readMetadataValue(metadata, ['utc_iso', 'utc', 'timestamp']))}>{unavailable ? <span className="text-amber-600 dark:text-amber-300">{t('sceneGroupManager.loadFailed', 'Unavailable')}</span> : formatMetadataValue(readMetadataValue(metadata, ['utc_iso', 'utc', 'timestamp']))}</td>;
      case 'overlap': return <td key={key} className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"><Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="font-mono">{overlapGroups.get(getAnnotationOverlapKey(row.annotation)) || '—'}</span><span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] dark:bg-red-900/50">{overlapCounts.get(getAnnotationOverlapKey(row.annotation)) || 0}</span></span></td>;
      case 'action': return <td key={key} className="px-3 py-2.5 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); onOpenAnnotation(row.annotation, row.sceneObjectIndex); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300" title={t('taxonomyDashboard.openAnnotation', 'Open annotation')} aria-label={t('taxonomyDashboard.openAnnotation', 'Open annotation')}><ExternalLink className="w-3.5 h-3.5" /></button></td>;
      default: return <td key={key} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-950/30">
      <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={overlapKeys !== null ? 'secondary' : 'outline'}
            className="h-9 px-3 text-xs"
            onClick={() => setOverlapPanelOpen((previous) => !previous)}
            disabled={!isLoaded}
            title={t('rightPanel.findOverlapping', 'Find overlapping objects')}
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            {t('rightPanel.findOverlapping', 'Find overlapping objects')}
            {overlapKeys !== null && (
              <span className="ml-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                {overlapKeys.size}
              </span>
            )}
          </Button>

          <Button
            type="button"
            variant={columnOrderDialogOpen ? 'secondary' : 'outline'}
            className="h-9 px-3 text-xs"
            onClick={() => setColumnOrderDialogOpen(true)}
            disabled={!isLoaded}
            title={t('taxonomyDashboard.manageColumns', 'Manage columns')}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            {t('taxonomyDashboard.columnSettings', 'Columns Settings')}
          </Button>

          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 dark:border-neutral-700 dark:bg-neutral-900">
            <Switch
              checked={hideUnselected && hasMainSelection}
              onCheckedChange={setHideUnselected}
              disabled={!isLoaded || !hasMainSelection}
              aria-label={t('taxonomyDashboard.hideUnselected', 'Hide unselected')}
              className="scale-75"
            />
            <span className={`whitespace-nowrap text-xs ${hasMainSelection ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400'}`}>
              {t('taxonomyDashboard.hideUnselected', 'Hide unselected')}
            </span>
          </div>

          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 dark:border-neutral-700 dark:bg-neutral-900">
            <Switch
              checked={showSceneGroupInfo}
              onCheckedChange={setShowSceneGroupInfo}
              disabled={!isLoaded}
              aria-label={t('taxonomyDashboard.showSceneGroupInfo', 'Show scene group info')}
              className="scale-75"
            />
            <span className="whitespace-nowrap text-xs text-neutral-700 dark:text-neutral-200">
              {t('taxonomyDashboard.showSceneGroupInfo', 'Scene group info')}
              {sceneGroupMetadataLoading && (
                <span className="ml-1 font-mono text-[10px] text-neutral-400">
                  {sceneGroupMetadataProgress.current}/{sceneGroupMetadataProgress.total}
                </span>
              )}
            </span>
          </div>

          {hasFilters && (
            <Button type="button" variant="ghost" className="h-9 px-3 text-xs" onClick={clearFilters}>
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              {t('taxonomyDashboard.clearFilters', 'Clear filters')}
            </Button>
          )}
        </div>

        {overlapPanelOpen && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[150px]">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  {t('rightPanel.metric', 'Metric')}
                </label>
                <Select value={overlapMode} onValueChange={(value: 'iou' | 'ios') => setOverlapMode(value)}>
                  <SelectTrigger className="h-8 bg-white text-xs dark:bg-neutral-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ios" className="text-xs">{t('rightPanel.iosNested', 'IoS (Nested)')}</SelectItem>
                    <SelectItem value="iou" className="text-xs">{t('rightPanel.iouStandard', 'IoU (Standard)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px] flex-1">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <span>{t('rightPanel.threshold', 'Threshold')}</span>
                  <span className="font-mono text-blue-600 dark:text-blue-300">{overlapThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={overlapThreshold}
                  onChange={(event) => setOverlapThreshold(Number(event.target.value))}
                  onPointerDown={(event) => event.stopPropagation()}
                  aria-label={t('rightPanel.threshold', 'Threshold')}
                  className="h-4 w-full cursor-pointer accent-blue-600 dark:accent-blue-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  className="h-8 text-xs font-bold"
                  onClick={() => scanOverlaps(overlapMode, overlapThreshold)}
                  disabled={isScanningOverlaps || !isLoaded}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {isScanningOverlaps
                    ? t('taxonomyDashboard.scanningOverlaps', 'Scanning...')
                    : t('rightPanel.scanOverlapping', 'Scan Overlapping Objects')}
                </Button>
                {overlapKeys !== null && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={resetOverlapScan}
                  >
                    {t('rightPanel.nmsReset', 'Reset')}
                  </Button>
                )}
              </div>
            </div>

            {overlapKeys !== null && (
              <p className="mt-2 text-[11px] text-blue-700 dark:text-blue-300">
                {t('taxonomyDashboard.overlapScanResult', '{{objects}} overlapping objects in {{scenes}} scenes', {
                  objects: overlapKeys.size,
                  scenes: overlapSceneCount,
                })}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-5">
        {displayRows.length === 0 ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-neutral-400">
            <Filter className="w-10 h-10 mb-3 opacity-25" />
            <p className="text-sm font-semibold">
              {!isLoaded
                ? t('taxonomyDashboard.annotationTableNotLoaded', 'Click “Load annotations” to populate the table.')
                : loadedAnnotations.length === 0
                ? t('taxonomyDashboard.noAnnotations', 'No annotations in the current project.')
                : hideUnselected && hasMainSelection
                  ? t('taxonomyDashboard.noSelectedAnnotations', 'No selected annotations match the current filters.')
                : overlapKeys !== null && overlapKeys.size === 0
                  ? t('taxonomyDashboard.noOverlaps', 'No overlapping objects found.')
                : t('taxonomyDashboard.noAnnotationMatches', 'No annotations match the current filters.')}
            </p>
            {hasFilters && (
              <Button type="button" variant="link" className="text-xs mt-1" onClick={clearFilters}>
                {t('taxonomyDashboard.clearFilters', 'Clear filters')}
              </Button>
            )}
          </div>
        ) : (
          <div className="h-full max-w-full overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm custom-scrollbar">
            <table
              className="table-fixed border-collapse text-xs"
              style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
            >
              <colgroup>
                {tableColumnKeys.map((key) => (
                  <col key={key} style={{ width: `${getColumnWidth(key)}px` }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500 dark:bg-neutral-800/95 [&_th]:relative">
                <tr>{tableColumnKeys.map((key) => renderHeaderForKey(key))}</tr>
                <tr className="border-t border-neutral-200/80 dark:border-neutral-700/80">
                  {tableColumnKeys.map((key) => renderFilterCell(key))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {displayRows.map((row, index) => {
                  const classDefinition = taxonomyClasses.find((taxonomyClass) => taxonomyClass.name === row.annotation.label);
                  const knownAttributeCount = Object.keys(row.annotation.attributes || {})
                    .filter((name) => taxonomyAttributeNames.has(name)).length;
                  const isSelected = selectedIdSet.has(String(row.annotation.id));

                  return (
                    <tr
                      key={`${row.annotation.id}-${row.annotation.stem}-${index}`}
                      onDoubleClick={() => onOpenAnnotation(row.annotation, row.sceneObjectIndex)}
                      aria-selected={isSelected}
                      className={`group cursor-pointer transition-colors ${isSelected
                        ? 'bg-blue-100/80 shadow-[inset_3px_0_0_#2563eb] dark:bg-blue-950/50 dark:shadow-[inset_3px_0_0_#60a5fa]'
                        : 'hover:bg-blue-50/60 dark:hover:bg-blue-950/20'}`}
                      title={t('taxonomyDashboard.openAnnotationHint', 'Double-click to open this annotation in the workspace')}
                    >
                      {tableColumnKeys.map((key) => renderDataCell(
                        key,
                        row,
                        index,
                        classDefinition,
                        knownAttributeCount,
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={columnOrderDialogOpen} onOpenChange={setColumnOrderDialogOpen}>
        <DialogContent
          className="max-w-none"
          style={{ width: '600px', maxWidth: 'calc(100vw - 32px)' }}
        >
          <DialogHeader>
            <DialogTitle>{t('taxonomyDashboard.columnOrder', 'Column order')}</DialogTitle>
          </DialogHeader>
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 text-[10px] font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <span>{t('taxonomyDashboard.column', 'Column')}</span>
            <span>{t('taxonomyDashboard.columnWidth', 'Width')}</span>
            <span>{t('taxonomyDashboard.columnVisibility', 'Visible')}</span>
            <span>{t('taxonomyDashboard.columnOrderActions', 'Order')}</span>
          </div>
          <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {columnSettingsKeys.map((key) => {
              const isFixed = key === 'row';
              const isHidden = hiddenColumns.has(key);
              const movableKeys = tableColumnKeys.filter((columnKey) => columnKey !== 'row');
              const movableIndex = movableKeys.indexOf(key);
              const canMove = !isFixed && !isHidden && movableIndex >= 0;
              const isFirst = !canMove || movableIndex === 0;
              const isLast = !canMove || movableIndex === movableKeys.length - 1;

              return (
                <div
                  key={key}
                  draggable={!isFixed && !isHidden}
                  onDragStart={isFixed || isHidden ? undefined : (event) => handleColumnDragStart(event, key)}
                  onDragOver={isFixed || isHidden ? undefined : (event) => event.preventDefault()}
                  onDrop={isFixed || isHidden ? undefined : (event) => handleColumnDrop(event, key)}
                  className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-lg border px-3 py-1.5 text-sm ${isFixed
                    ? 'border-neutral-200 bg-neutral-100/70 dark:border-neutral-700 dark:bg-neutral-800/60'
                    : isHidden
                      ? 'border-dashed border-neutral-200 bg-neutral-50/70 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400'
                      : 'border-neutral-200 bg-white active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-900'}`}
                >
                  <div className={`flex min-w-0 items-center gap-2 ${!isFixed && !isHidden ? 'cursor-grab' : ''}`}>
                    <GripVertical className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                    <span className="truncate">{getColumnLabel(key)}</span>
                    {isFixed && <span className="text-[10px] text-neutral-400">{t('taxonomyDashboard.fixedColumn', 'Fixed')}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={MIN_COLUMN_WIDTHS[key]}
                      step="1"
                      value={columnWidthDrafts[key] ?? String(getColumnWidth(key))}
                      onChange={(event) => setColumnWidthDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      onBlur={() => commitColumnWidth(key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitColumnWidth(key);
                        }
                      }}
                      disabled={isFixed}
                      className="h-7 w-20 text-center text-xs"
                      aria-label={`${getColumnLabel(key)} ${t('taxonomyDashboard.columnWidth', 'width')}`}
                    />
                    <span className="text-[10px] text-neutral-400">px</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={isFixed}
                    onClick={() => toggleColumnVisibility(key)}
                    title={isHidden
                      ? t('taxonomyDashboard.showColumn', 'Show column')
                      : t('taxonomyDashboard.hideColumn', 'Hide column')}
                    aria-label={isHidden
                      ? t('taxonomyDashboard.showColumn', 'Show column')
                      : t('taxonomyDashboard.hideColumn', 'Hide column')}
                  >
                    {isHidden
                      ? <EyeOff className="h-3.5 w-3.5" />
                      : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isFirst}
                      onClick={() => moveColumnToEdge(key, 'first')}
                      title={t('taxonomyDashboard.moveColumnFirst', 'Move to first')}
                      aria-label={t('taxonomyDashboard.moveColumnFirst', 'Move to first')}
                    >
                      <ChevronsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isFirst}
                      onClick={() => moveColumn(key, 'up')}
                      title={t('taxonomyDashboard.moveColumnUp', 'Move up')}
                      aria-label={t('taxonomyDashboard.moveColumnUp', 'Move up')}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isLast}
                      onClick={() => moveColumn(key, 'down')}
                      title={t('taxonomyDashboard.moveColumnDown', 'Move down')}
                      aria-label={t('taxonomyDashboard.moveColumnDown', 'Move down')}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isLast}
                      onClick={() => moveColumnToEdge(key, 'last')}
                      title={t('taxonomyDashboard.moveColumnLast', 'Move to last')}
                      aria-label={t('taxonomyDashboard.moveColumnLast', 'Move to last')}
                    >
                      <ChevronsDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-2 pt-3">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={resetColumnOrder}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('taxonomyDashboard.resetColumnOrder', 'Reset order')}
              </Button>
              <Button type="button" variant="outline" onClick={resetColumnWidths}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('taxonomyDashboard.resetColumnWidths', 'Reset widths')}
              </Button>
            </div>
            <Button type="button" onClick={() => setColumnOrderDialogOpen(false)}>
              {t('common.confirm', 'Confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
