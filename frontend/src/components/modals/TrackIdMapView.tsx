import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { getFileContent } from '../../api/client';
import {
  useStore,
  type Annotation,
  type FolderData,
  type ViewConfig,
} from '../../store/useStore';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';

interface TrackIdMapViewProps {
  initialTrackId?: string | null;
  onOpenObservation: (annotation: Annotation) => void;
}

interface ImageGps {
  latitude: number;
  longitude: number;
  altitude?: number;
  heading?: number;
  utcIso?: string;
}

interface TrackObservation {
  annotation: Annotation;
  gps: ImageGps;
}

interface TrackSummary {
  id: string;
  annotations: Annotation[];
  observations: TrackObservation[];
  labels: string[];
  stems: string[];
}

interface AssociationGroup {
  id: string;
  members: string[];
  updatedAt: number;
}

type ImageMetaRecord = Record<string, unknown>;

const ASSOCIATION_STORAGE_KEY = 'multianno.track-id-map-associations.v1';
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 620;
const MAP_PADDING = { left: 64, right: 28, top: 28, bottom: 52 };
const TRACK_COLORS = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#65a30d',
];

const getTrackIdLabel = (value: string | number | null | undefined) => String(value ?? '').trim();

const compareTrackIds = (left: string, right: string) => (
  right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' })
);

const getBaseName = (value: string) => {
  const normalized = String(value || '').replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
};

const getImageStem = (value: string) => getBaseName(value).replace(/\.[^.]+$/, '');

const getMetadataDirectory = (
  workspacePath: string | null,
  folders: FolderData[],
  views: ViewConfig[],
) => {
  if (workspacePath) return workspacePath;
  const mainView = views.find((view) => view.isMain) || views[0];
  return folders.find((folder) => folder.id === mainView?.folderId)?.path || folders[0]?.path || '';
};

const readFirstValue = (...sources: Array<{ source: ImageMetaRecord | null | undefined; keys: string[] }>) => {
  for (const { source, keys } of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
};

const toFiniteNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractImageGps = (value: unknown): ImageGps | null => {
  if (!value || typeof value !== 'object') return null;
  const root = value as ImageMetaRecord;
  const imageMeta = root.imageMeta && typeof root.imageMeta === 'object'
    ? root.imageMeta as ImageMetaRecord
    : root.image_meta && typeof root.image_meta === 'object'
      ? root.image_meta as ImageMetaRecord
      : root.metadata && typeof root.metadata === 'object'
        ? root.metadata as ImageMetaRecord
        : null;
  const rootGps = root.gps && typeof root.gps === 'object' ? root.gps as ImageMetaRecord : null;
  const metaGps = imageMeta?.gps && typeof imageMeta.gps === 'object' ? imageMeta.gps as ImageMetaRecord : null;
  const rootLocation = root.location && typeof root.location === 'object' ? root.location as ImageMetaRecord : null;
  const metaLocation = imageMeta?.location && typeof imageMeta.location === 'object'
    ? imageMeta.location as ImageMetaRecord
    : null;

  const latitude = toFiniteNumber(readFirstValue(
    { source: root, keys: ['latitude', 'lat', 'gps_latitude', 'gps_lat', 'latitude_deg'] },
    { source: imageMeta, keys: ['latitude', 'lat', 'gps_latitude', 'gps_lat', 'latitude_deg'] },
    { source: rootGps, keys: ['latitude', 'lat'] },
    { source: metaGps, keys: ['latitude', 'lat'] },
    { source: rootLocation, keys: ['latitude', 'lat'] },
    { source: metaLocation, keys: ['latitude', 'lat'] },
  ));
  const longitude = toFiniteNumber(readFirstValue(
    { source: root, keys: ['longitude', 'lon', 'lng', 'gps_longitude', 'gps_lon', 'longitude_deg'] },
    { source: imageMeta, keys: ['longitude', 'lon', 'lng', 'gps_longitude', 'gps_lon', 'longitude_deg'] },
    { source: rootGps, keys: ['longitude', 'lon', 'lng'] },
    { source: metaGps, keys: ['longitude', 'lon', 'lng'] },
    { source: rootLocation, keys: ['longitude', 'lon', 'lng'] },
    { source: metaLocation, keys: ['longitude', 'lon', 'lng'] },
  ));

  if (latitude === null || longitude === null) return null;

  const altitudeValue = readFirstValue(
    { source: root, keys: ['altitude', 'gps_altitude', 'elevation', 'height'] },
    { source: imageMeta, keys: ['altitude', 'gps_altitude', 'elevation', 'height'] },
    { source: rootGps, keys: ['altitude', 'elevation', 'height'] },
    { source: metaGps, keys: ['altitude', 'elevation', 'height'] },
  );
  const headingValue = readFirstValue(
    { source: root, keys: ['heading', 'yaw', 'course'] },
    { source: imageMeta, keys: ['heading', 'yaw', 'course'] },
    { source: rootGps, keys: ['heading', 'yaw', 'course'] },
    { source: metaGps, keys: ['heading', 'yaw', 'course'] },
  );
  const utcValue = readFirstValue(
    { source: root, keys: ['utc_iso', 'utcIso', 'timestamp', 'time'] },
    { source: imageMeta, keys: ['utc_iso', 'utcIso', 'timestamp', 'time'] },
    { source: rootGps, keys: ['utc_iso', 'utcIso', 'timestamp', 'time'] },
    { source: metaGps, keys: ['utc_iso', 'utcIso', 'timestamp', 'time'] },
  );

  return {
    latitude,
    longitude,
    altitude: toFiniteNumber(altitudeValue) ?? undefined,
    heading: toFiniteNumber(headingValue) ?? undefined,
    utcIso: utcValue === undefined ? undefined : String(utcValue),
  };
};

const formatCoordinate = (value: number) => value.toFixed(6);

const formatCount = (value: number, singular: string, plural: string) => `${value} ${value === 1 ? singular : plural}`;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getTrackColor = (trackId: string) => TRACK_COLORS[hashString(trackId) % TRACK_COLORS.length];

const normalizeAssociationGroups = (value: unknown): AssociationGroup[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is AssociationGroup => (
      Boolean(group)
      && typeof group === 'object'
      && typeof (group as AssociationGroup).id === 'string'
      && Array.isArray((group as AssociationGroup).members)
    ))
    .map((group) => ({
      id: group.id,
      members: Array.from(new Set(group.members.map(String))).sort(compareTrackIds),
      updatedAt: Number(group.updatedAt) || Date.now(),
    }))
    .filter((group) => group.members.length >= 2);
};

function EmptyMapState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-8 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
      <div className="max-w-sm">
        <MapPin className="mx-auto mb-2 h-7 w-7 text-neutral-300 dark:text-neutral-600" />
        {children}
      </div>
    </div>
  );
}

export function TrackIdMapView({ initialTrackId, onOpenObservation }: TrackIdMapViewProps) {
  const { t } = useTranslation();
  const annotations = useStore((state) => state.annotations);
  const folders = useStore((state) => state.folders);
  const views = useStore((state) => state.views);
  const workspacePath = useStore((state) => state.workspacePath);
  const projectMetaPath = useStore((state) => state.projectMetaPath);
  const projectName = useStore((state) => state.projectName);

  const [query, setQuery] = React.useState('');
  const [selectedTrackIds, setSelectedTrackIds] = React.useState<Set<string>>(new Set());
  const [metadataByStem, setMetadataByStem] = React.useState<Record<string, ImageGps | null>>({});
  const [metadataProgress, setMetadataProgress] = React.useState({ current: 0, total: 0 });
  const [metadataLoading, setMetadataLoading] = React.useState(false);
  const [associationGroups, setAssociationGroups] = React.useState<AssociationGroup[]>([]);
  const [activeAssociationId, setActiveAssociationId] = React.useState<string | null>(null);
  const metadataRequestRef = React.useRef(0);
  const associationHydratedRef = React.useRef(false);

  const trackStems = React.useMemo(() => Array.from(new Set(
    annotations
      .filter((annotation) => Boolean(getTrackIdLabel(annotation.track_id)))
      .map((annotation) => annotation.stem)
      .filter(Boolean),
  )), [annotations]);
  const trackStemKey = trackStems.join('\u0001');
  const metadataDirectory = React.useMemo(
    () => getMetadataDirectory(workspacePath, folders, views),
    [folders, views, workspacePath],
  );
  const associationStorageKey = React.useMemo(() => (
    `${ASSOCIATION_STORAGE_KEY}:${JSON.stringify({
      meta: String(projectMetaPath || '').trim(),
      workspace: String(workspacePath || '').trim(),
      name: String(projectName || '').trim(),
    })}`
  ), [projectMetaPath, projectName, workspacePath]);

  React.useEffect(() => {
    associationHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(associationStorageKey);
      setAssociationGroups(normalizeAssociationGroups(raw ? JSON.parse(raw) : []));
    } catch {
      setAssociationGroups([]);
    }
    associationHydratedRef.current = true;
    setActiveAssociationId(null);
  }, [associationStorageKey]);

  React.useEffect(() => {
    if (!associationHydratedRef.current || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(associationStorageKey, JSON.stringify(associationGroups));
    } catch {
      // Candidate associations are a convenience cache. The source annotations
      // remain safe when browser storage is unavailable.
    }
  }, [associationGroups, associationStorageKey]);

  React.useEffect(() => {
    const normalizedInitialId = getTrackIdLabel(initialTrackId);
    if (!normalizedInitialId) return;
    setSelectedTrackIds(new Set([normalizedInitialId]));
  }, [initialTrackId]);

  React.useEffect(() => {
    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;
    if (!metadataDirectory || trackStems.length === 0) {
      setMetadataByStem({});
      setMetadataProgress({ current: 0, total: 0 });
      setMetadataLoading(false);
      return () => undefined;
    }

    let cancelled = false;
    const separator = metadataDirectory.includes('\\') ? '\\' : '/';
    const directory = metadataDirectory.replace(/[\\/]+$/, '');
    const nextData: Record<string, ImageGps | null> = {};
    const batchSize = 12;
    setMetadataByStem({});
    setMetadataProgress({ current: 0, total: trackStems.length });
    setMetadataLoading(true);

    const load = async () => {
      for (let index = 0; index < trackStems.length; index += batchSize) {
        const batch = trackStems.slice(index, index + batchSize);
        const loaded = await Promise.all(batch.map(async (stem) => {
          try {
            const response = await getFileContent(`${directory}${separator}${stem}.json`);
            const rawContent = (response as any)?.content ?? response;
            const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
            return { stem, gps: extractImageGps(parsed) };
          } catch {
            return { stem, gps: null };
          }
        }));
        if (cancelled || metadataRequestRef.current !== requestId) return;
        loaded.forEach(({ stem, gps }) => {
          nextData[stem] = gps;
        });
        setMetadataByStem({ ...nextData });
        setMetadataProgress({ current: Math.min(index + batch.length, trackStems.length), total: trackStems.length });
      }
      if (!cancelled && metadataRequestRef.current === requestId) setMetadataLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [metadataDirectory, trackStemKey, trackStems]);

  const trackSummaries = React.useMemo<TrackSummary[]>(() => {
    const byId = new Map<string, TrackSummary>();
    annotations.forEach((annotation) => {
      const id = getTrackIdLabel(annotation.track_id);
      if (!id) return;
      const summary = byId.get(id) || {
        id,
        annotations: [],
        observations: [],
        labels: [],
        stems: [],
      };
      summary.annotations.push(annotation);
      if (annotation.label && !summary.labels.includes(annotation.label)) summary.labels.push(annotation.label);
      if (!summary.stems.includes(annotation.stem)) summary.stems.push(annotation.stem);
      const gps = metadataByStem[annotation.stem];
      if (gps) summary.observations.push({ annotation, gps });
      byId.set(id, summary);
    });
    return Array.from(byId.values()).sort((left, right) => compareTrackIds(left.id, right.id));
  }, [annotations, metadataByStem]);

  const filteredTrackSummaries = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return trackSummaries;
    return trackSummaries.filter((summary) => [
      summary.id,
      ...summary.labels,
      ...summary.stems,
    ].join(' ').toLowerCase().includes(normalizedQuery));
  }, [query, trackSummaries]);

  const visibleTrackIds = React.useMemo(
    () => filteredTrackSummaries.map((summary) => summary.id),
    [filteredTrackSummaries],
  );

  const validObservations = React.useMemo(
    () => trackSummaries.flatMap((summary) => summary.observations),
    [trackSummaries],
  );

  const mapBounds = React.useMemo(() => {
    if (validObservations.length === 0) return null;
    const latitudes = validObservations.map((observation) => observation.gps.latitude);
    const longitudes = validObservations.map((observation) => observation.gps.longitude);
    const rawMinLat = Math.min(...latitudes);
    const rawMaxLat = Math.max(...latitudes);
    const rawMinLon = Math.min(...longitudes);
    const rawMaxLon = Math.max(...longitudes);
    const latPadding = Math.max((rawMaxLat - rawMinLat) * 0.08, 0.00001);
    const lonPadding = Math.max((rawMaxLon - rawMinLon) * 0.08, 0.00001);
    return {
      minLat: rawMinLat - latPadding,
      maxLat: rawMaxLat + latPadding,
      minLon: rawMinLon - lonPadding,
      maxLon: rawMaxLon + lonPadding,
    };
  }, [validObservations]);

  const projectPoint = React.useCallback((latitude: number, longitude: number) => {
    if (!mapBounds) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    const plotWidth = MAP_WIDTH - MAP_PADDING.left - MAP_PADDING.right;
    const plotHeight = MAP_HEIGHT - MAP_PADDING.top - MAP_PADDING.bottom;
    const x = MAP_PADDING.left + ((longitude - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * plotWidth;
    const y = MAP_PADDING.top + (1 - ((latitude - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat))) * plotHeight;
    return { x, y };
  }, [mapBounds]);

  const toggleTrackSelection = (trackId: string, additive = true) => {
    setSelectedTrackIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
    setActiveAssociationId(null);
  };

  const selectAssociation = (group: AssociationGroup) => {
    setActiveAssociationId(group.id);
    setSelectedTrackIds(new Set(group.members));
  };

  const addAssociationGroup = () => {
    const members = Array.from(selectedTrackIds, (trackId) => String(trackId)).sort(compareTrackIds);
    if (members.length < 2) return;
    const existing = associationGroups.find((group) => (
      group.members.length === members.length && group.members.every((member, index) => member === members[index])
    ));
    if (existing) {
      setActiveAssociationId(existing.id);
      return;
    }
    const usedIds = new Set(associationGroups.map((group) => group.id));
    let nextIndex = associationGroups.length + 1;
    while (usedIds.has(`A-${nextIndex}`)) nextIndex += 1;
    const nextGroup: AssociationGroup = {
      id: `A-${nextIndex}`,
      members,
      updatedAt: Date.now(),
    };
    setAssociationGroups((current) => [...current, nextGroup]);
    setActiveAssociationId(nextGroup.id);
  };

  const removeAssociationGroup = (groupId: string) => {
    setAssociationGroups((current) => current.filter((group) => group.id !== groupId));
    setActiveAssociationId((current) => current === groupId ? null : current);
  };

  const allVisibleSelected = visibleTrackIds.length > 0 && visibleTrackIds.every((id) => selectedTrackIds.has(id));
  const selectedSummaries = trackSummaries.filter((summary) => selectedTrackIds.has(summary.id));
  const selectedAssociation = activeAssociationId
    ? associationGroups.find((group) => group.id === activeAssociationId) || null
    : null;

  const openFirstObservation = (summary: TrackSummary) => {
    const first = summary.observations[0]?.annotation || summary.annotations[0];
    if (first) onOpenObservation(first);
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-neutral-50/70 dark:bg-neutral-950/50">
      <main className="flex min-w-0 flex-1 flex-col border-r border-neutral-200 dark:border-neutral-800">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              <MapPin className="h-4 w-4 text-blue-600" />
              <span>{t('trackIdWindow.mapObservationGps')}</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {t('trackIdWindow.mapImageGpsOnly')}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] text-neutral-500 dark:text-neutral-400" title={metadataDirectory}>
              {t('trackIdWindow.mapObservationDescription')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
            <span>{trackSummaries.length} {t('trackIdWindow.mapTrackIds')}</span>
            <span>·</span>
            <span>{validObservations.length} {t('trackIdWindow.mapObservations')}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-3">
          {metadataLoading && metadataProgress.current === 0 ? (
            <EmptyMapState>
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('trackIdWindow.mapLoadingGps')}</span>
              </div>
            </EmptyMapState>
          ) : !mapBounds ? (
            <EmptyMapState>
              <p>{t('trackIdWindow.mapNoGps')}</p>
              {trackSummaries.length > 0 && (
                <p className="mt-1 text-[10px]">{t('trackIdWindow.mapNoGpsHint')}</p>
              )}
            </EmptyMapState>
          ) : (
            <div className="relative h-full min-h-[320px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <svg
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                className="h-full w-full"
                role="img"
                aria-label={t('trackIdWindow.mapObservationGps')}
              >
                <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="currentColor" className="text-white dark:text-neutral-950" />
                {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                  const x = MAP_PADDING.left + fraction * (MAP_WIDTH - MAP_PADDING.left - MAP_PADDING.right);
                  const y = MAP_PADDING.top + fraction * (MAP_HEIGHT - MAP_PADDING.top - MAP_PADDING.bottom);
                  const latitude = mapBounds.maxLat - fraction * (mapBounds.maxLat - mapBounds.minLat);
                  const longitude = mapBounds.minLon + fraction * (mapBounds.maxLon - mapBounds.minLon);
                  return (
                    <React.Fragment key={`grid-${fraction}`}>
                      <line x1={x} y1={MAP_PADDING.top} x2={x} y2={MAP_HEIGHT - MAP_PADDING.bottom} stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" strokeWidth="1" />
                      <line x1={MAP_PADDING.left} y1={y} x2={MAP_WIDTH - MAP_PADDING.right} y2={y} stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" strokeWidth="1" />
                      <text x={x} y={MAP_HEIGHT - 20} textAnchor="middle" fontSize="11" fill="currentColor" className="fill-neutral-500 dark:fill-neutral-400">{formatCoordinate(longitude)}</text>
                      <text x={MAP_PADDING.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="currentColor" className="fill-neutral-500 dark:fill-neutral-400">{formatCoordinate(latitude)}</text>
                    </React.Fragment>
                  );
                })}

                {trackSummaries.map((summary, summaryIndex) => {
                  const points = summary.observations.map((observation) => projectPoint(observation.gps.latitude, observation.gps.longitude));
                  if (points.length === 0) return null;
                  const selected = selectedTrackIds.has(summary.id);
                  const color = getTrackColor(summary.id);
                  const anchor = points[Math.floor(points.length / 2)] || points[0];
                  const offsetY = ((summaryIndex % 5) - 2) * 13;
                  const labelX = Math.min(MAP_WIDTH - MAP_PADDING.right - 8, Math.max(MAP_PADDING.left + 8, anchor.x + 12));
                  const labelY = Math.min(MAP_HEIGHT - MAP_PADDING.bottom - 6, Math.max(MAP_PADDING.top + 10, anchor.y + offsetY));
                  const labelWidth = Math.max(34, summary.id.length * 7 + 12);
                  return (
                    <g key={summary.id} opacity={selectedTrackIds.size === 0 || selected ? 1 : 0.42}>
                      {points.length > 1 && (
                        <polyline
                          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                          fill="none"
                          stroke={color}
                          strokeWidth={selected ? 3 : 1.5}
                          strokeDasharray={selected ? undefined : '5 4'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      {summary.observations.map((observation, observationIndex) => {
                        const point = projectPoint(observation.gps.latitude, observation.gps.longitude);
                        return (
                          <circle
                            key={observation.annotation.id}
                            cx={point.x}
                            cy={point.y}
                            r={selected ? 6 : 4.5}
                            fill={color}
                            stroke="white"
                            strokeWidth={selected ? 2 : 1.5}
                            className="cursor-pointer transition-[r] hover:[r:8px] dark:stroke-neutral-950"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleTrackSelection(summary.id, event.shiftKey || selectedTrackIds.has(summary.id));
                            }}
                          >
                            <title>{`${summary.id} · ${observation.annotation.stem} · ${observationIndex + 1}/${summary.observations.length}`}</title>
                          </circle>
                        );
                      })}
                      <line x1={anchor.x} y1={anchor.y} x2={labelX} y2={labelY} stroke={color} strokeWidth="1" opacity="0.7" />
                      <rect x={labelX - 4} y={labelY - 11} width={labelWidth} height="18" rx="5" fill="white" stroke={color} strokeWidth={selected ? 2 : 1} className="dark:fill-neutral-900" />
                      <text
                        x={labelX + 2}
                        y={labelY + 2}
                        fontSize="11"
                        fontWeight={selected ? 700 : 600}
                        fill={color}
                        className="cursor-pointer"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleTrackSelection(summary.id, event.shiftKey);
                        }}
                      >
                        {summary.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute bottom-2 left-3 rounded-md bg-white/90 px-2 py-1 text-[10px] text-neutral-500 shadow-sm dark:bg-neutral-900/90 dark:text-neutral-400">
                {t('trackIdWindow.mapClickHint')}
              </div>
              {metadataLoading && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/95 px-2 py-1 text-[10px] text-blue-700 shadow-sm dark:border-blue-500/30 dark:bg-blue-950/80 dark:text-blue-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('trackIdWindow.mapLoadingProgress', metadataProgress)}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <aside className="flex w-80 min-w-80 flex-col bg-white dark:bg-neutral-950">
        <div className="shrink-0 border-b border-neutral-200 p-3 dark:border-neutral-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
              {t('trackIdWindow.mapTrackIds')} <span className="ml-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{trackSummaries.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setSelectedTrackIds(allVisibleSelected ? new Set() : new Set(visibleTrackIds))}
                disabled={visibleTrackIds.length === 0}
                title={allVisibleSelected ? t('trackIdWindow.mapClearSelection') : t('trackIdWindow.mapSelectVisible')}
              >
                {allVisibleSelected ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                <span>{allVisibleSelected ? t('trackIdWindow.mapClearSelection') : t('trackIdWindow.mapSelectVisible')}</span>
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('trackIdWindow.mapSearch')}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
            {t('trackIdWindow.mapSelected', { count: selectedTrackIds.size })}
            {metadataProgress.total > 0 && (
              <span className="ml-2">· {t('trackIdWindow.mapGpsLoaded', metadataProgress)}</span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          {filteredTrackSummaries.length === 0 ? (
            <p className="px-2 py-4 text-center text-[10px] text-neutral-400">{t('trackIdWindow.mapNoMatches')}</p>
          ) : filteredTrackSummaries.map((summary) => {
            const selected = selectedTrackIds.has(summary.id);
            const color = getTrackColor(summary.id);
            return (
              <div
                key={summary.id}
                className={`mb-1 rounded-lg border px-2 py-2 transition-colors ${selected ? 'border-blue-300 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30' : 'border-transparent hover:border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-800 dark:hover:bg-neutral-900'}`}
                onClick={() => setSelectedTrackIds(new Set([summary.id]))}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleTrackSelection(summary.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${t('trackIdWindow.mapSelectTrack')} ${summary.id}`}
                    className="mt-0.5"
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedTrackIds(new Set([summary.id]));
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate">{summary.id}</span>
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                      {formatCount(summary.annotations.length, t('trackIdWindow.mapObjectSingular'), t('trackIdWindow.mapObjectPlural'))} · {formatCount(summary.stems.length, t('trackIdWindow.mapImageSingular'), t('trackIdWindow.mapImagePlural'))}
                      {summary.observations.length === 0 && ` · ${t('trackIdWindow.mapNoGpsForTrack')}`}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      openFirstObservation(summary);
                    }}
                    title={t('trackIdWindow.mapOpenObservation')}
                    aria-label={t('trackIdWindow.mapOpenObservation')}
                    disabled={summary.annotations.length === 0}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-100">
              <Link2 className="h-3.5 w-3.5 text-blue-600" />
              {t('trackIdWindow.mapAssociation')}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              onClick={addAssociationGroup}
              disabled={selectedTrackIds.size < 2}
              title={t('trackIdWindow.mapAddAssociation')}
              aria-label={t('trackIdWindow.mapAddAssociation')}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mb-2 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t('trackIdWindow.mapAssociationDescription')}
          </p>
          {associationGroups.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-2 py-2 text-[10px] text-neutral-400 dark:bg-neutral-900">{t('trackIdWindow.mapNoAssociations')}</p>
          ) : (
            <div className="max-h-36 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {associationGroups.map((group) => {
                const active = selectedAssociation?.id === group.id;
                return (
                  <div key={group.id} className={`flex items-center gap-1 rounded-md border px-2 py-1.5 ${active ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30' : 'border-neutral-200 dark:border-neutral-800'}`}>
                    <button type="button" onClick={() => selectAssociation(group)} className="min-w-0 flex-1 text-left" title={t('trackIdWindow.mapSelectAssociation')}>
                      <span className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-200">{group.id}</span>
                      <span className="block truncate text-[10px] text-neutral-500 dark:text-neutral-400">{group.members.join(' · ')}</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeAssociationGroup(group.id)}
                      title={t('trackIdWindow.mapRemoveAssociation')}
                      aria-label={t('trackIdWindow.mapRemoveAssociation')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {selectedSummaries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedSummaries.map((summary) => (
                <button
                  type="button"
                  key={summary.id}
                  onClick={() => openFirstObservation(summary)}
                  className="rounded-full border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] text-neutral-600 hover:border-blue-300 hover:text-blue-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                  title={t('trackIdWindow.mapOpenObservation')}
                >
                  {summary.id}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-start gap-1.5 text-[9px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span>{t('trackIdWindow.mapAssociationWarning')}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
