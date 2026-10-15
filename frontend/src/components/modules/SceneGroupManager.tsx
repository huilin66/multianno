import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getFileContent } from '../../api/client';
import { useStore } from '../../store/useStore';

interface SceneGroupManagerProps {
  onClose?: () => void;
}

type ImageMetaRecord = Record<string, unknown>;

interface SceneGroupImageRow {
  sceneGroup: string;
  imageName: string;
  imageStem: string;
  views: Array<{
    viewId: string;
    viewLabel: string;
    bands: number[];
  }>;
}

interface ImageFileData {
  metadata: ImageMetaRecord | null;
  width?: unknown;
  height?: unknown;
  error: boolean;
}

interface SceneGroupRow {
  stem: string;
  imageCount: number;
  objectCount: number;
  trackCount: number;
  viewCount: number;
}

interface ImageShapePoint {
  key: string;
  width: number;
  height: number;
  imageCount: number;
}

interface HistogramBin {
  label: string;
  start: number;
  end: number;
  count: number;
}

const getBaseName = (value: string) => {
  const normalized = String(value || '').replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
};

const getImageStem = (value: string) => getBaseName(value).replace(/\.[^.]+$/, '');

const normalizeExtension = (extension: string) => {
  if (!extension) return '';
  return extension.startsWith('.') ? extension : `.${extension}`;
};

const buildHistogram = (values: number[], maxBins = 8): HistogramBin[] => {
  if (values.length === 0) return [];
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const sortedValues = Array.from(counts.entries()).sort((left, right) => left[0] - right[0]);

  if (sortedValues.length <= maxBins) {
    return sortedValues.map(([value, count]) => ({
      label: String(value),
      start: value,
      end: value,
      count,
    }));
  }

  const minValue = sortedValues[0][0];
  const maxValue = sortedValues[sortedValues.length - 1][0];
  const binSize = Math.max(1, Math.ceil((maxValue - minValue + 1) / maxBins));
  const bins = Array.from({ length: maxBins }, (_, index) => ({
    start: minValue + index * binSize,
    end: Math.min(maxValue, minValue + (index + 1) * binSize - 1),
    count: 0,
  }));

  sortedValues.forEach(([value, count]) => {
    const index = Math.min(bins.length - 1, Math.floor((value - minValue) / binSize));
    bins[index].count += count;
  });

  return bins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({
      ...bin,
      label: bin.start === bin.end ? String(bin.start) : `${bin.start}–${bin.end}`,
    }));
};

const formatValue = (value: unknown) => {
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

const readFirstMetaValue = (meta: ImageMetaRecord | null, keys: string[]) => {
  if (!meta) return undefined;
  for (const key of keys) {
    if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') {
      return meta[key];
    }
  }
  return undefined;
};

function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'blue' | 'green' | 'amber';
}) {
  const styles = {
    neutral: 'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  } as const;

  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${styles[tone]}`}>
      {children}
    </span>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 font-mono text-xl font-semibold leading-5 text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
      {children}
    </div>
  );
}

function ImageShapeDistributionChart({
  points,
  widthHistogram,
  heightHistogram,
  unknownCount,
  loading,
  loadingLabel,
  noDataLabel,
  scatterHint,
  widthHistogramLabel,
  heightHistogramLabel,
  imagesLabel,
  unknownLabel,
}: {
  points: ImageShapePoint[];
  widthHistogram: HistogramBin[];
  heightHistogram: HistogramBin[];
  unknownCount: number;
  loading: boolean;
  loadingLabel: string;
  noDataLabel: string;
  scatterHint: string;
  widthHistogramLabel: string;
  heightHistogramLabel: string;
  imagesLabel: string;
  unknownLabel: string;
}) {
  const hasPoints = points.length > 0;
  const widthValues = points.map((point) => point.width);
  const heightValues = points.map((point) => point.height);
  const minWidth = hasPoints ? Math.min(...widthValues) : 0;
  const maxWidth = hasPoints ? Math.max(...widthValues) : 1;
  const minHeight = hasPoints ? Math.min(...heightValues) : 0;
  const maxHeight = hasPoints ? Math.max(...heightValues) : 1;
  const widthRange = Math.max(maxWidth - minWidth, 1);
  const heightRange = Math.max(maxHeight - minHeight, 1);
  const plot = { left: 72, top: 108, width: 600, height: 248, totalWidth: 900, totalHeight: 410 };
  const plotRight = plot.left + plot.width;
  const plotBottom = plot.top + plot.height;
  const topBase = plot.top - 12;
  const rightBase = plotRight + 14;
  const rightHistogramWidth = 136;
  const topHistogramMax = Math.max(...widthHistogram.map((bin) => bin.count), 1);
  const rightHistogramMax = Math.max(...heightHistogram.map((bin) => bin.count), 1);
  const tickFractions = [0, 1 / 3, 2 / 3, 1];
  const formatTick = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const xScale = (value: number) => plot.left + ((value - minWidth) / widthRange) * plot.width;
  const yScale = (value: number) => plot.top + ((maxHeight - value) / heightRange) * plot.height;
  const getBinExtent = (bin: HistogramBin, range: number, length: number, binCount: number) => {
    if (bin.start === bin.end) return Math.max(8, length / Math.max(1, binCount * 1.8));
    return Math.max(8, ((bin.end - bin.start + 1) / Math.max(range, 1)) * length * 0.86);
  };

  if (!hasPoints) {
    return (
      <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/70 px-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400">
        {loading ? `${loadingLabel}…` : noDataLabel}
      </div>
    );
  }

  return (
    <div className="mt-5 min-w-0 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-neutral-500 dark:text-neutral-400">
        <span>{scatterHint}</span>
        <span className="shrink-0 font-mono">{unknownCount > 0 ? `${unknownCount} ${unknownLabel}` : `${points.reduce((sum, point) => sum + point.imageCount, 0)} ${imagesLabel}`}</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${plot.totalWidth} ${plot.totalHeight}`} className="h-[360px] min-w-[720px] w-full" role="img" aria-label={scatterHint}>
          <text x={plot.left + plot.width / 2} y="16" textAnchor="middle" fontSize="11" fill="currentColor" className="font-semibold text-neutral-600 dark:text-neutral-300">{widthHistogramLabel}</text>
          <text x={plotRight + 14 + rightHistogramWidth / 2} y="16" textAnchor="middle" fontSize="11" fill="currentColor" className="font-semibold text-neutral-600 dark:text-neutral-300">{heightHistogramLabel}</text>

          {tickFractions.map((fraction) => {
            const x = plot.left + fraction * plot.width;
            const y = plot.top + (1 - fraction) * plot.height;
            const xValue = minWidth + fraction * widthRange;
            const yValue = minHeight + fraction * heightRange;
            return (
              <React.Fragment key={fraction}>
                <line x1={x} x2={x} y1={plot.top} y2={plotBottom} stroke="currentColor" strokeDasharray="3 4" className="text-neutral-200 dark:text-neutral-800" />
                <line x1={plot.left} x2={plotRight} y1={y} y2={y} stroke="currentColor" strokeDasharray="3 4" className="text-neutral-200 dark:text-neutral-800" />
                <text x={x} y={plotBottom + 20} textAnchor="middle" fontSize="10" fill="currentColor" className="text-neutral-500 dark:text-neutral-400">{formatTick(xValue)}</text>
                <text x={plot.left - 10} y={y + 3} textAnchor="end" fontSize="10" fill="currentColor" className="text-neutral-500 dark:text-neutral-400">{formatTick(yValue)}</text>
              </React.Fragment>
            );
          })}

          <line x1={plot.left} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="currentColor" className="text-neutral-400 dark:text-neutral-600" />
          <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plotBottom} stroke="currentColor" className="text-neutral-400 dark:text-neutral-600" />
          <line x1={plot.left} x2={plotRight} y1={topBase} y2={topBase} stroke="currentColor" className="text-neutral-300 dark:text-neutral-700" />
          <line x1={rightBase} x2={rightBase} y1={plot.top} y2={plotBottom} stroke="currentColor" className="text-neutral-300 dark:text-neutral-700" />
          <text x={plot.left + plot.width / 2} y={plot.totalHeight - 8} textAnchor="middle" fontSize="10" fill="currentColor" className="font-semibold text-neutral-500 dark:text-neutral-400">Width</text>
          <text x="17" y={plot.top + plot.height / 2} textAnchor="middle" fontSize="10" fill="currentColor" className="font-semibold text-neutral-500 dark:text-neutral-400" transform={`rotate(-90 17 ${plot.top + plot.height / 2})`}>Height</text>

          {widthHistogram.map((bin) => {
            const center = xScale((bin.start + bin.end) / 2);
            const barWidth = getBinExtent(bin, widthRange, plot.width, widthHistogram.length);
            const barHeight = Math.max(4, (bin.count / topHistogramMax) * 70);
            return (
              <rect key={`width-${bin.label}`} x={center - barWidth / 2} y={topBase - barHeight} width={barWidth} height={barHeight} rx="1" className="fill-emerald-500/70 dark:fill-emerald-400/70">
                <title>{`${bin.label}: ${bin.count} ${imagesLabel}`}</title>
              </rect>
            );
          })}

          {heightHistogram.map((bin) => {
            const center = yScale((bin.start + bin.end) / 2);
            const barHeight = getBinExtent(bin, heightRange, plot.height, heightHistogram.length);
            const barWidth = Math.max(5, (bin.count / rightHistogramMax) * rightHistogramWidth);
            return (
              <rect key={`height-${bin.label}`} x={rightBase} y={center - barHeight / 2} width={barWidth} height={barHeight} rx="1" className="fill-emerald-500/70 dark:fill-emerald-400/70">
                <title>{`${bin.label}: ${bin.count} ${imagesLabel}`}</title>
              </rect>
            );
          })}

          {points.map((point) => {
            const x = xScale(point.width);
            const y = yScale(point.height);
            const radius = Math.min(10, 3.5 + Math.sqrt(point.imageCount) * 1.4);
            return (
              <circle key={point.key} cx={x} cy={y} r={radius} className="fill-neutral-950/90 stroke-white dark:fill-neutral-100/90 dark:stroke-neutral-900" strokeWidth="1.5">
                <title>{`${point.width} × ${point.height} · ${point.imageCount} ${imagesLabel}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function SceneGroupManager({ onClose }: SceneGroupManagerProps) {
  const { t } = useTranslation();
  const {
    stems,
    currentStem,
    sceneGroups,
    folders,
    views,
    annotations,
    workspacePath,
    setCurrentStem,
    setActiveModule,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'table'>('overview');
  const [query, setQuery] = useState('');
  const [selectedStem, setSelectedStem] = useState<string | null>(currentStem || stems[0] || null);
  const [imageDataByStem, setImageDataByStem] = useState<Record<string, ImageFileData>>({});
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataProgress, setMetadataProgress] = useState({ current: 0, total: 0 });
  const metadataRequestRef = useRef(0);

  const annotationStatsByStem = useMemo(() => {
    const stats = new Map<string, { objects: number; tracks: Set<string> }>();
    annotations.forEach((annotation) => {
      const existing = stats.get(annotation.stem) || { objects: 0, tracks: new Set<string>() };
      existing.objects += 1;
      if (annotation.track_id !== undefined && annotation.track_id !== null && String(annotation.track_id).trim()) {
        existing.tracks.add(String(annotation.track_id));
      }
      stats.set(annotation.stem, existing);
    });
    return stats;
  }, [annotations]);

  const imageTableRows = useMemo<SceneGroupImageRow[]>(() => {
    const rows = new Map<string, SceneGroupImageRow>();

    stems.forEach((stem) => {
      const fileMap = sceneGroups?.[stem] || {};
      const sourceViews = views.length > 0
        ? views.map((view, index) => {
            const folder = folders.find((item) => item.id === view.folderId);
            const folderPath = folder?.path || '';
            const imageName = fileMap[folderPath]
              || `${stem}${folder?.suffix || ''}${normalizeExtension(folder?.extension || '')}`;
            return {
              imageName: getBaseName(imageName),
              imageStem: getImageStem(imageName),
              view: {
                viewId: view.id,
                viewLabel: view.isMain
                  ? t('view.mainView')
                  : `${t('view.augView')} ${views.slice(0, index).filter((item) => !item.isMain).length + 1}`,
                bands: view.bands || [],
              },
            };
          })
        : Object.entries(fileMap).map(([, imageName], index) => ({
            imageName: getBaseName(imageName),
            imageStem: getImageStem(imageName),
            view: {
              viewId: `folder-${index}`,
              viewLabel: `${t('view.augView')} ${index + 1}`,
              bands: [],
            },
          }));

      sourceViews.forEach(({ imageName, imageStem, view }) => {
        const key = `${stem}::${imageName.toLowerCase()}`;
        const existing = rows.get(key);
        if (existing) {
          if (!existing.views.some((item) => item.viewId === view.viewId)) {
            existing.views.push(view);
          }
          return;
        }
        rows.set(key, {
          sceneGroup: stem,
          imageName,
          imageStem,
          views: [view],
        });
      });
    });

    return Array.from(rows.values());
  }, [folders, sceneGroups, stems, t, views]);

  const groupRows = useMemo<SceneGroupRow[]>(() => stems.map((stem) => {
    const stats = annotationStatsByStem.get(stem);
    const groupImages = imageTableRows.filter((row) => row.sceneGroup === stem);
    return {
      stem,
      imageCount: groupImages.length,
      objectCount: stats?.objects || 0,
      trackCount: stats?.tracks.size || 0,
      viewCount: views.length || new Set(groupImages.flatMap((row) => row.views.map((view) => view.viewId))).size,
    };
  }), [annotationStatsByStem, imageTableRows, stems, views.length]);

  const filteredImageRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return imageTableRows;
    return imageTableRows.filter((row) => {
      const data = imageDataByStem[row.imageStem];
      const searchableText = [
        row.sceneGroup,
        row.imageName,
        row.imageStem,
        row.views.map((view) => `${view.viewLabel} ${view.bands.join(',')}`).join(' '),
        data?.width,
        data?.height,
        ...(data?.metadata ? Object.values(data.metadata) : []),
      ].map((value) => String(value ?? '')).join(' ').toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [imageDataByStem, imageTableRows, query]);

  useEffect(() => {
    if (currentStem && stems.includes(currentStem)) {
      setSelectedStem(currentStem);
      return;
    }
    setSelectedStem((previous) => {
      if (previous && stems.includes(previous)) return previous;
      return stems[0] || null;
    });
  }, [currentStem, stems]);

  const metadataDirectory = useMemo(() => {
    if (workspacePath) return workspacePath;
    const mainView = views.find((view) => view.isMain) || views[0];
    return folders.find((folder) => folder.id === mainView?.folderId)?.path || folders[0]?.path || '';
  }, [folders, views, workspacePath]);

  const loadMetadata = useCallback(async () => {
    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;
    const uniqueImageStems: string[] = Array.from(new Set(
      imageTableRows.map((row) => row.imageStem).filter((imageStem): imageStem is string => Boolean(imageStem)),
    ));

    if (!metadataDirectory || uniqueImageStems.length === 0) {
      setImageDataByStem({});
      setMetadataProgress({ current: 0, total: 0 });
      setMetadataLoading(false);
      return;
    }

    setMetadataLoading(true);
    setImageDataByStem({});
    setMetadataProgress({ current: 0, total: uniqueImageStems.length });

    const separator = metadataDirectory.includes('\\') ? '\\' : '/';
    const directory = metadataDirectory.replace(/[\\/]+$/, '');
    const nextData: Record<string, ImageFileData> = {};
    const batchSize = 12;

    for (let index = 0; index < uniqueImageStems.length; index += batchSize) {
      const batch = uniqueImageStems.slice(index, index + batchSize);
      const loaded: Array<{ imageStem: string; data: ImageFileData }> = await Promise.all(batch.map(async (imageStem) => {
        const path = `${directory}${separator}${imageStem}.json`;
        try {
          const response = await getFileContent(path);
          const rawContent = response?.content ?? response;
          const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
          const imageMeta = parsed?.imageMeta ?? parsed?.image_meta;
          const metadata = imageMeta && typeof imageMeta === 'object' ? imageMeta as ImageMetaRecord : null;
          return {
            imageStem,
            data: {
              metadata,
              width: parsed?.imageWidth ?? parsed?.image_width ?? readFirstMetaValue(metadata, ['image_width', 'pixel_width', 'img_width']),
              height: parsed?.imageHeight ?? parsed?.image_height ?? readFirstMetaValue(metadata, ['image_height', 'pixel_height', 'img_height']),
              error: false,
            } as ImageFileData,
          };
        } catch {
          return { imageStem, data: { metadata: null, error: true } as ImageFileData };
        }
      }));

      if (metadataRequestRef.current !== requestId) return;
      loaded.forEach(({ imageStem, data }) => {
        nextData[imageStem] = data;
      });
      setImageDataByStem({ ...nextData });
      setMetadataProgress({ current: Math.min(index + batch.length, uniqueImageStems.length), total: uniqueImageStems.length });
    }

    if (metadataRequestRef.current === requestId) {
      setMetadataLoading(false);
    }
  }, [imageTableRows, metadataDirectory]);

  useEffect(() => {
    void loadMetadata();
    return () => {
      metadataRequestRef.current += 1;
    };
  }, [loadMetadata]);

  const totalImages = imageTableRows.length;
  const groupsWithAnnotations = groupRows.filter((row) => row.objectCount > 0).length;
  const metadataCount = (Object.values(imageDataByStem) as ImageFileData[])
    .filter((data) => Boolean(data.metadata)).length;
  const metadataTargetCount = new Set(imageTableRows.map((row) => row.imageStem)).size;

  const shapeChartData = useMemo(() => {
    const pointsByShape = new Map<string, ImageShapePoint>();
    const widths: number[] = [];
    const heights: number[] = [];
    let unknownCount = 0;
    imageTableRows.forEach((row) => {
      const data = imageDataByStem[row.imageStem];
      const width = Number(data?.width);
      const height = Number(data?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        unknownCount += 1;
        return;
      }
      const roundedWidth = Math.round(width);
      const roundedHeight = Math.round(height);
      const key = `${roundedWidth}x${roundedHeight}`;
      widths.push(roundedWidth);
      heights.push(roundedHeight);
      const point = pointsByShape.get(key);
      if (point) {
        point.imageCount += 1;
      } else {
        pointsByShape.set(key, {
          key,
          width: roundedWidth,
          height: roundedHeight,
          imageCount: 1,
        });
      }
    });

    return {
      points: Array.from(pointsByShape.values()).sort((left, right) => right.imageCount - left.imageCount),
      widthHistogram: buildHistogram(widths),
      heightHistogram: buildHistogram(heights),
      unknownCount: metadataLoading ? 0 : unknownCount,
    };
  }, [imageDataByStem, imageTableRows, metadataLoading]);

  const openScene = (stem: string) => {
    setCurrentStem(stem);
    setActiveModule('workspace');
    onClose?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
            <Button variant={activeTab === 'overview' ? 'secondary' : 'ghost'} onClick={() => setActiveTab('overview')} className={activeTab === 'overview' ? 'h-10 w-full justify-start bg-blue-50 font-bold text-blue-700 ring-1 ring-blue-200 transition-all dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800' : 'h-10 w-full justify-start font-bold transition-all'}>
              <LayoutDashboard className="mr-2 h-4 w-4" /> {t('sceneGroupManager.overview')}
            </Button>
            <Button variant={activeTab === 'table' ? 'secondary' : 'ghost'} onClick={() => setActiveTab('table')} className={activeTab === 'table' ? 'mt-1 h-10 w-full justify-start bg-blue-50 font-bold text-blue-700 ring-1 ring-blue-200 transition-all dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800' : 'mt-1 h-10 w-full justify-start font-bold transition-all'}>
              <Table2 className="mr-2 h-4 w-4" /> {t('sceneGroupManager.sceneGroupTable')}
            </Button>

          </div>
          <div className="shrink-0 border-t border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-[10px] leading-4 text-neutral-500 dark:text-neutral-400">{t('sceneGroupManager.description')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge tone="blue">{groupRows.length} {t('sceneGroupManager.groups')}</StatusBadge><StatusBadge>{totalImages} {t('sceneGroupManager.images')}</StatusBadge></div>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {activeTab === 'overview' ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-950/30">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="min-w-0"><h2 className="text-xl font-black">{t('sceneGroupManager.overview')}</h2><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('sceneGroupManager.description')}</p></div>
                <div className="flex shrink-0 items-center gap-2"><StatusBadge tone="green">{groupsWithAnnotations} {t('sceneGroupManager.withAnnotations')}</StatusBadge><Button variant="outline" size="xs" onClick={() => setActiveTab('table')}><Table2 className="h-3 w-3" />{t('sceneGroupManager.sceneGroupTable')}</Button></div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <SummaryMetric icon={Layers} label={t('sceneGroupManager.groups')} value={groupRows.length} />
                  <SummaryMetric icon={Layers} label={t('sceneGroupManager.views')} value={views.length} />
                  <SummaryMetric icon={ImageIcon} label={t('sceneGroupManager.images')} value={totalImages} />
                </div>
                <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{t('sceneGroupManager.shapeDistribution')}</h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('sceneGroupManager.shapeDistributionHint')}</p>
                    </div>
                    <StatusBadge tone="blue">{shapeChartData.points.reduce((sum, point) => sum + point.imageCount, 0)}/{totalImages} {t('sceneGroupManager.images')}</StatusBadge>
                  </div>
                  <ImageShapeDistributionChart
                    points={shapeChartData.points}
                    widthHistogram={shapeChartData.widthHistogram}
                    heightHistogram={shapeChartData.heightHistogram}
                    unknownCount={shapeChartData.unknownCount}
                    loading={metadataLoading}
                    loadingLabel={t('sceneGroupManager.loading')}
                    noDataLabel={t('sceneGroupManager.noShapeData')}
                    scatterHint={t('sceneGroupManager.shapeScatterHint')}
                    widthHistogramLabel={t('sceneGroupManager.widthHistogram')}
                    heightHistogramLabel={t('sceneGroupManager.heightHistogram')}
                    imagesLabel={t('sceneGroupManager.images')}
                    unknownLabel={t('sceneGroupManager.unknownShape')}
                  />
                </section>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-950/30">
              <div className="shrink-0 border-b border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-black">{t('sceneGroupManager.sceneGroupTable')}</h2>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('sceneGroupManager.tableHint')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge tone={metadataCount > 0 ? 'green' : 'neutral'}>
                      {metadataLoading ? `${metadataProgress.current}/${metadataProgress.total}` : `${metadataCount}/${metadataTargetCount}`} {t('sceneGroupManager.metadataRecords')}
                    </StatusBadge>
                    <Button variant="outline" size="xs" onClick={() => void loadMetadata()} disabled={metadataLoading} title={t('sceneGroupManager.refreshMetadata')}>
                      <RefreshCw className={metadataLoading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                      {t('sceneGroupManager.refreshMetadata')}
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('sceneGroupManager.search')} className="h-9 pl-8 pr-8 text-xs" />
                    {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200" title={t('sceneGroupManager.clearSearch')} aria-label={t('sceneGroupManager.clearSearch')}><X className="h-3.5 w-3.5" /></button>}
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                    {filteredImageRows.length}/{totalImages} {t('sceneGroupManager.images')}
                  </span>
                </div>
                {metadataLoading && metadataProgress.total > 0 && <p className="mt-3 flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('sceneGroupManager.loading')} <span className="font-mono">{metadataProgress.current}/{metadataProgress.total}</span></p>}
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-5 custom-scrollbar">
                {filteredImageRows.length === 0 ? <EmptyState>{query ? t('sceneGroupManager.noMatches') : t('sceneGroupManager.noImages')}</EmptyState> : <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"><table className="w-full min-w-[1240px] border-collapse text-left text-[11px]"><thead className="sticky top-0 z-10 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500 dark:bg-neutral-800/95 dark:text-neutral-400"><tr><th className="whitespace-nowrap px-4 py-3 font-black">{t('sceneGroupManager.sceneGroup')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.imageName')}</th><th className="min-w-[190px] px-3 py-3 font-black">{t('sceneGroupManager.viewAndBands')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.imageWidth')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.imageHeight')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.latitude')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.longitude')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.altitude')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.heading')}</th><th className="whitespace-nowrap px-3 py-3 font-black">{t('sceneGroupManager.utc')}</th></tr></thead><tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">{filteredImageRows.map((row) => { const data = imageDataByStem[row.imageStem]; const metadata = data?.metadata || null; return <tr key={row.sceneGroup + '-' + row.imageName} onClick={() => setSelectedStem(row.sceneGroup)} onDoubleClick={() => openScene(row.sceneGroup)} className={selectedStem === row.sceneGroup ? 'cursor-pointer bg-blue-100/80 shadow-[inset_3px_0_0_#2563eb] transition-colors dark:bg-blue-950/50 dark:shadow-[inset_3px_0_0_#60a5fa]' : 'cursor-pointer transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-950/20'} title={t('sceneGroupManager.tableRowHint')}><td className="max-w-[180px] truncate px-4 py-2.5 font-mono font-medium" title={row.sceneGroup}>{row.sceneGroup}</td><td className="max-w-[260px] truncate px-3 py-2.5 font-mono" title={row.imageName}>{row.imageName}</td><td className="px-3 py-2.5"><div className="space-y-1">{row.views.map((view) => <div key={view.viewId} className="whitespace-nowrap text-neutral-700 dark:text-neutral-200"><span>{view.viewLabel}</span><span className="ml-1 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">[{view.bands.length > 0 ? view.bands.join(', ') : '—'}]</span></div>)}</div></td><td className="px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300">{formatValue(data?.width)}</td><td className="px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300">{formatValue(data?.height)}</td><td className="px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300">{formatValue(readFirstMetaValue(metadata, ['latitude', 'lat']))}</td><td className="px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300">{formatValue(readFirstMetaValue(metadata, ['longitude', 'lon', 'lng']))}</td><td className="px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300">{formatValue(readFirstMetaValue(metadata, ['altitude', 'gps_altitude', 'elevation', 'height']))}</td><td className="px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300">{formatValue(readFirstMetaValue(metadata, ['heading', 'yaw', 'course']))}</td><td className="max-w-[210px] truncate px-3 py-2.5 font-mono text-neutral-600 dark:text-neutral-300" title={formatValue(readFirstMetaValue(metadata, ['utc_iso', 'utc', 'timestamp']))}>{data?.error ? <span className="text-amber-600 dark:text-amber-300">{t('sceneGroupManager.loadFailed')}</span> : formatValue(readFirstMetaValue(metadata, ['utc_iso', 'utc', 'timestamp']))}</td></tr>; })}</tbody></table></div>}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
