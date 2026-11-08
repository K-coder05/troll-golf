import {
  PAINT_MAX_DURATION_SEC,
  PAINT_MAX_POINTS_PER_MESSAGE,
  PAINT_MAX_RADIUS,
  PAINT_MIN_RADIUS,
  PAINT_SURFACES,
  type PaintSurface,
  type Vec2,
} from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePoints(value: unknown): Vec2[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > PAINT_MAX_POINTS_PER_MESSAGE) return null;
  const points: Vec2[] = [];
  for (const p of value) {
    if (typeof p !== "object" || p === null) return null;
    const { x, y } = p as Record<string, unknown>;
    if (!finite(x) || !finite(y)) return null;
    points.push({ x, y });
  }
  return points;
}

const BANNER: Record<PaintSurface, string> = {
  ice: "The course has frozen over",
  sand: "The desert spreads",
  water: "The waters rise",
  void: "The ground opens up",
};

/**
 * Terrain Paint: brush Ice, Sand, Water or Void onto the Hole. Only putting
 * the brush down (`stroke`) is a logged use with the Loud banner; `extend`
 * carries the same stroke on, quietly. Stealth emits nothing: the ground just
 * is different (painted terrain is synced to everyone and never says who
 * painted it). A ball that ends up in painted Water or Void sinks like in any
 * other hazard, with the ordinary splash.
 */
export const terrainPaint: AdminPowerHandler<"terrainPaint"> = {
  id: "terrainPaint",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const p = params as Record<string, unknown>;
    if (p.action === "clear") return { action: "clear" };
    if (p.action === "extend") {
      const points = parsePoints(p.points);
      return points ? { action: "extend", points } : null;
    }
    if (p.action !== "stroke") return null;
    const { surface, radius, durationSec } = p;
    if (!PAINT_SURFACES.includes(surface as PaintSurface)) return null;
    if (!finite(radius) || radius < PAINT_MIN_RADIUS || radius > PAINT_MAX_RADIUS) return null;
    if (durationSec !== undefined && (!finite(durationSec) || durationSec <= 0 || durationSec > PAINT_MAX_DURATION_SEC)) return null;
    const points = parsePoints(p.points);
    if (!points) return null;
    return {
      action: "stroke",
      surface: surface as PaintSurface,
      radius,
      points,
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  },
  use(ctx, params) {
    const hole = `Hole ${ctx.state.holeIndex + 1}`;
    if (params.action === "extend") {
      const extended = ctx.terrain.extend(params.points);
      return extended.ok ? { ok: true, summary: "", quiet: true } : extended;
    }
    if (params.action === "clear") {
      const count = ctx.terrain.clear();
      return { ok: true, summary: `Cleared ${count} painted stroke${count === 1 ? "" : "s"} on ${hole}`, bannerDetail: "The course is restored" };
    }
    const { surface, radius, points, durationSec } = params;
    const painted = ctx.terrain.paint(surface, radius, points, durationSec !== undefined ? durationSec * 1000 : undefined);
    if (!painted.ok) return painted;
    const lasting = durationSec !== undefined ? ` for ${durationSec} s` : "";
    return {
      ok: true,
      summary: `Painted ${surface} (brush ${Math.round(radius)} px)${lasting} on ${hole}`,
      bannerDetail: BANNER[surface],
    };
  },
};
