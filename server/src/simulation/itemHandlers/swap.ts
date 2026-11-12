import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Swap: your ball and a random opponent's trade places. The opponent is drawn
 * with the injected Rng from those who can be targeted now (not Holed Out,
 * disconnected, immune, or waiting for the next Hole) and whose ball is free
 * to move (not Frozen, not held by Ball Grab). It goes through the single
 * attack path, so a Shield eats it (no swap, no Item Hit), a landed Swap is an
 * Item Hit and gives the opponent 3 s immunity. Each ball keeps its own
 * velocity; a resting ball's new place is its Rest Spot.
 * Refused, Item kept: after Holing Out, while Frozen yourself, or with nobody to swap with.
 */
export const swap: ItemHandler<"swap"> = {
  id: "swap",
  use(ctx) {
    const { user } = ctx;
    if (user.holedOut) return { ok: false, reason: "holed_out" };
    if (user.spectating) return { ok: false, reason: "spectating" };
    if (ctx.effects.find(user.id, "frozen")) return { ok: false, reason: "frozen" };
    if (!ctx.balls.canSwap(user.id)) return { ok: false, reason: "not_in_play" };
    const candidates = ctx.targets().filter((t) => ctx.balls.canSwap(t.id) && !ctx.effects.find(t.id, "frozen"));
    if (candidates.length === 0) return { ok: false, reason: "no_target" };
    const target = candidates[Math.min(candidates.length - 1, Math.floor(ctx.rng.next() * candidates.length))]!;
    const from = { x: user.ball.x, y: user.ball.y };
    const to = { x: target.ball.x, y: target.ball.y };
    ctx.emit({
      type: "fx",
      payload: { kind: "itemUse", item: "swap", x: from.x, y: from.y, fromX: to.x, fromY: to.y, targetId: target.id },
      audience: everyone,
    });
    const hit = ctx.hit(target.id, () => {
      ctx.balls.swap(user.id, target.id);
      ctx.emit({ type: "feed", payload: { text: `${user.name} swapped places with ${target.name}` }, audience: everyone });
    });
    if (hit.result === "missed") return { ok: false, reason: hit.reason };
    return {
      ok: true,
      targetId: target.id,
      summary:
        hit.result === "landed"
          ? `${user.name}: Swap with ${target.name}`
          : `${user.name}: Swap with ${target.name}, eaten by a Shield`,
    };
  },
};
