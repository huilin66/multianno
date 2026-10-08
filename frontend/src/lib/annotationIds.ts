/**
 * Stable IDs for annotation shapes.
 *
 * IDs are intentionally UUIDs rather than hashes of geometry. Editing a box
 * must not change the identity used by future track/sequence references.
 */
export const normalizeAnnotationId = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const createRandomId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `anno_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

export const createAnnotationId = (reservedIds?: ReadonlySet<string>): string => {
  let id = createRandomId();
  while (reservedIds?.has(id)) {
    id = createRandomId();
  }
  return id;
};

export const ensureUniqueAnnotationIds = <T extends { id?: unknown }>(
  annotations: T[],
  reservedIds: Iterable<string> = [],
): Array<T & { id: string }> => {
  const usedIds = new Set(reservedIds);

  return annotations.map((annotation) => {
    const candidate = normalizeAnnotationId(annotation.id);
    const id = candidate && !usedIds.has(candidate)
      ? candidate
      : createAnnotationId(usedIds);

    usedIds.add(id);
    return annotation.id === id
      ? annotation as T & { id: string }
      : { ...annotation, id } as T & { id: string };
  });
};
