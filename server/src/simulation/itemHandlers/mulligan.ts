import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Mulligan: your ball goes back, at rest, to where it was before your last
 * shot, and that Stroke plus every penalty since are refunded. Usable while
 * the ball is still rolling; not after Holing Out, and not before a shot
 * this Hole (the Item is kept in both cases).
 */
export const mulligan: ItemHandler<"mulligan"> = {
  id: "mulligan",
  use(ctx) {
    const { user, state } = ctx;
    if (user.holedOut) return { ok: false, reason: "holed_out" };
    if (user.spectating) return { ok: false, reason: "spectating" };
    const shot = ctx.balls.lastShot(user.id);
    if (!shot) return { ok: false, reason: "no_shot" };

    const before = user.strokes[state.holeIndex] ?? 0;
    const after = Math.max(0, before - (1 + shot.penalties));
    user.strokes[state.holeIndex] = after;
    const at = ctx.balls.placeAtRest(user.id, shot.from);
    ctx.balls.clearLastShot(user.id);
    ctx.updateStandings();

    const refunded = before - after;
    ctx.emit({ type: "fx", payload: { kind: "itemUse", item: "mulligan", x: at.x, y: at.y }, audience: everyone });
    ctx.emit({ type: "feed", payload: { text: `${user.name} took a Mulligan (-${refunded})` }, audience: everyone });
    return { ok: true, summary: `${user.name}: Mulligan, -${refunded} Stroke${refunded === 1 ? "" : "s"} on Hole ${state.holeIndex + 1}` };
  },
};
