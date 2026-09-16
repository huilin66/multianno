import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import {
  Boxes,
  Database,
  Download,
  Edit3,
  FolderOpen,
  HardDrive,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '../ui/button';
import { COLOR_MAPS } from '../../config/colors';
import type { ProjectMetaContract } from '../../config/contract';
import { generateProjectMetaConfig } from '../../lib/projectUtils';
import { useStore } from '../../store/useStore';

interface ProjectMetaDashboardProps {
  onClose?: () => void;
}

type MetaFolder = ProjectMetaContract['folders'][number];
type MetaView = ProjectMetaContract['views'][number];

const badgeStyles = {
  neutral:
    'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-300',
  blue:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  green:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
} as const;

function MetaBadge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof badgeStyles;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${badgeStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
}) {
  return (
    <div className="min-w-[88px] rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-0.5 font-mono text-lg font-semibold leading-5 text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
    </div>
  );
}

function PanelHeading({
  icon: Icon,
  title,
  count,
  description,
  iconClassName,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  description: string;
  iconClassName: string;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 ${iconClassName}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{description}</p>
        </div>
      </div>
      <MetaBadge tone="neutral" className="shrink-0 px-2 py-1 text-xs">
        {count}
      </MetaBadge>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
      <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="min-w-0 text-right font-mono text-neutral-700 dark:text-neutral-300">{children}</span>
    </div>
  );
}

function FolderCard({ folder, t }: { folder: MetaFolder; t: TFunction; key?: string | number }) {
  const imageMeta = folder['image meta'];

  return (
    <article className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 transition-colors hover:border-blue-200 hover:bg-blue-50/30 dark:border-neutral-800 dark:bg-black/20 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/[0.04]">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 font-mono text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          {String(folder.Id).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={folder.path}>
            {folder.path}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MetaBadge tone="amber">
              {t('projectMeta.folders.suffix')}: {folder.suffix || '—'}
            </MetaBadge>
            <MetaBadge tone="amber">
              {t('projectMeta.folders.extension')}: {folder.extension || '—'}
            </MetaBadge>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t('projectMeta.folders.validFiles')}</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400">
            {folder['files in sceneGroups']}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t('projectMeta.folders.skipped')}</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
            {folder['files Skipped']}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-2 py-2 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t('projectMeta.folders.total')}</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-blue-600 dark:text-blue-400">
            {folder['files total']}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-lg border border-neutral-200/80 bg-white/80 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/70">
        <InfoRow label={t('projectMeta.folders.size')}>
          {imageMeta?.width ?? 'Unknown'} × {imageMeta?.height ?? 'Unknown'}
        </InfoRow>
        <InfoRow label={t('projectMeta.folders.bands')}>{imageMeta?.bands ?? 'Unknown'}</InfoRow>
        <div className="col-span-3 border-t border-neutral-100 pt-1.5 dark:border-neutral-800">
          <InfoRow label={t('projectMeta.folders.type')}>
            <span className="truncate" title={String(imageMeta?.['data type'] ?? 'uint8')}>
              {imageMeta?.['data type'] ?? 'uint8'}
            </span>
          </InfoRow>
        </div>
      </div>
    </article>
  );
}

function ViewSettingsSummary({ view, t }: { view: MetaView; t: TFunction }) {
  const settings = view.settings || {};
  const isSingleBand = view.bands.length === 1;
  const isDefaultRaw =
    isSingleBand &&
    !settings.binarize?.enabled &&
    (!settings.enhancementMode || settings.enhancementMode === 'manual') &&
    (settings.gamma ?? 1) === 1 &&
    settings.spatialFilter !== 'sharpen' &&
    !settings.invert &&
    (settings.minMax?.[0] ?? 0) === 0 &&
    (settings.minMax?.[1] ?? 100) === 100;

  return (
    <div className="mt-3 border-t border-neutral-200/80 pt-3 dark:border-neutral-800">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {isSingleBand ? t('projectMeta.views.enhancements') : t('projectMeta.views.colorAdjust')}
        </div>
        <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
          {isSingleBand ? (
            <>
              {settings.binarize?.enabled ? (
                <MetaBadge tone="amber">{t('projectMeta.views.binarize')}: {settings.binarize.threshold}</MetaBadge>
              ) : settings.enhancementMode && settings.enhancementMode !== 'manual' ? (
                <MetaBadge tone="blue">
                  {settings.enhancementMode === 'he'
                    ? t('projectMeta.views.globalHE')
                    : t('projectMeta.views.autoCLAHE')}
                </MetaBadge>
              ) : isDefaultRaw ? (
                <MetaBadge>{t('projectMeta.views.defaultRaw')}</MetaBadge>
              ) : (
                <MetaBadge tone="blue">
                  {t('projectMeta.views.stretch')}: {settings.minMax?.[0] ?? 0}%–{settings.minMax?.[1] ?? 100}%
                </MetaBadge>
              )}
              {(settings.gamma ?? 1) !== 1 && <MetaBadge tone="blue">γ: {settings.gamma?.toFixed(1)}</MetaBadge>}
              {settings.spatialFilter === 'sharpen' && <MetaBadge tone="green">{t('projectMeta.views.sharpen')}</MetaBadge>}
              {settings.invert && <MetaBadge tone="neutral">{t('projectMeta.views.invert')}</MetaBadge>}
            </>
          ) : (
            <>
              <MetaBadge tone="blue">B: {settings.brightness ?? 1}</MetaBadge>
              <MetaBadge tone="blue">C: {settings.contrast ?? 1}</MetaBadge>
              <MetaBadge tone="blue">S: {settings.saturation ?? 1}</MetaBadge>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewCard({ view, t }: { view: MetaView; t: TFunction; key?: string | number }) {
  const crop = view.crop || { t: 0, r: 100, b: 100, l: 0 };

  return (
    <article className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 transition-colors hover:border-blue-200 hover:bg-blue-50/30 dark:border-neutral-800 dark:bg-black/20 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/[0.04]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${view.isMain ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
            {view.isMain ? 'M' : 'A'}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h4 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={view.id}>
                {view.id}
              </h4>
              {view.isMain && <MetaBadge tone="blue">{t('projectMeta.views.baseRef')}</MetaBadge>}
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {t('projectMeta.views.folderId')}: <span className="font-mono">{view['folder id']}</span>
            </p>
          </div>
        </div>
        <MetaBadge tone={view.isMain ? 'blue' : 'amber'}>{view.isMain ? 'MAIN' : 'AUX'}</MetaBadge>
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-2 border-t border-neutral-200/80 pt-3 sm:grid-cols-2 dark:border-neutral-800">
        <InfoRow label={t('projectMeta.views.bands')}>
          <span className="inline-flex flex-wrap justify-end gap-1">
            {view.bands.map((band, index) => (
              <span key={`${band}-${index}`} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {band}
              </span>
            ))}
          </span>
        </InfoRow>
        {view.bands.length === 1 && (
          <InfoRow label={t('projectMeta.views.renderMode')}>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-5 rounded-sm bg-gradient-to-r ${COLOR_MAPS.find((color) => color.name === (view.renderMode || 'gray'))?.css || 'from-black to-white'}`} />
              <span>{view.renderMode || 'gray'}</span>
            </span>
          </InfoRow>
        )}
        {!view.isMain && (
          <>
            <InfoRow label={t('projectMeta.views.crop')}>
              {crop.t.toFixed(1)}%, {crop.r.toFixed(1)}%, {crop.b.toFixed(1)}%, {crop.l.toFixed(1)}%
            </InfoRow>
            <InfoRow label={t('projectMeta.views.scale')}>
              {view.transform.scaleX.toFixed(3)}, {view.transform.scaleY.toFixed(3)}
            </InfoRow>
            <InfoRow label={t('projectMeta.views.offset')}>
              {view.transform.offsetX.toFixed(0)}px, {view.transform.offsetY.toFixed(0)}px
            </InfoRow>
          </>
        )}
      </div>

      <ViewSettingsSummary view={view} t={t} />
    </article>
  );
}

export function ProjectMetaDashboard({ onClose }: ProjectMetaDashboardProps = {}) {
  const { t } = useTranslation();
  const { projectName, folders, views, setActiveModule } = useStore();
  const workspacePath = useStore((state) => state.workspacePath);

  if (!folders || folders.length === 0) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10">
          <Database className="h-7 w-7 text-blue-500/70" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{t('projectMeta.empty.title')}</h2>
          <p className="mt-1 text-sm">{t('projectMeta.empty.desc')}</p>
        </div>
        <Button onClick={() => setActiveModule('preload')} size="sm">
          <FolderOpen className="mr-2 h-4 w-4" />
          {t('projectMeta.empty.goPreload')}
        </Button>
      </div>
    );
  }

  const meta: ProjectMetaContract = generateProjectMetaConfig(useStore.getState());
  const metaWorkspacePath = meta.workspacePath || workspacePath || '';
  const sceneCount = Object.keys(meta.sceneGroups || {}).length;

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectName || meta.projectName}_meta.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white/90 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <MetaBadge tone="blue">{t('projectMeta.overview.label')}</MetaBadge>
              <MetaBadge>{t('projectMeta.overview.schema')} v{meta.schemaVersion}</MetaBadge>
            </div>
            <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100" title={meta.projectName}>
              {meta.projectName}
            </h2>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <HardDrive className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0 font-medium">{t('projectMeta.overview.workspace')}:</span>
              <span className="min-w-0 truncate font-mono" title={metaWorkspacePath || t('projectMeta.overview.notConfigured')}>
                {metaWorkspacePath || t('projectMeta.overview.notConfigured')}
              </span>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-2">
            <SummaryMetric icon={FolderOpen} label={t('projectMeta.overview.folders')} value={meta.folders.length} />
            <SummaryMetric icon={Layers} label={t('projectMeta.overview.views')} value={meta.views.length} />
            <SummaryMetric icon={Boxes} label={t('projectMeta.overview.scenes')} value={sceneCount} />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none">
            <PanelHeading
              icon={FolderOpen}
              iconClassName="text-amber-600 dark:text-amber-300"
              title={t('projectMeta.folders.title')}
              description={t('projectMeta.overview.folderDescription')}
              count={meta.folders.length}
            />
            <div className="space-y-3 p-3.5">
              {meta.folders.map((folder) => <FolderCard key={folder.Id} folder={folder} t={t} />)}
              {meta.folders.length === 0 && <div className="py-8 text-center text-sm text-neutral-500">{t('projectMeta.folders.noFolders')}</div>}
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none">
            <PanelHeading
              icon={Layers}
              iconClassName="text-blue-600 dark:text-blue-300"
              title={t('projectMeta.views.title')}
              description={t('projectMeta.overview.viewDescription')}
              count={meta.views.length}
            />
            <div className="space-y-3 p-3.5">
              {meta.views.map((view) => <ViewCard key={view.id} view={view} t={t} />)}
              {meta.views.length === 0 && <div className="py-8 text-center text-sm text-neutral-500">{t('projectMeta.views.noViews')}</div>}
            </div>
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <Database className="h-3.5 w-3.5" />
          <span>{t('projectMeta.bottom.liveState')}</span>
          <span className="text-neutral-300 dark:text-neutral-700">•</span>
          <span className="font-mono">v{meta.schemaVersion}</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={handleExportJSON} variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t('projectMeta.bottom.downloadJson')}
          </Button>
          <Button onClick={() => setActiveModule('preload')} variant="outline" size="sm" className="border-amber-500/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10">
            <Edit3 className="mr-1.5 h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => (onClose ? onClose() : setActiveModule('workspace'))}
          >
            {t('common.confirm')}
          </Button>
        </div>
      </footer>
    </div>
  );
}
