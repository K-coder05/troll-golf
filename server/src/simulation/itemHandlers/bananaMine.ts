import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Banana Mine: drops a trap (`ctx.placeTrap`, a public sensor in state.traps,
 * 45 s) where the user's ball is. A Player who has Holed Out has no ball on
 * the Hole, so they click: `request.point` is the spot, which must lie on the
 * Hole and farther than `params.minCupRadii` cup-radii from the Cup. A bad
 * spot is refused (`bad_placement`) and the Item is kept.
 *
 * Triggering happens in the physics step (items.triggerTraps): the next ball
 * to touch it, the owner's included, gets a random-direction push from the
 * seeded Rng and the trap goes. An opponent's trigger is an attack through
 * applyItemHit (Shield eats it, immunity makes it harmless, a landed one is an
 * Item Hit for the owner); either way the trap is used up. The owner's own
 * trigger never counts as a hit.
 */
export const bananaMine: ItemHandler<"bananaMine"> = {
  id: "bananaMine",
  use(ctx) {
    const { user, def, state } = ctx;
    if (user.spectating) return { ok: false, reason: "spectating" };
    let at;
    if (user.holedOut) {
      const point = ctx.request.point;
      if (!point) return { ok: false, reason: "invalid_payload" };
      const { width, height } = ctx.balls.holeSize();
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return { ok: false, reason: "bad_placement" };
      const minDistance = (def.params.minCupRadii ?? 3) * state.cup.radius;
      if (Math.hypot(point.x - state.cup.x, point.y - state.cup.y) < minDistance) return { ok: false, reason: "bad_placement" };
      at = { x: point.x, y: point.y };
    } else {
      at = { x: user.ball.x, y: user.ball.y };
    }
    ctx.placeTrap(at);
    ctx.emit({ type: "fx", payload: { kind: "itemUse", item: "bananaMine", x: at.x, y: at.y }, audience: everyone });
    return { ok: true, summary: `${user.name}: Banana Mine laid` };
  },
};
