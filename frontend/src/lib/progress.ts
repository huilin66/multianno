export interface ProgressSnapshot {
  current: number;
  total: number;
  percent: number;
}

export interface ProgressEvent extends ProgressSnapshot {
  stageIndex?: number;
  stageCount?: number;
  stageName?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Normalize progress received from a backend stream or a local callback.
 * The backend total is preferred; fallbackTotal is only used for legacy
 * callers that do not provide a total.
 */
export function normalizeProgress(
  event: Partial<ProgressEvent> | null | undefined,
  fallbackTotal = 0,
): ProgressSnapshot {
  const rawTotal = toFiniteNumber(event?.total, fallbackTotal);
  const total = rawTotal > 0 ? Math.floor(rawTotal) : 0;
  const rawCurrent = toFiniteNumber(event?.current, 0);
  const current = total > 0 ? Math.floor(clamp(rawCurrent, 0, total)) : 0;
  const derivedPercent = total > 0 ? (current / total) * 100 : 0;
  const rawPercent = toFiniteNumber(event?.percent, derivedPercent);
  const percent = clamp(rawPercent, 0, 100);

  return { current, total, percent };
}

/**
 * Format a remaining duration compactly enough to fit beside a progress bar.
 */
export function formatRemainingTime(seconds: number): string {
  const safeSeconds = Math.max(1, Math.ceil(seconds));

  if (safeSeconds < 60) return `~${safeSeconds}s`;

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `~${minutes}m ${remainingSeconds}s`
      : `~${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `~${hours}h ${remainingMinutes}m`
    : `~${hours}h`;
}
