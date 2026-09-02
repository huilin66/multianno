export type AnnotationAttributeValue = string | number | boolean;

export type AnnotationAttributeDefinition = {
  id?: string | number;
  name?: string;
  options?: unknown[];
};

export type AnnotationWithAttributes = {
  attributes?: unknown;
  attrs?: unknown;
  attribute?: unknown;
};

export type AnnotationAttributeEntry = [string, string];

const NO_ATTRIBUTE_VALUES = new Set([
  '',
  '0',
  '0.0',
  'false',
  'none',
  'no',
  'normal',
]);

const ATTRIBUTE_SOURCE_KEYS = ['attributes', 'attrs', 'attribute'] as const;
const NESTED_ATTRIBUTE_KEYS = ['attributes', 'values', 'data'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseSerializedAttributes = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || !['{', '['].includes(text[0])) return value;

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const unwrapAttributeContainer = (value: unknown): unknown => {
  const parsed = parseSerializedAttributes(value);
  if (!isRecord(parsed)) return parsed;

  for (const key of NESTED_ATTRIBUTE_KEYS) {
    const nested = parsed[key];
    if (isRecord(nested) || Array.isArray(nested)) return nested;
  }

  return parsed;
};

const getAttributeDefinitions = (
  taxonomyAttributes: AnnotationAttributeDefinition[] | null | undefined,
) => (Array.isArray(taxonomyAttributes) ? taxonomyAttributes : [])
  .map((definition) => ({
    ...definition,
    name: String(definition?.name ?? '').trim(),
  }))
  .filter((definition) => definition.name);

const getDefinitionByName = (
  name: string,
  definitions: AnnotationAttributeDefinition[],
) => definitions.find((definition) => (
  definition.name?.trim().toLowerCase() === name.trim().toLowerCase()
));

const decodeIndexedValue = (
  value: unknown,
  definition?: AnnotationAttributeDefinition,
): unknown => {
  const options = definition?.options;
  if (!Array.isArray(options) || options.length === 0) return value;

  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue >= options.length) {
    return value;
  }

  return options[numericValue];
};

const toDisplayValue = (value: unknown): AnnotationAttributeValue | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (isRecord(value)) {
    const nestedValue = value.value ?? value.selectedValue ?? value.selected ?? value.val;
    if (nestedValue !== undefined) return toDisplayValue(nestedValue);
  }

  return String(value);
};

const collectAttributeEntries = (
  rawAttributes: unknown,
  taxonomyAttributes: AnnotationAttributeDefinition[],
): AnnotationAttributeEntry[] => {
  const attributes = unwrapAttributeContainer(rawAttributes);
  if (!attributes) return [];

  const entries: AnnotationAttributeEntry[] = [];
  const addEntry = (rawName: unknown, rawValue: unknown) => {
    const name = String(rawName ?? '').trim();
    const value = toDisplayValue(rawValue);
    if (!name || value === null) return;

    const definition = getDefinitionByName(name, taxonomyAttributes);
    entries.push([name, String(decodeIndexedValue(value, definition)).trim()]);
  };

  if (Array.isArray(attributes)) {
    let hasNamedEntries = false;

    attributes.forEach((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        hasNamedEntries = true;
        addEntry(item[0], item[1]);
        return;
      }

      if (isRecord(item)) {
        const name = item.name ?? item.attribute ?? item.key ?? item.id;
        const value = item.value ?? item.selectedValue ?? item.selected ?? item.val;
        if (name !== undefined && value !== undefined) {
          hasNamedEntries = true;
          addEntry(name, value);
        }
      }
    });

    // yolo_data_manager keeps YOLO attributes as an ordered numeric vector.
    // Decode that vector using the taxonomy order and option list.
    if (!hasNamedEntries) {
      attributes.forEach((value, index) => {
        const definition = taxonomyAttributes[index];
        if (definition?.name) {
          const decoded = decodeIndexedValue(value, definition);
          addEntry(definition.name, decoded);
        }
      });
    }

    return entries;
  }

  if (!isRecord(attributes)) return entries;

  const objectEntries = Object.entries(attributes);
  const numericKeysOnly = objectEntries.length > 0 && objectEntries.every(([name]) => /^\d+$/.test(name));
  if (numericKeysOnly && taxonomyAttributes.length > 0) {
    objectEntries.forEach(([index, value]) => {
      const definition = taxonomyAttributes[Number(index)];
      if (definition?.name) addEntry(definition.name, value);
    });
    return entries;
  }

  objectEntries.forEach(([name, value]) => addEntry(name, value));
  return entries;
};

const getAnnotationAttributeSources = (annotation: AnnotationWithAttributes | null | undefined) => {
  if (!annotation || typeof annotation !== 'object') return [];

  return ATTRIBUTE_SOURCE_KEYS
    .map((key) => annotation[key])
    .filter((value) => value !== null && value !== undefined);
};

export const isNoAttributeValue = (value: unknown) => (
  value !== null
  && value !== undefined
  && NO_ATTRIBUTE_VALUES.has(String(value).trim().toLowerCase())
);

/**
 * Return the non-empty attribute entries that should be shown on the canvas.
 * no-value entries are matched after trimming and case-folding, following the
 * visualization behavior in yolo_data_manager (`no`, `No`, `false`, `0`,
 * `normal`, and related empty values).
 */
export const getVisibleAnnotationAttributeEntries = (
  attributes: unknown,
  hideNo = false,
  taxonomyAttributes: AnnotationAttributeDefinition[] | null | undefined = [],
): AnnotationAttributeEntry[] => {
  const definitions = getAttributeDefinitions(taxonomyAttributes);
  const entries = collectAttributeEntries(attributes, definitions);

  return entries.filter(([name, value]) => {
    if (!name.trim() || !value.trim()) return false;
    return !(hideNo && isNoAttributeValue(value));
  });
};

export const getAnnotationAttributeEntries = (
  annotation: AnnotationWithAttributes | null | undefined,
  hideNo = false,
  taxonomyAttributes: AnnotationAttributeDefinition[] | null | undefined = [],
): AnnotationAttributeEntry[] => {
  const definitions = getAttributeDefinitions(taxonomyAttributes);
  const entries = getAnnotationAttributeSources(annotation).flatMap((source) => (
    collectAttributeEntries(source, definitions)
  ));
  const seen = new Set<string>();

  return entries.filter(([name, value]) => {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName || !value.trim() || seen.has(normalizedName)) return false;
    if (hideNo && isNoAttributeValue(value)) return false;
    seen.add(normalizedName);
    return true;
  });
};

export const hasAnnotationAttributeContent = (
  annotations: AnnotationWithAttributes[] | null | undefined,
  taxonomyAttributes: AnnotationAttributeDefinition[] | null | undefined = [],
) => annotations?.some((annotation) => (
  getAnnotationAttributeEntries(annotation, false, taxonomyAttributes).length > 0
)) ?? false;
