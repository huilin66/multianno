import React from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import type { LayerGroup, Map as LeafletMap, TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { getFileContent, getPreviewImageUrl } from '../../api/client';
import {
  useStore,
  type Annotation,
  type FolderData,
  type ViewConfig,
} from '../../store/useStore';
import { getAnnotationBounds } from '../../lib/annotationHitTest';
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

interface LabelPlacement {
  summary: TrackSummary;
  anchor: L.LatLng;
  position: L.LatLng;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

interface AssociationGroup {
  id: string;
  members: string[];
  updatedAt: number;
}

interface MapPreviewTarget {
  trackId: string;
  stem: string;
  annotationId: string;
}

interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

type ImageMetaRecord = Record<string, unknown>;

const ASSOCIATION_STORAGE_KEY = 'multianno.track-id-map-associations.v1';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
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

const getTrackColor = (trackId: string) => {
  let hash = 0;
  for (let index = 0; index < trackId.length; index += 1) {
    hash = ((hash << 5) - hash) + trackId.charCodeAt(index);
    hash |= 0;
  }
  return TRACK_COLORS[Math.abs(hash) % TRACK_COLORS.length];
};

const getAnnotationBoxArea = (annotation: Annotation) => {
  const bounds = getAnnotationBounds(annotation);
  if (!bounds) return 0;
  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
};

const getLargestObservation = (summary: TrackSummary) => summary.observations.reduce<TrackObservation | null>(
  (largest, current) => {
    if (!largest) return current;
    return getAnnotationBoxArea(current.annotation) > getAnnotationBoxArea(largest.annotation)
      ? current
      : largest;
  },
  null,
) || summary.observations[0];

const getTrackAnchor = (summary: TrackSummary) => {
  const observation = getLargestObservation(summary);
  return observation ? L.latLng(observation.gps.latitude, observation.gps.longitude) : null;
};

const getTrackLabelWidth = (summary: TrackSummary) => Math.min(
  190,
  Math.max(66, 28 + (summary.id.length * 7) + (String(summary.observations.length).length * 7)),
);

const rectanglesOverlap = (
  left: { left: number; top: number; right: number; bottom: number },
  right: { left: number; top: number; right: number; bottom: number },
) => (
  left.left < right.right
  && left.right > right.left
  && left.top < right.bottom
  && left.bottom > right.top
);

const getLabelPlacements = (
  map: LeafletMap,
  summaries: TrackSummary[],
  selectedTrackIds: Set<string>,
) => {
  const zoom = map.getZoom();
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const placements: LabelPlacement[] = [];
  const candidates: Array<[number, number]> = [];

  // Place selected tracks first so the current focus keeps the shortest offset.
  const orderedSummaries = [...summaries]
    .filter((summary) => summary.observations.length > 0)
    .sort((left, right) => (
      Number(selectedTrackIds.has(right.id)) - Number(selectedTrackIds.has(left.id))
      || compareTrackIds(left.id, right.id)
    ));

  orderedSummaries.forEach((summary) => {
    const anchor = getTrackAnchor(summary);
    if (!anchor) return;
    const width = getTrackLabelWidth(summary);
    const height = 24;
    const anchorPoint = map.project(anchor, zoom);
    const sideDistance = (width / 2) + 30;
    const preferredSide = placements.length % 2 === 0 ? -1 : 1;
    const candidateOffsets: Array<[number, number]> = [];
    for (let row = 0; row < 10; row += 1) {
      const verticalOffset = row === 0 ? 0 : Math.ceil(row / 2) * 28 * (row % 2 === 0 ? 1 : -1);
      candidateOffsets.push(
        [preferredSide * sideDistance, verticalOffset],
        [-preferredSide * sideDistance, verticalOffset],
      );
    }
    candidateOffsets.push(...candidates);

    // A deterministic left/right spiral keeps working when many IDs share the same GPS.
    for (let ring = 1; ring <= 8; ring += 1) {
      const radius = 30 + (ring * 25);
      const count = Math.max(8, ring * 8);
      for (let index = 0; index < count; index += 1) {
        const angle = ((Math.PI * 2) * index) / count;
        const side = index % 2 === 0 ? -1 : 1;
        candidateOffsets.push([side * Math.max(radius, sideDistance), Math.sin(angle) * radius]);
      }
    }

    let selectedOffset: [number, number] = [-sideDistance, 0];
    let selectedRect = {
      left: anchorPoint.x - sideDistance - (width / 2),
      top: anchorPoint.y - (height / 2),
      right: anchorPoint.x - sideDistance + (width / 2),
      bottom: anchorPoint.y + (height / 2),
    };

    for (const [offsetX, offsetY] of candidateOffsets) {
      const rect = {
        left: anchorPoint.x + offsetX - (width / 2),
        top: anchorPoint.y + offsetY - (height / 2),
        right: anchorPoint.x + offsetX + (width / 2),
        bottom: anchorPoint.y + offsetY + (height / 2),
      };
      if (!occupied.some((existing) => rectanglesOverlap(existing, rect))) {
        selectedOffset = [offsetX, offsetY];
        selectedRect = rect;
        break;
      }
    }

    occupied.push(selectedRect);
    placements.push({
      summary,
      anchor,
      position: map.unproject(
        L.point(anchorPoint.x + selectedOffset[0], anchorPoint.y + selectedOffset[1]),
        zoom,
      ),
      width,
      height,
      offsetX: selectedOffset[0],
      offsetY: selectedOffset[1],
    });
  });

  return placements;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

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
  const sceneGroups = useStore((state) => state.sceneGroups);
  const workspacePath = useStore((state) => state.workspacePath);
  const projectMetaPath = useStore((state) => state.projectMetaPath);
  const projectName = useStore((state) => state.projectName);

  const [query, setQuery] = React.useState('');
  const [selectedTrackIds, setSelectedTrackIds] = React.useState<Set<string>>(new Set());
  const [metadataByStem, setMetadataByStem] = React.useState<Record<string, ImageGps | null>>({});
  const [metadataProgress, setMetadataProgress] = React.useState({ current: 0, total: 0 });
  const [metadataLoading, setMetadataLoading] = React.useState(false);
  const [tileError, setTileError] = React.useState(false);
  const [mapReady, setMapReady] = React.useState(false);
  const [mapViewRevision, setMapViewRevision] = React.useState(0);
  const [layerVisibility, setLayerVisibility] = React.useState({
    baseMap: true,
    labels: true,
    points: true,
    lines: true,
  });
  const [previewTarget, setPreviewTarget] = React.useState<MapPreviewTarget | null>(null);
  const [previewImageError, setPreviewImageError] = React.useState(false);
  const [associationGroups, setAssociationGroups] = React.useState<AssociationGroup[]>([]);
  const [activeAssociationId, setActiveAssociationId] = React.useState<string | null>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LeafletMap | null>(null);
  const layerGroupRef = React.useRef<LayerGroup | null>(null);
  const tileLayerRef = React.useRef<TileLayer | null>(null);
  const metadataRequestRef = React.useRef(0);
  const associationHydratedRef = React.useRef(false);
  const fittedFinalBoundsRef = React.useRef(false);

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

  const setPreviewForObservation = React.useCallback((summary: TrackSummary, observation: TrackObservation | undefined) => {
    if (!observation) return;
    setPreviewTarget({
      trackId: summary.id,
      stem: observation.annotation.stem,
      annotationId: String(observation.annotation.id),
    });
    setPreviewImageError(false);
  }, []);

  const previewData = React.useMemo(() => {
    if (!previewTarget) return null;
    const summary = trackSummaries.find((item) => item.id === previewTarget.trackId);
    if (!summary || summary.observations.length === 0) return null;
    const previewIndex = summary.observations.findIndex((item) => (
      item.annotation.stem === previewTarget.stem
      && String(item.annotation.id) === previewTarget.annotationId
    ));
    const observationIndex = previewIndex >= 0
      ? previewIndex
      : Math.max(0, summary.observations.indexOf(getLargestObservation(summary)));
    const observation = summary.observations[observationIndex];
    if (!observation) return null;

    const mainView = views.find((view) => view.isMain) || views[0];
    const folder = folders.find((item) => item.id === mainView?.folderId) || folders[0];
    if (!mainView || !folder) return null;
    const extension = folder.extension || '';
    const normalizedExtension = extension && !extension.startsWith('.') ? `.${extension}` : extension;
    const fileName = sceneGroups?.[observation.annotation.stem]?.[folder.path]
      || `${observation.annotation.stem}${folder.suffix || ''}${normalizedExtension}`;
    const bounds = getAnnotationBounds(observation.annotation);
    return {
      summary,
      observation,
      observationIndex,
      imageUrl: getPreviewImageUrl(
        folder.path,
        fileName,
        mainView.bands,
        mainView.colormap || 'gray',
        mainView.settings,
        folder.rawProfile,
      ),
      imageWidth: folder.metadata.width || 1,
      imageHeight: folder.metadata.height || 1,
      bounds,
    };
  }, [folders, previewTarget, sceneGroups, trackSummaries, views]);

  React.useEffect(() => {
    setPreviewImageError(false);
  }, [previewTarget]);

  React.useEffect(() => {
    const normalizedInitialId = getTrackIdLabel(initialTrackId);
    if (!normalizedInitialId || previewTarget) return;
    const summary = trackSummaries.find((item) => item.id === normalizedInitialId);
    if (summary) setPreviewForObservation(summary, getLargestObservation(summary));
  }, [initialTrackId, previewTarget, setPreviewForObservation, trackSummaries]);

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

  const mapBounds = React.useMemo<MapBounds | null>(() => {
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

  React.useEffect(() => {
    if (!mapContainerRef.current || !mapBounds || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [(mapBounds.minLat + mapBounds.maxLat) / 2, (mapBounds.minLon + mapBounds.maxLon) / 2],
      zoom: 15,
      maxZoom: 22,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      attributionControl: false,
    });
    const tileLayer = L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxNativeZoom: 19,
      maxZoom: 22,
      crossOrigin: true,
    });
    tileLayer.on('tileerror', () => setTileError(true));
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.attribution({ prefix: false }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    const refreshMapView = () => setMapViewRevision((revision) => revision + 1);
    map.on('zoomend resize', refreshMapView);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;
    fittedFinalBoundsRef.current = false;
    setTileError(false);
    setMapReady(true);

    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      window.cancelAnimationFrame(frame);
      map.off('zoomend resize', refreshMapView);
      layerGroup.clearLayers();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      tileLayerRef.current = null;
      fittedFinalBoundsRef.current = false;
      setMapReady(false);
    };
  }, [Boolean(mapBounds)]);

  React.useEffect(() => {
    const map = mapRef.current;
    const tileLayer = tileLayerRef.current;
    if (!map || !tileLayer || !mapReady) return;
    if (layerVisibility.baseMap) tileLayer.addTo(map);
    else tileLayer.remove();
  }, [layerVisibility.baseMap, mapReady]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapBounds || !mapReady || metadataLoading || fittedFinalBoundsRef.current) return;
    const bounds = L.latLngBounds(
      [mapBounds.minLat, mapBounds.minLon],
      [mapBounds.maxLat, mapBounds.maxLon],
    );
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
    fittedFinalBoundsRef.current = true;
  }, [mapBounds, mapReady, metadataLoading]);

  const toggleTrackSelection = React.useCallback((trackId: string, additive = true) => {
    setSelectedTrackIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
    setActiveAssociationId(null);
  }, []);

  React.useEffect(() => {
    const layerGroup = layerGroupRef.current;
    const map = mapRef.current;
    if (!layerGroup || !map || !mapReady) return;
    layerGroup.clearLayers();

    const placements = getLabelPlacements(map, filteredTrackSummaries, selectedTrackIds);
    const placementById = new Map(placements.map((placement) => [placement.summary.id, placement]));

    filteredTrackSummaries.forEach((summary) => {
      if (summary.observations.length === 0) return;
      const color = getTrackColor(summary.id);
      const selected = selectedTrackIds.has(summary.id);
      const hasSelection = selectedTrackIds.size > 0;
      const visible = !hasSelection || selected;
      const latLngs = summary.observations.map((observation) => [
        observation.gps.latitude,
        observation.gps.longitude,
      ] as [number, number]);

      if (layerVisibility.lines && latLngs.length > 1) {
        L.polyline(latLngs, {
          color,
          weight: selected ? 4 : 1.8,
          opacity: visible ? (selected ? 0.9 : 0.65) : 0.18,
          dashArray: selected || !hasSelection ? undefined : '6 5',
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(layerGroup);
      }

      // One point represents the image containing the largest box for this ID.
      // The line above retains the full sequence of image GPS observations.
      const anchorObservation = getLargestObservation(summary);
      if (layerVisibility.points && anchorObservation) {
        const point = L.circleMarker([anchorObservation.gps.latitude, anchorObservation.gps.longitude], {
          radius: 6,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: selected ? 1 : 0.88,
          opacity: selected ? 1 : 0.85,
        });
        point.bindTooltip(
          escapeHtml(t('trackIdWindow.mapAnchorPoint', {
            id: summary.id,
            stem: anchorObservation.annotation.stem,
            count: summary.observations.length,
          })),
          { direction: 'top', offset: [0, -5], opacity: 0.95 },
        );
        point.on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          setPreviewForObservation(summary, anchorObservation);
          toggleTrackSelection(summary.id, Boolean(event.originalEvent?.shiftKey) || selectedTrackIds.has(summary.id));
        });
        point.on('dblclick', (event) => {
          L.DomEvent.stopPropagation(event);
          onOpenObservation(anchorObservation.annotation);
        });
        point.addTo(layerGroup);
      }

      const placement = placementById.get(summary.id);
      if (!placement) return;
      if (layerVisibility.labels && (placement.offsetX !== 0 || placement.offsetY !== 0)) {
        L.polyline([
          placement.anchor,
          placement.position,
        ], {
          color,
          weight: selected ? 1.4 : 1,
          opacity: visible ? (selected ? 0.65 : 0.35) : 0.2,
          dashArray: '3 4',
          interactive: false,
        }).addTo(layerGroup);
      }

      if (layerVisibility.labels) {
        const label = L.marker(placement.position, {
          keyboard: false,
          zIndexOffset: selected ? 1000 : 0,
          icon: L.divIcon({
            className: 'track-id-map-label',
            html: `<span class="track-id-map-label-chip${selected ? ' is-selected' : ''}" style="--track-color:${color}"><span>${escapeHtml(summary.id)}</span><span class="track-id-map-label-count">${summary.observations.length}</span></span>`,
            iconSize: [placement.width, placement.height],
            iconAnchor: [placement.width / 2, placement.height / 2],
          }),
        });
        label.on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          setPreviewForObservation(summary, anchorObservation);
          toggleTrackSelection(summary.id, Boolean(event.originalEvent?.shiftKey));
        });
        label.addTo(layerGroup);
      }
    });
  }, [filteredTrackSummaries, layerVisibility, mapReady, mapViewRevision, onOpenObservation, selectedTrackIds, setPreviewForObservation, t, toggleTrackSelection]);

  const addAssociationGroup = React.useCallback(() => {
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
  }, [associationGroups, selectedTrackIds]);

  const removeAssociationGroup = (groupId: string) => {
    setAssociationGroups((current) => current.filter((group) => group.id !== groupId));
    setActiveAssociationId((current) => current === groupId ? null : current);
  };

  const selectAssociation = (group: AssociationGroup) => {
    setActiveAssociationId(group.id);
    setSelectedTrackIds(new Set(group.members));
  };

  const openFirstObservation = (summary: TrackSummary) => {
    const first = summary.observations[0]?.annotation || summary.annotations[0];
    if (first) onOpenObservation(first);
  };

  const allVisibleSelected = visibleTrackIds.length > 0 && visibleTrackIds.every((id) => selectedTrackIds.has(id));
  const selectedSummaries = trackSummaries.filter((summary) => selectedTrackIds.has(summary.id));
  const selectedAssociation = activeAssociationId
    ? associationGroups.find((group) => group.id === activeAssociationId) || null
    : null;
  const mapLayerOptions: Array<{ key: keyof typeof layerVisibility; label: string }> = [
    { key: 'baseMap', label: t('trackIdWindow.mapLayerBaseMap') },
    { key: 'labels', label: t('trackIdWindow.mapLayerLabels') },
    { key: 'points', label: t('trackIdWindow.mapLayerPoints') },
    { key: 'lines', label: t('trackIdWindow.mapLayerLines') },
  ];

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
            <div className="track-id-map-container relative h-full min-h-[320px] overflow-hidden rounded-xl border border-neutral-200 bg-sky-50 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div ref={mapContainerRef} className="h-full min-h-[320px] w-full" />
              <div className="pointer-events-auto absolute left-3 top-3 z-[1000] w-44 rounded-lg border border-neutral-200 bg-white/95 p-2 shadow-md backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-neutral-700 dark:text-neutral-200">
                  <Layers className="h-3.5 w-3.5 text-blue-600" />
                  <span>{t('trackIdWindow.mapLayers')}</span>
                </div>
                <div className="space-y-1">
                  {mapLayerOptions.map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
                      <Checkbox
                        checked={layerVisibility[key]}
                        onCheckedChange={(checked) => setLayerVisibility((current) => ({
                          ...current,
                          [key]: checked === true,
                        }))}
                        className="h-3.5 w-3.5"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {previewData && (
                <div className="pointer-events-auto absolute bottom-3 right-3 z-[1000] w-[min(19rem,calc(100%-1.5rem))] rounded-lg border border-neutral-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                        {previewData.summary.id}
                        <span className="ml-1 font-normal text-neutral-500">{t('trackIdWindow.mapPreviewTitle')}</span>
                      </div>
                      <div className="truncate text-[9px] text-neutral-500 dark:text-neutral-400" title={previewData.observation.annotation.stem}>
                        {previewData.observation.annotation.stem}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                      onClick={() => setPreviewTarget(null)}
                      title={t('trackIdWindow.mapClosePreview')}
                      aria-label={t('trackIdWindow.mapClosePreview')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {previewImageError ? (
                    <div className="flex aspect-video items-center justify-center rounded-md bg-neutral-100 px-4 text-center text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {t('trackIdWindow.mapPreviewUnavailable')}
                    </div>
                  ) : (
                    <div
                      className="relative overflow-hidden rounded-md bg-black"
                      style={{ aspectRatio: `${previewData.imageWidth} / ${previewData.imageHeight}` }}
                    >
                      <img
                        src={previewData.imageUrl}
                        alt={previewData.observation.annotation.stem}
                        className="block h-full w-full object-contain"
                        onError={() => setPreviewImageError(true)}
                      />
                      {previewData.bounds && (
                        <div
                          className="pointer-events-none absolute border-2 border-red-400 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
                          style={{
                            left: `${Math.max(0, (previewData.bounds.minX / previewData.imageWidth) * 100)}%`,
                            top: `${Math.max(0, (previewData.bounds.minY / previewData.imageHeight) * 100)}%`,
                            width: `${Math.max(0, ((previewData.bounds.maxX - previewData.bounds.minX) / previewData.imageWidth) * 100)}%`,
                            height: `${Math.max(0, ((previewData.bounds.maxY - previewData.bounds.minY) / previewData.imageHeight) * 100)}%`,
                          }}
                        />
                      )}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-neutral-500 dark:text-neutral-400">
                    <span>{previewData.observationIndex + 1}/{previewData.summary.observations.length}</span>
                    <span className="truncate text-right" title={previewData.observation.annotation.label}>
                      {previewData.observation.annotation.label || t('trackIdWindow.mapPreviewTitle')}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-500 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
                      onClick={() => {
                        const observations = previewData.summary.observations;
                        const nextIndex = (previewData.observationIndex - 1 + observations.length) % observations.length;
                        setPreviewForObservation(previewData.summary, observations[nextIndex]);
                      }}
                      disabled={previewData.summary.observations.length < 2}
                      title={t('trackIdWindow.mapPreviousImage')}
                      aria-label={t('trackIdWindow.mapPreviousImage')}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="flex h-7 flex-1 items-center justify-center rounded border border-blue-200 bg-blue-50 px-2 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                      onClick={() => onOpenObservation(previewData.observation.annotation)}
                    >
                      {t('trackIdWindow.mapOpenFrame')}
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-500 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
                      onClick={() => {
                        const observations = previewData.summary.observations;
                        const nextIndex = (previewData.observationIndex + 1) % observations.length;
                        setPreviewForObservation(previewData.summary, observations[nextIndex]);
                      }}
                      disabled={previewData.summary.observations.length < 2}
                      title={t('trackIdWindow.mapNextImage')}
                      aria-label={t('trackIdWindow.mapNextImage')}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {tileError && (
                <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-amber-200 bg-amber-50/95 px-2 py-1 text-[10px] text-amber-700 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/85 dark:text-amber-300">
                  {t('trackIdWindow.mapTileError')}
                </div>
              )}
              {metadataLoading && (
                <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/95 px-2 py-1 text-[10px] text-blue-700 shadow-sm dark:border-blue-500/30 dark:bg-blue-950/80 dark:text-blue-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('trackIdWindow.mapLoadingProgress', metadataProgress)}
                </div>
              )}
              <div className="pointer-events-none absolute bottom-2 left-3 rounded-md bg-white/90 px-2 py-1 text-[10px] text-neutral-500 shadow-sm dark:bg-neutral-900/90 dark:text-neutral-400">
                {t('trackIdWindow.mapClickHint')}
              </div>
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
                onClick={() => {
                  setSelectedTrackIds(new Set([summary.id]));
                  setActiveAssociationId(null);
                  setPreviewForObservation(summary, getLargestObservation(summary));
                }}
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
                      setActiveAssociationId(null);
                      setPreviewForObservation(summary, getLargestObservation(summary));
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate">{summary.id}</span>
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                      {summary.annotations.length} {t('trackIdWindow.mapObjectPlural')} · {summary.stems.length} {t('trackIdWindow.mapImagePlural')}
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
                  onClick={() => {
                    setPreviewForObservation(summary, getLargestObservation(summary));
                    openFirstObservation(summary);
                  }}
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
