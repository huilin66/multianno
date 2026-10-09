export interface AnnotationPoint {
  x: number;
  y: number;
}

interface HitTestOptions {
  tolerance?: number;
  hiddenClasses?: Iterable<string>;
  hiddenAnnotations?: Iterable<string>;
}

const isPoint = (value: any): value is AnnotationPoint => (
  value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
);

const getPoints = (annotation: any): AnnotationPoint[] => (
  Array.isArray(annotation?.points) ? annotation.points.filter(isPoint) : []
);

const pointInPolygon = (x: number, y: number, points: AnnotationPoint[]) => {
  if (points.length < 3) return false;

  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    const crossesScanline = (currentPoint.y > y) !== (previousPoint.y > y);
    if (!crossesScanline) continue;

    const intersectionX = (
      (previousPoint.x - currentPoint.x) * (y - currentPoint.y)
      / (previousPoint.y - currentPoint.y)
    ) + currentPoint.x;
    if (x < intersectionX) inside = !inside;
  }
  return inside;
};

const distanceToSegment = (x: number, y: number, start: AnnotationPoint, end: AnnotationPoint) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - start.x, y - start.y);

  const projection = Math.max(
    0,
    Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared),
  );
  return Math.hypot(x - (start.x + projection * dx), y - (start.y + projection * dy));
};

const distanceToPolyline = (x: number, y: number, points: AnnotationPoint[], tolerance: number) => (
  points.some((point, index) => (
    index < points.length - 1
    && distanceToSegment(x, y, point, points[index + 1]) <= tolerance
  ))
);

const pointInPolygonWithHoles = (
  x: number,
  y: number,
  points: AnnotationPoint[],
  holes: AnnotationPoint[][] = [],
  tolerance = 0,
) => {
  if (points.length < 3) return false;
  if (distanceToPolyline(x, y, [...points, points[0]], tolerance)) return true;
  if (!pointInPolygon(x, y, points)) return false;

  // The renderer fills polygon holes with the even-odd rule. A point inside
  // a hole must therefore not select the parent polygon.
  return !holes.some((hole) => (
    hole.length >= 3
    && !distanceToPolyline(x, y, [...hole, hole[0]], tolerance)
    && pointInPolygon(x, y, hole)
  ));
};

const getRotatedBoxPoints = (points: AnnotationPoint[]) => {
  const [first, second, third] = points;
  if (!first || !second) return [];
  if (!third) return [first, second];

  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [first, second, second, first];

  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = (third.x - first.x) * normalX + (third.y - first.y) * normalY;
  return [
    first,
    second,
    { x: second.x + offset * normalX, y: second.y + offset * normalY },
    { x: first.x + offset * normalX, y: first.y + offset * normalY },
  ];
};

const getCuboidFaces = (points: AnnotationPoint[]) => {
  const [first, second, depthPoint] = points;
  if (!first || !second) return [] as AnnotationPoint[][];

  const frontTopLeft = { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y) };
  const frontBottomRight = { x: Math.max(first.x, second.x), y: Math.max(first.y, second.y) };
  const frontTopRight = { x: frontBottomRight.x, y: frontTopLeft.y };
  const frontBottomLeft = { x: frontTopLeft.x, y: frontBottomRight.y };
  const front = [frontTopLeft, frontTopRight, frontBottomRight, frontBottomLeft];
  if (!depthPoint) return [front];

  const offsetX = depthPoint.x - frontTopLeft.x;
  const offsetY = depthPoint.y - frontTopLeft.y;
  const back = front.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
  return [front, back];
};

const isWithinBounds = (x: number, y: number, points: AnnotationPoint[]) => {
  if (points.length < 2) return false;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return (
    x >= Math.min(...xs)
    && x <= Math.max(...xs)
    && y >= Math.min(...ys)
    && y <= Math.max(...ys)
  );
};

/**
 * Use the same geometry hit rules in the main canvas and the Track ID canvas.
 * The drawing editor intentionally treats ellipse/circle as their editable
 * bounding box, matching the main editor's selection behavior.
 */
export const annotationContainsPoint = (
  annotation: any,
  x: number,
  y: number,
  tolerance = 6,
) => {
  const points = getPoints(annotation);
  if (points.length === 0) return false;

  switch (annotation.type) {
    case 'bbox':
    case 'ellipse':
    case 'circle':
      return isWithinBounds(x, y, points);
    case 'polygon':
      return pointInPolygonWithHoles(
        x,
        y,
        points,
        Array.isArray(annotation.holes)
          ? annotation.holes.map((hole: any) => (
            Array.isArray(hole) ? hole.filter(isPoint) : []
          ))
          : [],
        tolerance,
      );
    case 'oriented_bbox':
    case 'rbbox': {
      const rotatedBox = getRotatedBoxPoints(points);
      return pointInPolygonWithHoles(x, y, rotatedBox, [], tolerance);
    }
    case 'cuboid': {
      const faces = getCuboidFaces(points);
      if (faces.some((face) => pointInPolygonWithHoles(x, y, face, [], tolerance))) return true;

      const edges = faces.flatMap((face) => (
        face.map((point, index) => [point, face[(index + 1) % face.length]] as [AnnotationPoint, AnnotationPoint])
      ));
      if (faces.length === 2) {
        faces[0].forEach((point, index) => {
          edges.push([point, faces[1][index]]);
        });
      }
      return edges.some(([start, end]) => distanceToSegment(x, y, start, end) <= tolerance);
    }
    case 'line':
      return distanceToPolyline(x, y, points, tolerance);
    case 'point':
      return Math.hypot(x - points[0].x, y - points[0].y) <= tolerance;
    default:
      return isWithinBounds(x, y, points);
  }
};

export const findAnnotationIdsAtPoint = (
  annotations: any[],
  x: number,
  y: number,
  options: HitTestOptions = {},
) => {
  const hiddenClasses = new Set(options.hiddenClasses || []);
  const hiddenAnnotations = new Set(Array.from(options.hiddenAnnotations || [], (id) => String(id)));
  const tolerance = Number.isFinite(options.tolerance) ? Number(options.tolerance) : 6;
  const hitIds: string[] = [];

  // Reverse order matches the renderer's top-most-object selection behavior.
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if (!annotation || hiddenClasses.has(annotation.label) || hiddenAnnotations.has(String(annotation.id))) continue;
    if (annotationContainsPoint(annotation, x, y, tolerance)) hitIds.push(String(annotation.id));
  }
  return hitIds;
};

export const findTopmostAnnotationAtPoint = (
  annotations: any[],
  x: number,
  y: number,
  options: HitTestOptions = {},
) => {
  const hitIds = findAnnotationIdsAtPoint(annotations, x, y, options);
  if (hitIds.length === 0) return null;
  const targetId = hitIds[0];
  return annotations.find((annotation) => String(annotation?.id) === targetId) || null;
};
