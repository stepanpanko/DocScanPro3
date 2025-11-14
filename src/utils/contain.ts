// Geometry utilities for image cropping and containment

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Calculate a contain rect that fits imgW×imgH into boxW×boxH
 * Returns the position and size in the preview coordinate system
 */
export function getContainRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): Rect {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  const x = (boxW - width) / 2;
  const y = (boxH - height) / 2;
  return { x, y, width, height };
}

/**
 * Map a normalized point [0,1] relative to image to preview coordinates
 */
export function mapNormToPreview(
  normPoint: { x: number; y: number },
  containRect: Rect,
): { x: number; y: number } {
  'worklet';
  return {
    x: containRect.x + normPoint.x * containRect.width,
    y: containRect.y + normPoint.y * containRect.height,
  };
}

/**
 * Map a preview coordinate to normalized [0,1] relative to image
 */
export function mapPreviewToNorm(
  previewPoint: { x: number; y: number },
  containRect: Rect,
): { x: number; y: number } {
  'worklet';
  return {
    x: (previewPoint.x - containRect.x) / containRect.width,
    y: (previewPoint.y - containRect.y) / containRect.height,
  };
}

/**
 * Clamp a point to the image bounds [0,1]
 */
export function clampNormPoint(point: { x: number; y: number }): {
  x: number;
  y: number;
} {
  'worklet';
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

/**
 * Calculate distance between two points
 */
export function distance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  'worklet';
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Project point onto line segment
 * Returns the projected point and whether it's within the segment bounds
 */
export function projectToLineSegment(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): { point: { x: number; y: number }; withinBounds: boolean } {
  'worklet';
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return { point: lineStart, withinBounds: true };
  }

  const t =
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / len2;
  const withinBounds = t >= 0 && t <= 1;

  const clampedT = Math.max(0, Math.min(1, t));
  return {
    point: {
      x: lineStart.x + clampedT * dx,
      y: lineStart.y + clampedT * dy,
    },
    withinBounds,
  };
}

/**
 * Project point onto line segment (legacy function for compatibility)
 */
export function projectToLine(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): { x: number; y: number } {
  return projectToLineSegment(point, lineStart, lineEnd).point;
}

/**
 * Calculate polygon area (for validity checks)
 */
export function polygonArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const pi = points[i];
    const pj = points[j];
    if (!pi || !pj) continue;
    area += pi.x * pj.y;
    area -= pj.x * pi.y;
  }
  return Math.abs(area) / 2;
}

