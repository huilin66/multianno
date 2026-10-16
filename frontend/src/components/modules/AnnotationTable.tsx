import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Copy, ExternalLink, Filter, Link2, RefreshCw, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFileContent } from '../../api/client';
import { useStore, type Annotation, type TaxonomyAttribute, type TaxonomyClass } from '../../store/useStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
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

interface AnnotationTableSortState {
  key: AnnotationTableSortKey;
  direction: 'asc' | 'desc';
}

interface AnnotationTableMemoryState {
  loadedAnnotations: Annotation[] | null;
  query: string;
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

const sceneGroupMetadataSearchText = (data: SceneGroupMetadata | undefined) => {
  if (!data) return '';
  return [
    data.imageName,
    data.imageWidth,
    data.imageHeight,
    ...(data.metadata ? Object.values(data.metadata) : []),
    readMetadataValue(data.metadata, ['latitude', 'lat', 'gps_latitude']),
    readMetadataValue(data.metadata, ['longitude', 'lon', 'lng', 'gps_longitude']),
    readMetadataValue(data.metadata, ['altitude', 'gps_altitude', 'elevation', 'height']),
    readMetadataValue(data.metadata, ['heading', 'yaw', 'course']),
    readMetadataValue(data.metadata, ['utc_iso', 'utc', 'timestamp']),
  ].map((value) => String(value ?? '')).join(' ');
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
  const [query, setQuery] = useState(() => rememberedState?.query ?? '');
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
      query,
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
    query,
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
    const normalizedQuery = query.trim().toLowerCase();
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
      if (!normalizedQuery) return true;

      return [
        annotation.id,
        annotation.label,
        annotation.type,
        annotation.stem,
        row.textValue,
        row.groupIdValue,
        row.trackIdValue,
        String(row.pointsCount),
        row.attributesText,
        formatBoxDimension(row.boxWidth),
        formatBoxDimension(row.boxHeight),
        overlapGroup,
        showSceneGroupInfo ? sceneGroupMetadataSearchText(sceneGroupMetadata.get(annotation.stem)) : '',
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [annotationIdFilter, attributesFilter, classFilter, groupIdFilter, maxBoxHeight, maxBoxWidth, minBoxHeight, minBoxWidth, overlapGroupFilter, overlapGroups, overlapKeys, pointsFilter, query, rows, sceneFilter, sceneGroupMetadata, showSceneGroupInfo, textFilter, trackIdFilter, typeFilter]);

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

  const loadAnnotations = () => {
    overlapScanRequestRef.current += 1;
    setLoadedAnnotations(cloneAnnotations(annotations));
    setOverlapKeys(null);
    setOverlapCounts(new Map());
    setOverlapGroups(new Map());
    setIsScanningOverlaps(false);
  };

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
    setQuery('');
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

  const hasFilters = Boolean(query.trim())
    || classFilter !== 'all'
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
  const classCount = new Set(displayRows.map((row) => row.annotation.label)).size;
  const sceneCount = new Set(displayRows.map((row) => row.annotation.stem)).size;

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-950/30">
      <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{t('taxonomyDashboard.annotationTable', 'Annotation Table')}</h2>
            <p className="text-xs text-neutral-500 mt-1">
              {t('taxonomyDashboard.annotationTableDesc', 'Browse and filter every annotation in the current project.')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isLoaded && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500">
                <span className="rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1">
                  {displayRows.length} {t('taxonomyDashboard.objects', 'objects')}
                </span>
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1">
                  {sceneCount} {t('taxonomyDashboard.scenes', 'scenes')}
                </span>
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1">
                  {classCount} {t('taxonomyDashboard.classes', 'classes')}
                </span>
              </div>
            )}
            <Button
              type="button"
              variant={isLoaded ? 'outline' : 'default'}
              className="h-8 px-3 text-xs font-bold"
              onClick={loadAnnotations}
              title={t('taxonomyDashboard.annotationTableLoadHint', 'Load a snapshot of the current annotations into the table')}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {isLoaded
                ? t('taxonomyDashboard.reloadAnnotations', 'Reload annotations')
                : t('taxonomyDashboard.loadAnnotations', 'Load annotations')}
            </Button>
          </div>
        </div>

        {!isLoaded && (
          <p className="mt-3 text-[11px] text-neutral-500">
            {t('taxonomyDashboard.annotationTableLoadHint', 'Load a snapshot of the current annotations into the table. The table will not update automatically.')}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!isLoaded}
              placeholder={t('taxonomyDashboard.annotationSearch', 'Search ID, class, text, group ID, track ID or scene group...')}
              className="h-9 pl-9 pr-8 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label={t('taxonomyDashboard.clearAnnotationSearch', 'Clear search')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

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
            <table className={`w-full ${showSceneGroupInfo ? 'min-w-[2520px]' : 'min-w-[1680px]'} border-collapse text-xs`}>
              <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-800/95 text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="w-10 px-3 py-3 text-left font-black">#</th>
                  <th className="w-52 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.annotationId', 'Annotation ID'), 'id')}</th>
                  <th className="w-44 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.className', 'Class'), 'label')}</th>
                  <th className="w-28 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.annotationType', 'Type'), 'type')}</th>
                  <th className="w-24 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.boxWidthShort', 'Box W'), 'boxWidth', 'right')}</th>
                  <th className="w-24 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.boxHeightShort', 'Box H'), 'boxHeight', 'right')}</th>
                  <th className="min-w-[220px] px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.annotationText', 'Text'), 'text')}</th>
                  <th className="w-32 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.annotationGroupId', 'Group ID'), 'groupId')}</th>
                  <th className="w-36 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.annotationTrackId', 'Track ID'), 'trackId')}</th>
                  <th className="w-20 px-3 py-3 text-right">{renderSortableHeader(t('taxonomyDashboard.annotationPoints', 'Points'), 'points', 'right')}</th>
                  <th className="min-w-[220px] px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.annotationAttributes', 'Attributes'), 'attributes')}</th>
                  <th className="min-w-[220px] px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.sceneGroup', 'Scene Group'), 'stem')}</th>
                  {showSceneGroupInfo && (
                    <>
                      <th className="min-w-[220px] px-3 py-3">{t('sceneGroupManager.imageName', 'Image')}</th>
                      <th className="w-28 px-3 py-3">{t('sceneGroupManager.imageWidth', 'Image width')}</th>
                      <th className="w-28 px-3 py-3">{t('sceneGroupManager.imageHeight', 'Image height')}</th>
                      <th className="w-32 px-3 py-3">{t('sceneGroupManager.latitude', 'Latitude')}</th>
                      <th className="w-32 px-3 py-3">{t('sceneGroupManager.longitude', 'Longitude')}</th>
                      <th className="w-32 px-3 py-3">{t('sceneGroupManager.height', 'Height / Altitude')}</th>
                      <th className="w-32 px-3 py-3">{t('sceneGroupManager.heading', 'Heading')}</th>
                      <th className="min-w-[220px] px-3 py-3">{t('sceneGroupManager.utc', 'UTC')}</th>
                    </>
                  )}
                  {overlapKeys !== null && (
                    <th className="w-40 px-3 py-3">{renderSortableHeader(t('taxonomyDashboard.overlapGroup', 'Overlap group'), 'overlap')}</th>
                  )}
                  <th className="w-12 px-3 py-3" />
                </tr>
                <tr className="border-t border-neutral-200/80 dark:border-neutral-700/80">
                  <th className="px-3 py-1.5" />
                  <th className="px-3 py-1.5">
                    <Input
                      value={annotationIdFilter}
                      onChange={(event) => setAnnotationIdFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterId', 'Find ID')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  <th className="px-3 py-1.5">
                    <Select value={classFilter} onValueChange={setClassFilter} disabled={!isLoaded}>
                      <SelectTrigger className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900">
                        <SelectValue placeholder={t('taxonomyDashboard.className', 'Class')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('taxonomyDashboard.allClasses', 'All classes')}</SelectItem>
                        {classOptions.map((className) => (
                          <SelectItem key={className} value={className}>{className}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </th>
                  <th className="px-3 py-1.5">
                    <Select value={typeFilter} onValueChange={setTypeFilter} disabled={!isLoaded}>
                      <SelectTrigger className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900">
                        <SelectValue placeholder={t('taxonomyDashboard.annotationType', 'Type')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('taxonomyDashboard.allTypes', 'All types')}</SelectItem>
                        {typeOptions.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </th>
                  <th className="px-3 py-1.5">
                    <div className="space-y-1">
                      <Input
                        type="number"
                        min="0"
                        value={minBoxWidth}
                        onChange={(event) => setMinBoxWidth(event.target.value)}
                        disabled={!isLoaded}
                        placeholder={t('taxonomyDashboard.min', 'min')}
                        className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={maxBoxWidth}
                        onChange={(event) => setMaxBoxWidth(event.target.value)}
                        disabled={!isLoaded}
                        placeholder={t('taxonomyDashboard.max', 'max')}
                        className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900"
                      />
                    </div>
                  </th>
                  <th className="px-3 py-1.5">
                    <div className="space-y-1">
                      <Input
                        type="number"
                        min="0"
                        value={minBoxHeight}
                        onChange={(event) => setMinBoxHeight(event.target.value)}
                        disabled={!isLoaded}
                        placeholder={t('taxonomyDashboard.min', 'min')}
                        className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={maxBoxHeight}
                        onChange={(event) => setMaxBoxHeight(event.target.value)}
                        disabled={!isLoaded}
                        placeholder={t('taxonomyDashboard.max', 'max')}
                        className="h-7 w-full bg-white text-right text-[10px] dark:bg-neutral-900"
                      />
                    </div>
                  </th>
                  <th className="px-3 py-1.5">
                    <Input
                      value={textFilter}
                      onChange={(event) => setTextFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterText', 'Find text')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  <th className="px-3 py-1.5">
                    <Input
                      value={groupIdFilter}
                      onChange={(event) => setGroupIdFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterGroupId', 'Find group ID')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  <th className="px-3 py-1.5">
                    <Input
                      value={trackIdFilter}
                      onChange={(event) => setTrackIdFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterTrackId', 'Find track ID')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  <th className="px-3 py-1.5">
                    <Input
                      value={pointsFilter}
                      onChange={(event) => setPointsFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterPoints', 'Find points')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  <th className="px-3 py-1.5">
                    <Input
                      value={attributesFilter}
                      onChange={(event) => setAttributesFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterAttributes', 'Find attributes')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  <th className="px-3 py-1.5">
                    <Input
                      value={sceneFilter}
                      onChange={(event) => setSceneFilter(event.target.value)}
                      disabled={!isLoaded}
                      placeholder={t('taxonomyDashboard.filterScene', 'Find scene')}
                      className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                    />
                  </th>
                  {showSceneGroupInfo && (
                    <>
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                      <th className="px-3 py-1.5" />
                    </>
                  )}
                  {overlapKeys !== null && (
                    <th className="px-3 py-1.5">
                      <Input
                        value={overlapGroupFilter}
                        onChange={(event) => setOverlapGroupFilter(event.target.value)}
                        disabled={!isLoaded}
                        placeholder={t('taxonomyDashboard.filterOverlapGroup', 'Find group')}
                        className="h-7 w-full bg-white text-[10px] dark:bg-neutral-900"
                      />
                    </th>
                  )}
                  <th className="px-3 py-1.5" />
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
                      <td className="px-3 py-2.5 text-neutral-400 font-mono">{index + 1}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 max-w-[210px] truncate" title={row.annotation.id}>
                        {row.annotation.id}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2 max-w-full">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: classDefinition?.color || '#64748b' }}
                          />
                          <span className="font-semibold truncate" title={row.annotation.label}>{row.annotation.label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-[10px] font-mono text-neutral-600 dark:text-neutral-300">
                          {row.annotation.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-400" title={t('taxonomyDashboard.boxWidth', 'Box width')}>
                        {formatBoxDimension(row.boxWidth)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-400" title={t('taxonomyDashboard.boxHeight', 'Box height')}>
                        {formatBoxDimension(row.boxHeight)}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-400 max-w-[260px] truncate" title={row.textValue || '—'}>
                        {formatCellText(row.textValue)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 max-w-[140px] truncate" title={row.groupIdValue || '—'}>
                        {formatCellText(row.groupIdValue)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 max-w-[160px] truncate" title={row.trackIdValue || '—'}>
                        {formatCellText(row.trackIdValue)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-400" title={t('taxonomyDashboard.annotationPoints', 'Points')}>
                        {row.pointsCount}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-400 max-w-[260px] truncate" title={row.attributesText}>
                        <span>{row.attributesText}</span>
                        {knownAttributeCount > 0 && (
                          <span className="ml-2 text-[9px] text-purple-600 dark:text-purple-400">{knownAttributeCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 max-w-[250px] truncate" title={row.annotation.stem}>
                        {row.annotation.stem}
                      </td>
                      {showSceneGroupInfo && (() => {
                        const sceneData = sceneGroupMetadata.get(row.annotation.stem);
                        const metadata = sceneData?.metadata || null;
                        const unavailable = sceneData?.error;
                        return (
                          <>
                            <td className="max-w-[260px] truncate px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400" title={sceneData?.imageName || '—'}>
                              {formatMetadataValue(sceneData?.imageName)}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {formatMetadataValue(sceneData?.imageWidth)}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {formatMetadataValue(sceneData?.imageHeight)}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {formatMetadataValue(readMetadataValue(metadata, ['latitude', 'lat', 'gps_latitude']))}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {formatMetadataValue(readMetadataValue(metadata, ['longitude', 'lon', 'lng', 'gps_longitude']))}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {formatMetadataValue(readMetadataValue(metadata, ['altitude', 'gps_altitude', 'elevation', 'height']))}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {formatMetadataValue(readMetadataValue(metadata, ['heading', 'yaw', 'course']))}
                            </td>
                            <td className="max-w-[260px] truncate px-3 py-2.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400" title={formatMetadataValue(readMetadataValue(metadata, ['utc_iso', 'utc', 'timestamp']))}>
                              {unavailable
                                ? <span className="text-amber-600 dark:text-amber-300">{t('sceneGroupManager.loadFailed', 'Unavailable')}</span>
                                : formatMetadataValue(readMetadataValue(metadata, ['utc_iso', 'utc', 'timestamp']))}
                            </td>
                          </>
                        );
                      })()}
                      {overlapKeys !== null && (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="font-mono">{overlapGroups.get(getAnnotationOverlapKey(row.annotation)) || '—'}</span>
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] dark:bg-red-900/50">
                              {overlapCounts.get(getAnnotationOverlapKey(row.annotation)) || 0}
                            </span>
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenAnnotation(row.annotation, row.sceneObjectIndex);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
                          title={t('taxonomyDashboard.openAnnotation', 'Open annotation')}
                          aria-label={t('taxonomyDashboard.openAnnotation', 'Open annotation')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});
