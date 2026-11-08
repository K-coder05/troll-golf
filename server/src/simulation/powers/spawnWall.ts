import {
  WALL_DEFAULT_THICKNESS,
  WALL_MAX_DURATION_SEC,
  WALL_MAX_LENGTH,
  WALL_MAX_THICKNESS,
  WALL_MIN_LENGTH,
  WALL_MIN_THICKNESS,
  type Vec2,
} from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePoint(value: unknown): Vec2 | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  return finite(x) && finite(y) ? { x, y } : null;
}

/**
 * Spawn Wall: a wall segment balls bounce off, optionally vanishing after
 * `durationSec`. It is a terrain edit (synced to everyone, replayed for
 * reconnecting clients) and gets a physics body. Stealth emits nothing: the
 * wall just appears (edits carry no author). Loud adds the banner.
 */
export const spawnWall: AdminPowerHandler<"spawnWall"> = {
  id: "spawnWall",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const p = params as Record<string, unknown>;
    if (p.action === "clear") return { action: "clear" };
    if (p.action !== "spawn") return null;
    const a = parsePoint(p.a);
    const b = parsePoint(p.b);
    if (!a || !b) return null;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < WALL_MIN_LENGTH || length > WALL_MAX_LENGTH) return null;
    const { thickness, durationSec } = p;
    if (thickness !== undefined && (!finite(thickness) || thickness < WALL_MIN_THICKNESS || thickness > WALL_MAX_THICKNESS)) return null;
    if (durationSec !== undefined && (!finite(durationSec) || durationSec <= 0 || durationSec > WALL_MAX_DURATION_SEC)) return null;
    return {
      action: "spawn",
      a,
      b,
      ...(thickness !== undefined ? { thickness } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  },
  use(ctx, params) {
    if (params.action === "clear") {
      const count = ctx.walls.clear();
      return { ok: true, summary: `Removed ${count} spawned wall${count === 1 ? "" : "s"}`, bannerDetail: "The walls crumble" };
    }
    const { a, b, thickness = WALL_DEFAULT_THICKNESS, durationSec } = params;
    const spawned = ctx.walls.spawn(a, b, thickness, durationSec !== undefined ? durationSec * 1000 : undefined);
    if (!spawned.ok) return spawned;
    const lasting = durationSec !== undefined ? ` for ${durationSec} s` : "";
    return {
      ok: true,
      summary: `Spawned a wall (${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px)${lasting} on Hole ${ctx.state.holeIndex + 1}`,
      bannerDetail: "A wall rises",
    };
  },
};
