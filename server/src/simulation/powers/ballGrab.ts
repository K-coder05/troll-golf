import { MAX_THROW_SPEED } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";
import { everyone } from "../events";

/**
 * Ball Grab: the Admin picks up any ball in play, drags it anywhere (into the
 * Cup, the Water, back to the Tee) and lets go, at rest or with a throw.
 *
 * - Stealth: the ball just moves. No event, no flag: to everyone else it is a
 *   ball that went somewhere (the held ball reads as moving and can't be shot,
 *   like any rolling ball).
 * - Loud: a `grab` effect at pick-up and put-down; the pipeline adds the banner.
 *
 * Only `grab` is a logged use; `move` and `release` are quiet continuations.
 * After release, normal rules apply (see game.ts `ballControl`).
 */
export const ballGrab: AdminPowerHandler<"ballGrab"> = {
  id: "ballGrab",
  // Balls only exist on the course while a Hole is being played.
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const p = params as Record<string, unknown>;
    const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    switch (p.action) {
      case "grab":
        return typeof p.targetId === "string" && p.targetId !== "" ? { action: "grab", targetId: p.targetId } : null;
      case "move":
        return finite(p.x) && finite(p.y) ? { action: "move", x: p.x, y: p.y } : null;
      case "release": {
        if (!finite(p.x) || !finite(p.y)) return null;
        if (p.vx === undefined && p.vy === undefined) return { action: "release", x: p.x, y: p.y };
        if (!finite(p.vx) || !finite(p.vy)) return null;
        return { action: "release", x: p.x, y: p.y, vx: p.vx, vy: p.vy };
      }
      default:
        return null;
    }
  },
  use(ctx, params, mode) {
    const { balls } = ctx;
    switch (params.action) {
      case "grab": {
        if (!ctx.state.players[params.targetId]) return { ok: false, reason: "unknown_target" };
        const grabbed = balls.grab(params.targetId, mode);
        if (!grabbed.ok) return grabbed;
        if (mode === "loud") {
          ctx.emit({ type: "fx", payload: { kind: "grab", x: grabbed.at.x, y: grabbed.at.y }, audience: everyone });
        }
        return {
          ok: true,
          targetId: params.targetId,
          summary: `Grabbed ${grabbed.name}'s ball on Hole ${ctx.state.holeIndex + 1}`,
          bannerDetail: `${grabbed.name}'s ball was picked up`,
        };
      }
      case "move":
        return balls.move(params.x, params.y) ? { ok: true, quiet: true, summary: "" } : { ok: false, reason: "not_holding" };
      case "release": {
        const held = balls.held;
        if (!held) return { ok: false, reason: "not_holding" };
        let velocity;
        if (params.vx !== undefined && params.vy !== undefined) {
          const speed = Math.hypot(params.vx, params.vy);
          const k = speed > MAX_THROW_SPEED ? MAX_THROW_SPEED / speed : 1;
          velocity = { x: params.vx * k, y: params.vy * k };
        }
        balls.release(params.x, params.y, velocity);
        if (held.mode === "loud") {
          const ball = ctx.state.players[held.id]!.ball;
          ctx.emit({ type: "fx", payload: { kind: "grab", x: ball.x, y: ball.y }, audience: everyone });
        }
        return { ok: true, quiet: true, summary: "" };
      }
    }
  },
};
