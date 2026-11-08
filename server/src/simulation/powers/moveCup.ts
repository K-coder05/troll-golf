import { CUP_SLIDE_MAX_SPEED, CUP_SLIDE_MAX_TRIGGER, CUP_SLIDE_MIN_TRIGGER, CUP_SLIDE_SPEED, CUP_SLIDE_TRIGGER } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Move the Cup: teleport it, or have it slide away from balls that come close.
 * Stealth is just "the Cup is somewhere else": no events at all. Loud adds
 * only the Golf Gods banner (from the pipeline).
 */
export const moveCup: AdminPowerHandler<"moveCup"> = {
  id: "moveCup",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const p = params as Record<string, unknown>;
    if (p.mode === "teleport") return finite(p.x) && finite(p.y) ? { mode: "teleport", x: p.x, y: p.y } : null;
    if (p.mode === "slide") {
      const { triggerDistance, speed } = p;
      if (triggerDistance !== undefined && (!finite(triggerDistance) || triggerDistance < CUP_SLIDE_MIN_TRIGGER || triggerDistance > CUP_SLIDE_MAX_TRIGGER)) return null;
      if (speed !== undefined && (!finite(speed) || speed <= 0 || speed > CUP_SLIDE_MAX_SPEED)) return null;
      return {
        mode: "slide",
        ...(triggerDistance !== undefined ? { triggerDistance } : {}),
        ...(speed !== undefined ? { speed } : {}),
      };
    }
    return null;
  },
  use(ctx, params) {
    if (params.mode === "teleport") {
      const moved = ctx.cup.teleport(params.x, params.y);
      if (!moved.ok) return moved;
      return {
        ok: true,
        summary: `Cup teleported to (${Math.round(params.x)}, ${Math.round(params.y)}) on Hole ${ctx.state.holeIndex + 1}`,
        bannerDetail: "The Cup has moved",
      };
    }
    const trigger = params.triggerDistance ?? CUP_SLIDE_TRIGGER;
    const speed = params.speed ?? CUP_SLIDE_SPEED;
    ctx.cup.slide(trigger, speed);
    return {
      ok: true,
      summary: `Cup set to slide away (trigger ${Math.round(trigger)} px, ${Math.round(speed)} px/s) on Hole ${ctx.state.holeIndex + 1}`,
      bannerDetail: "The Cup is running away",
    };
  },
};
