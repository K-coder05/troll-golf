import { BALL_RADIUS, type PlayerState } from "@troll-golf/shared";
import { everyone } from "../events";
import type { ItemContext, ItemHandler } from "../items";

/**
 * Golf Gun: the first use arms it (the client's cursor becomes a crosshair),
 * with `params.shots` shots until `durationMs` runs out; the Item stays held.
 * Each later use is a shot, aimed with `point` (the click, hit-tested against
 * opponents' balls within `params.aimTolerance`) or a picked `targetId`. A
 * shot at nothing is a miss but still spends the shot. A shot that reaches a
 * ball goes through `ctx.hit` (Shield, immunity, Item Hit, kill feed), and
 * pushes it at `params.pushSpeed` along the line from the shooter's ball (or
 * the Cup, once the shooter has Holed Out) to the target. The pipeline uses
 * the Item up when the time is out (`expireActive`) or the last shot is spent.
 */
export const golfGun: ItemHandler<"golfGun"> = {
  id: "golfGun",
  use(ctx) {
    const { user, def } = ctx;
    const shots = def.params.shots ?? 3;
    if (!ctx.active) {
      if (user.spectating) return { ok: false, reason: "spectating" };
      ctx.setActive({ until: ctx.now() + ctx.scaleDuration(def.durationMs), shotsLeft: shots });
      return { ok: true, keep: true, summary: `${user.name}: Golf Gun armed` };
    }

    const { request } = ctx;
    if (request.targetId === undefined && !request.point) return { ok: false, reason: "invalid_payload" };
    const origin = user.holedOut ? ctx.balls.cupPosition() : { x: user.ball.x, y: user.ball.y };
    const target = request.targetId !== undefined ? picked(ctx, request.targetId) : aimedAt(ctx);
    const aim = target ? { x: target.ball.x, y: target.ball.y } : (request.point ?? origin);

    const shotsLeft = ctx.active.shotsLeft - 1;
    const keep = shotsLeft > 0;
    ctx.setActive(keep ? { until: ctx.active.until, shotsLeft } : null);

    let landed = false;
    let result = "missed";
    if (target) {
      const hit = ctx.hit(target.id, () => {
        landed = true;
        const dx = target.ball.x - origin.x;
        const dy = target.ball.y - origin.y;
        const length = Math.hypot(dx, dy);
        // Straight away from the shooter; a point-blank overlap pushes along +x instead.
        const speed = def.params.pushSpeed ?? 700;
        const push = length > 1e-6 ? { x: (dx / length) * speed, y: (dy / length) * speed } : { x: speed, y: 0 };
        ctx.balls.push(target.id, push, user.name);
        ctx.emit({ type: "feed", payload: { text: `${user.name} shot ${target.name}` }, audience: everyone });
      });
      result = hit.result;
    }
    ctx.emit({
      type: "fx",
      payload: {
        kind: "itemUse",
        item: "golfGun",
        x: aim.x,
        y: aim.y,
        fromX: origin.x,
        fromY: origin.y,
        hit: landed,
        ...(target ? { targetId: target.id } : {}),
      },
      audience: everyone,
    });
    return {
      ok: true,
      keep,
      ...(target ? { targetId: target.id } : {}),
      summary: `${user.name}: Golf Gun shot ${result}${target ? ` at ${target.name}` : ""}`,
    };
  },
};

/** A shot is aimed at a ball that is in play (it may still be immune or Shielded: the shot is spent either way). */
function inPlay(p: PlayerState, userId: string): boolean {
  return p.id !== userId && p.connected && !p.holedOut && !p.spectating;
}

function picked(ctx: ItemContext, id: string): PlayerState | undefined {
  const p = ctx.state.players[id];
  return p && inPlay(p, ctx.user.id) ? p : undefined;
}

/** The nearest opponent ball within the aim tolerance of the click. */
function aimedAt(ctx: ItemContext): PlayerState | undefined {
  const point = ctx.request.point!;
  const reach = (ctx.def.params.aimTolerance ?? 4 * BALL_RADIUS) + BALL_RADIUS;
  let best: PlayerState | undefined;
  let bestDistance = reach;
  for (const p of Object.values(ctx.state.players)) {
    if (!inPlay(p, ctx.user.id)) continue;
    const d = Math.hypot(p.ball.x - point.x, p.ball.y - point.y);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}
