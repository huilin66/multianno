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
 * A stage can either expose a determinate current/total pair or omit the pair
 * while the backend is working on an indivisible operation. The latter keeps
 * the UI honest by showing an indeterminate bar instead of inventing a
 * percentage.
 */
export function OperationProgress({
  stageIndex,
  stageCount,
  stageName,
  current,
  total,
  overallPercent,
  stageLabel = 'Stage',
  className,
  barClassName,
  operationKey = 'default',
  showEta = true,
}: OperationProgressProps) {
  const hasOverallPercent = Number.isFinite(overallPercent);
  const progress = normalizeProgress({
    current,
    total,
    percent: hasOverallPercent ? overallPercent : undefined,
  });
  const { current: safeCurrent, total: safeTotal, percent } = progress;
  const hasTotal = safeTotal > 0;
  const trackingKey = hasOverallPercent
    ? `${operationKey}:overall`
    : `${operationKey}:stage:${stageIndex}/${stageCount}:total:${safeTotal}`;
  const displayPercent = useMonotonicPercent(percent, trackingKey);
  const etaSeconds = useEstimatedTime(displayPercent, trackingKey, showEta);
  const showDeterminateProgress = hasOverallPercent || (hasTotal && safeCurrent > 0);
  const { t } = useTranslation();

  return (
    <div className={cn('min-w-0 flex-1 space-y-1.5', className)}>
      <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
        <span className="shrink-0 font-medium text-foreground">
          {stageLabel} {stageIndex}/{stageCount}
        </span>
        <span className="min-w-0 flex-1 truncate" title={typeof stageName === 'string' ? stageName : undefined}>
          {stageName}:
        </span>
        {etaSeconds !== null && (
          <span className="shrink-0 text-primary" aria-live="polite">
            {t('common.eta')}: {formatRemainingTime(etaSeconds)}
          </span>
        )}
        {hasTotal && (
          <span className="shrink-0 font-mono">
            {safeCurrent}/{safeTotal}
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            showDeterminateProgress ? 'bg-primary' : 'w-1/2 animate-pulse bg-primary',
            barClassName,
          )}
          style={showDeterminateProgress ? { width: `${displayPercent}%` } : undefined}
        />
      </div>
    </div>
  );
}
