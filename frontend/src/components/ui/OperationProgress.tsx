import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { formatRemainingTime, normalizeProgress } from '../../lib/progress';

interface EtaTracker {
  trackingKey: string;
  startedAt: number;
  lastTimestamp: number;
  lastPercent: number;
  speedPercentPerSecond: number;
  samples: number;
}

interface ProgressSample {
  stageKey: string;
  current: number;
  total: number;
}

const MIN_ETA_SAMPLE_MS = 1500;

function useMonotonicPercent(percent: number, trackingKey: string): number {
  const displayRef = useRef({ trackingKey: '', percent: 0 });

  if (
    displayRef.current.trackingKey !== trackingKey
    || (percent <= 0 && displayRef.current.percent > 0)
  ) {
    displayRef.current = { trackingKey, percent };
  } else if (percent > displayRef.current.percent) {
    displayRef.current.percent = percent;
  }

  return displayRef.current.percent;
}

function useEstimatedTime(
  percent: number,
  trackingKey: string,
  enabled: boolean,
): number | null {
  const trackerRef = useRef<EtaTracker>({
    trackingKey: '',
    startedAt: 0,
    lastTimestamp: 0,
    lastPercent: 0,
    speedPercentPerSecond: 0,
    samples: 0,
  });
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEtaSeconds(null);
      return;
    }

    const now = Date.now();
    const tracker = trackerRef.current;
    const startsNewOperation =
      tracker.trackingKey !== trackingKey
      || (percent <= 0 && tracker.lastPercent > 0);

    if (startsNewOperation) {
      trackerRef.current = {
        trackingKey,
        startedAt: now,
        lastTimestamp: now,
        lastPercent: percent,
        speedPercentPerSecond: 0,
        samples: 0,
      };
      setEtaSeconds(null);
      return;
    }

    if (percent <= 0 || percent >= 100) {
      tracker.lastPercent = percent;
      tracker.lastTimestamp = now;
      tracker.speedPercentPerSecond = 0;
      tracker.samples = 0;
      setEtaSeconds(null);
      return;
    }

    const percentDelta = percent - tracker.lastPercent;
    if (percentDelta > 0.01) {
      const elapsedSeconds = Math.max((now - tracker.lastTimestamp) / 1000, 0.001);
      const instantSpeed = percentDelta / elapsedSeconds;
      tracker.speedPercentPerSecond = tracker.speedPercentPerSecond > 0
        ? tracker.speedPercentPerSecond * 0.7 + instantSpeed * 0.3
        : instantSpeed;
      tracker.samples += 1;
      tracker.lastPercent = percent;
      tracker.lastTimestamp = now;
    }

    const elapsedMs = now - tracker.startedAt;
    if (
      tracker.samples > 0
      && tracker.speedPercentPerSecond > 0
      && elapsedMs >= MIN_ETA_SAMPLE_MS
    ) {
      setEtaSeconds(Math.max(0, (100 - percent) / tracker.speedPercentPerSecond));
    } else {
      setEtaSeconds(null);
    }
  }, [enabled, percent, trackingKey]);

  return etaSeconds;
}

export interface OperationProgressProps {
  stageIndex: number;
  stageCount: number;
  stageName: ReactNode;
  current?: number;
  total?: number;
  /**
   * Kept for backwards compatibility with older callers. The visible bar is
   * intentionally based on the current stage's current/total pair.
   */
  overallPercent?: number | null;
  stageLabel?: string;
  className?: string;
  barClassName?: string;
  /** Optional identity used to reset ETA sampling when a new operation starts. */
  operationKey?: string | number;
  showEta?: boolean;
}

/**
 * Shared progress presentation for long-running operations.
 *
 * The first row communicates overall stage state; the second row reports only
 * the progress of the active stage. A stage can omit current/total while the
 * backend is working on an indivisible operation. The latter keeps the UI
 * honest by showing an empty track instead of inventing a percentage until a
 * stage total is available.
 */
export function OperationProgress({
  stageIndex,
  stageCount,
  stageName,
  current,
  total,
  stageLabel = 'Stage',
  className,
  barClassName,
  operationKey = 'default',
  showEta = true,
}: OperationProgressProps) {
  const safeStageCount = Number.isFinite(stageCount) && stageCount > 0
    ? Math.floor(stageCount)
    : 1;
  const safeStageIndex = Number.isFinite(stageIndex)
    ? Math.min(safeStageCount, Math.max(1, Math.floor(stageIndex)))
    : 1;
  const rawProgress = normalizeProgress({ current, total });
  const stageKey = `${operationKey}:stage:${safeStageIndex}/${safeStageCount}`;
  const previousSampleRef = useRef<ProgressSample>({ stageKey: '', current: 0, total: 0 });
  const previousSample = previousSampleRef.current;
  const stageChanged = previousSample.stageKey !== stageKey;
  const isStaleStageSnapshot = stageChanged
    && previousSample.stageKey !== ''
    && rawProgress.current === previousSample.current
    && rawProgress.total === previousSample.total;
  const progress = isStaleStageSnapshot
    ? { current: 0, total: rawProgress.total, percent: 0 }
    : rawProgress;
  previousSampleRef.current = {
    stageKey,
    current: rawProgress.current,
    total: rawProgress.total,
  };
  const { current: safeCurrent, total: safeTotal, percent } = progress;
  const hasTotal = safeTotal > 0;
  const trackingKey = `${stageKey}:total:${safeTotal}`;
  const displayPercent = useMonotonicPercent(percent, trackingKey);
  const etaSeconds = useEstimatedTime(displayPercent, trackingKey, showEta);
  const displayPercentLabel = hasTotal ? `${Math.round(displayPercent)}%` : '—';
  const quantityLabel = hasTotal ? `${safeCurrent}/${safeTotal}` : '—';
  const { t } = useTranslation();

  return (
    <div className={cn('min-w-0 flex-1 space-y-1.5', className)}>
      <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
        <div
          className="flex w-20 shrink-0 items-center gap-0.5"
          aria-label={`${stageLabel} ${safeStageIndex}/${safeStageCount}`}
        >
          {Array.from({ length: safeStageCount }, (_, index) => {
            const stageNumber = index + 1;
            const isCompleted = stageNumber < safeStageIndex;
            const isActive = stageNumber === safeStageIndex;
            return (
              <span
                key={stageNumber}
                className={cn(
                  'h-1.5 min-w-0 flex-1 rounded-sm border transition-colors',
                  isCompleted && 'border-blue-500 bg-blue-500',
                  isActive && 'border-red-500 bg-red-500',
                  !isCompleted && !isActive && 'border-muted-foreground/40 bg-transparent',
                )}
                title={`${stageLabel} ${stageNumber}/${safeStageCount}`}
              />
            );
          })}
        </div>
        <span className="shrink-0 font-medium text-foreground">
          {stageLabel} {safeStageIndex}/{safeStageCount}
        </span>
        <span className="min-w-0 flex-1 truncate" title={typeof stageName === 'string' ? stageName : undefined}>
          [{stageName}]:
        </span>
        {etaSeconds !== null && (
          <span className="shrink-0 text-primary" aria-live="polite">
            {t('common.eta')}: {formatRemainingTime(etaSeconds)}
          </span>
        )}
        <span className="shrink-0 font-mono" aria-label="Current stage quantity">
          {quantityLabel}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasTotal ? Math.round(displayPercent) : undefined}
        >
          {hasTotal && (
            <div
              key={trackingKey}
              className={cn(
                // Progress callbacks can arrive faster than a CSS width
                // transition (for example, one callback per saved scene).
                // Render the latest value immediately so the bar cannot lag
                // behind the current/total text.
                'h-full rounded-full bg-primary',
                barClassName,
              )}
              style={{ width: `${displayPercent}%` }}
            />
          )}
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
          {displayPercentLabel}
        </span>
      </div>
    </div>
  );
}
