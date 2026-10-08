import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface OperationProgressProps {
  stageIndex: number;
  stageCount: number;
  stageName: ReactNode;
  current?: number;
  total?: number;
  stageLabel?: string;
  className?: string;
  barClassName?: string;
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
  stageLabel = 'Stage',
  className,
  barClassName,
}: OperationProgressProps) {
  const hasTotal = Number.isFinite(total) && Number(total) > 0;
  const safeTotal = hasTotal ? Number(total) : 0;
  const safeCurrent = hasTotal
    ? Math.min(safeTotal, Math.max(0, Number(current) || 0))
    : 0;
  const percent = hasTotal ? (safeCurrent / safeTotal) * 100 : 0;

  return (
    <div className={cn('min-w-0 flex-1 space-y-1.5', className)}>
      <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
        <span className="shrink-0 font-medium text-foreground">
          {stageLabel} {stageIndex}/{stageCount}
        </span>
        <span className="min-w-0 flex-1 truncate" title={typeof stageName === 'string' ? stageName : undefined}>
          {stageName}:
        </span>
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
            hasTotal ? 'bg-primary' : 'w-1/2 animate-pulse bg-primary',
            barClassName,
          )}
          style={hasTotal ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}
