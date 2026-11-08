/**
 * Terrain edits: changes to the ground made during a Hole (Terrain Paint now,
 * Spawn Wall in ticket 21). They live in synced room state as a replayable
 * list, oldest first, so a client that joins or reconnects mid-Hole draws the
 * same terrain as everyone else. The list is emptied when a new Hole starts.
 *
 * Every edit has an `id` (increasing: later edits win where they overlap) and
 * an `expiresAt` (0 = lasts until the next Hole). Nothing in an edit says who
 * made it.
 */
import type { PointState } from "./state";

/** Surfaces the Admin can paint. */
export type PaintSurface = "ice" | "sand" | "water" | "void";
export const PAINT_SURFACES: readonly PaintSurface[] = ["ice", "sand", "water", "void"];

/**
 * A brush stroke: every point within `radius` of the polyline through
 * `points` (a chain of capsules) is `surface`. A single point is a disc.
 */
export interface PaintStrokeEdit {
  kind: "paint";
  id: number;
  surface: PaintSurface;
  /** Brush radius, px. */
  radius: number;
  /** The brush path, at least one point. Grows while the brush is down. */
  points: PointState[];
  /** Clock time (ms) the edit disappears at; 0 = stays until the next Hole. */
  expiresAt: number;
}

/**
 * A spawned wall (Spawn Wall): a straight segment from `points[0]` to
 * `points[1]` that balls bounce off, `radius` being half its thickness (its
 * ends are rounded). It has a physics body on the server.
 */
export interface WallEdit {
  kind: "wall";
  id: number;
  /** Exactly two points: the segment's ends. */
  points: [PointState, PointState];
  /** Half the wall's thickness, px. */
  radius: number;
  /** Clock time (ms) the wall vanishes at; 0 = stays until the next Hole. */
  expiresAt: number;
}

/** Every kind of terrain edit, told apart by `kind`. */
export type TerrainEdit = PaintStrokeEdit | WallEdit;

/** Whether a ball of `ballRadius` centred at p touches the wall. */
export function wallTouches(wall: WallEdit, p: PointState, ballRadius: number): boolean {
  const reach = wall.radius + ballRadius;
  return distanceToSegmentSq(p, wall.points[0], wall.points[1]) < reach * reach;
}

/** Squared distance from p to the segment a-b. */
export function distanceToSegmentSq(p: PointState, a: PointState, b: PointState): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return x * x + y * y;
}

/** Whether segment `i` of a stroke (points i..i+1, or the lone point) covers p. */
export function strokeSegmentCovers(stroke: PaintStrokeEdit, i: number, p: PointState): boolean {
  const a = stroke.points[i]!;
  const b = stroke.points[i + 1] ?? a;
  return distanceToSegmentSq(p, a, b) <= stroke.radius * stroke.radius;
}

/** Whether a brush stroke covers p. */
export function strokeCovers(stroke: PaintStrokeEdit, p: PointState): boolean {
  const segments = Math.max(1, stroke.points.length - 1);
  for (let i = 0; i < segments; i++) if (strokeSegmentCovers(stroke, i, p)) return true;
  return false;
}
