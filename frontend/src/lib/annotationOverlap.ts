import type { Annotation } from '../store/useStore';
import { getAnnotationBounds, type AnnotationBounds } from './annotationHitTest';

export type AnnotationOverlapMode = 'iou' | 'ios';

export interface AnnotationOverlapBounds extends AnnotationBounds {
  area: number;
}

export interface AnnotationOverlapResult {
  matchedKeys: Set<string>;
  overlapCounts: Map<string, number>;
  overlapGroups: Map<string, string>;
}

/**
 * Use a scene-qualified key so legacy projects with repeated annotation ids
 * cannot mix objects from different scene groups.
 */
export const getAnnotationOverlapKey = (annotation: Pick<Annotation, 'id' | 'stem'>) => (
  `${annotation.stem}::${annotation.id}`
);

export const getAnnotationOverlapBounds = (annotation: any): AnnotationOverlapBounds | null => {
  const bounds = getAnnotationBounds(annotation);
  if (!bounds) return null;

  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  return {
    ...bounds,
    area: width * height,
  };
};

/**
 * Calculate the same overlap metrics used by the Object List overlap cleaner.
 * IoS is intersection over the smaller object, which is useful for nested
 * duplicate boxes; IoU is the standard intersection over union metric.
 */
export const calculateAnnotationOverlap = (
  first: AnnotationOverlapBounds | null,
  second: AnnotationOverlapBounds | null,
  mode: AnnotationOverlapMode,
) => {
  if (!first || !second || first.area <= 0 || second.area <= 0) return 0;

  const intersectionWidth = Math.max(
    0,
    Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY),
  );
  const intersectionArea = intersectionWidth * intersectionHeight;
  if (intersectionArea <= 0) return 0;

  if (mode === 'ios') {
    return intersectionArea / Math.min(first.area, second.area);
  }
  return intersectionArea / (first.area + second.area - intersectionArea);
};

/**
 * Scan all annotations for pairs that overlap within the same scene group.
 * The result contains every object participating in at least one overlap and
 * the number of direct overlapping neighbours for each object.
 */
export const findAnnotationOverlaps = (
  annotations: Annotation[],
  mode: AnnotationOverlapMode,
  thresholdPercent: number,
): AnnotationOverlapResult => {
  const threshold = Math.max(0, Math.min(100, thresholdPercent)) / 100;
  const candidatesByStem = new Map<string, Array<{
    annotation: Annotation;
    key: string;
    bounds: AnnotationOverlapBounds;
  }>>();

  annotations.forEach((annotation) => {
    const bounds = getAnnotationOverlapBounds(annotation);
    if (!bounds || bounds.area <= 0) return;

    const candidates = candidatesByStem.get(annotation.stem) || [];
    candidates.push({
      annotation,
      key: getAnnotationOverlapKey(annotation),
      bounds,
    });
    candidatesByStem.set(annotation.stem, candidates);
  });

  const matchedKeys = new Set<string>();
  const overlapCounts = new Map<string, number>();
  const overlapGroups = new Map<string, string>();
  let groupCount = 0;

  candidatesByStem.forEach((candidates) => {
    const adjacency = new Map<string, Set<string>>();
    candidates.forEach((candidate) => adjacency.set(candidate.key, new Set<string>()));

    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
      const first = candidates[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
        const second = candidates[secondIndex];

        // Avoid the metric calculation when the envelopes do not intersect.
        if (
          first.bounds.maxX <= second.bounds.minX
          || second.bounds.maxX <= first.bounds.minX
          || first.bounds.maxY <= second.bounds.minY
          || second.bounds.maxY <= first.bounds.minY
        ) {
          continue;
        }

        const overlap = calculateAnnotationOverlap(first.bounds, second.bounds, mode);
        if (overlap < threshold) continue;

        matchedKeys.add(first.key);
        matchedKeys.add(second.key);
        overlapCounts.set(first.key, (overlapCounts.get(first.key) || 0) + 1);
        overlapCounts.set(second.key, (overlapCounts.get(second.key) || 0) + 1);
        adjacency.get(first.key)?.add(second.key);
        adjacency.get(second.key)?.add(first.key);
      }
    }

    // Give each connected component one group id. This keeps transitive
    // duplicates together: A overlaps B and B overlaps C means A/B/C are
    // shown as one linked overlap group.
    const visited = new Set<string>();
    candidates.forEach((candidate) => {
      if (visited.has(candidate.key) || !adjacency.get(candidate.key)?.size) return;

      groupCount += 1;
      const groupName = `OP_${groupCount}`;
      const queue = [candidate.key];
      visited.add(candidate.key);

      while (queue.length > 0) {
        const currentKey = queue.shift()!;
        overlapGroups.set(currentKey, groupName);
        adjacency.get(currentKey)?.forEach((neighborKey) => {
          if (visited.has(neighborKey)) return;
          visited.add(neighborKey);
          queue.push(neighborKey);
        });
      }
    });
  });

  return { matchedKeys, overlapCounts, overlapGroups };
};
