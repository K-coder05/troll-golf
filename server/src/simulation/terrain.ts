import { strokeSegmentCovers, type PaintStrokeEdit, type SurfaceKind, type TerrainEdit, type Vec2 } from "@troll-golf/shared";
import type { SurfaceMap } from "./surfaces";

/**
 * The terrain-edit layer over a Hole's own surfaces. It owns the Hole's list
 * of terrain edits (the very array in RoomState.terrainEdits, so what is
 * synced is what the simulation plays on) and answers the one surface
 * question the simulation asks, `at(point)`: the latest paint stroke covering
 * the point wins, else the course's own zones. Damping, the Sand power cut and
 * Water/Void all read it, so painted terrain behaves exactly like course
 * terrain.
 *
 * Lookups go through a coarse grid: each cell lists the stroke segments that
 * reach into it, so `at` tests only a handful of capsules however much has
 * been painted.
 *
 * Non-paint edits (ticket 21's walls) are kept in the list but ignored by
 * `at`; whoever adds them handles their physics.
 */
export interface Terrain extends SurfaceMap {
  /** The edits, oldest first. Mutated in place; RoomState.terrainEdits is this array. */
  readonly edits: TerrainEdit[];
  /** Total points over every edit (for the synced-state cap). */
  readonly pointCount: number;
  add(edit: TerrainEdit): void;
  /** Append points to a paint stroke already in the list. */
  extend(stroke: PaintStrokeEdit, points: readonly Vec2[]): void;
  /** Remove every edit matching `drop`; returns what was removed. */
  remove(drop: (edit: TerrainEdit) => boolean): TerrainEdit[];
}

/** Grid cell size, px. */
const CELL = 32;
/** Packs cell coordinates into one key (holes are far smaller than 2^20 cells across). */
const key = (cx: number, cy: number) => cx * 1_048_576 + cy;

interface SegmentRef {
  stroke: PaintStrokeEdit;
  /** Segment index: points i..i+1, or the lone point of a one-point stroke. */
  i: number;
}

export function createTerrain(base: SurfaceMap, edits: TerrainEdit[] = []): Terrain {
  const grid = new Map<number, SegmentRef[]>();
  let pointCount = 0;

  function index(stroke: PaintStrokeEdit, i: number): void {
    const a = stroke.points[i]!;
    const b = stroke.points[i + 1] ?? a;
    const r = stroke.radius;
    const x0 = Math.floor((Math.min(a.x, b.x) - r) / CELL);
    const x1 = Math.floor((Math.max(a.x, b.x) + r) / CELL);
    const y0 = Math.floor((Math.min(a.y, b.y) - r) / CELL);
    const y1 = Math.floor((Math.max(a.y, b.y) + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        const cell = grid.get(k);
        if (cell) cell.push({ stroke, i });
        else grid.set(k, [{ stroke, i }]);
      }
    }
  }

  function indexEdit(edit: TerrainEdit): void {
    pointCount += edit.points.length;
    if (edit.kind !== "paint") return;
    const segments = Math.max(1, edit.points.length - 1);
    for (let i = 0; i < segments; i++) index(edit, i);
  }

  function rebuild(): void {
    grid.clear();
    pointCount = 0;
    for (const edit of edits) indexEdit(edit);
  }
  rebuild();

  return {
    edits,
    get pointCount() {
      return pointCount;
    },
    at(point): SurfaceKind {
      const cell = grid.get(key(Math.floor(point.x / CELL), Math.floor(point.y / CELL)));
      let best: PaintStrokeEdit | null = null;
      if (cell) {
        for (const ref of cell) {
          if (best && ref.stroke.id <= best.id) continue;
          if (strokeSegmentCovers(ref.stroke, ref.i, point)) best = ref.stroke;
        }
      }
      return best ? best.surface : base.at(point);
    },
    add(edit) {
      edits.push(edit);
      indexEdit(edit);
    },
    extend(stroke, points) {
      for (const p of points) {
        stroke.points.push({ x: p.x, y: p.y });
        pointCount++;
        // The first new segment joins the old last point (a lone point was indexed as a disc; the segment covers it).
        index(stroke, stroke.points.length - 2);
      }
    },
    remove(drop) {
      const removed: TerrainEdit[] = [];
      const kept: TerrainEdit[] = [];
      for (const edit of edits) (drop(edit) ? removed : kept).push(edit);
      if (removed.length === 0) return removed;
      edits.length = 0;
      edits.push(...kept);
      rebuild();
      return removed;
    },
  };
}
