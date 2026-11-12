import type { Vec2 } from "../course";

const EPS = 1e-9;

export function polygonArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

/** True if segments ab and cd share any point (including touching ends). */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  if (Math.abs(d1) <= EPS && onSegment(a, b, c)) return true;
  if (Math.abs(d2) <= EPS && onSegment(a, b, d)) return true;
  if (Math.abs(d3) <= EPS && onSegment(c, d, a)) return true;
  if (Math.abs(d4) <= EPS && onSegment(c, d, b)) return true;
  return false;
}

/**
 * Why a polygon is unusable, or null if it is fine. Checks: at least 3
 * points, no repeated consecutive points, non-zero area, and no edge
 * crossing or touching a non-adjacent edge.
 */
export function polygonProblem(points: Vec2[]): string | null {
  const n = points.length;
  if (n < 3) return `has only ${n} point(s), needs at least 3`;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS) {
      return `has a repeated point at (${a.x}, ${a.y})`;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return `is self-intersecting (edges ${i + 1} and ${j + 1} cross)`;
      }
    }
  }
  if (Math.abs(polygonArea(points)) <= 1e-6) return "is degenerate (zero area)";
  return null;
}

/** Rotate points clockwise (on screen, y down) by `degrees` around `origin`. */
export function rotateAround(points: Vec2[], origin: Vec2, degrees: number): Vec2[] {
  if (!degrees) return points;
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return points.map((p) => {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
  });
}
