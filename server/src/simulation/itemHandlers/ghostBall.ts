import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Ghost Ball: arms the Ghost Ball Effect on your ball. Your next shot passes
 * through walls and moving obstacles (not the Hole's edge, not hazards: Water
 * and Void still get it; other balls still collide with it). The Effect
 * clears when that shot comes to rest. Not after Holing Out; a second use
 * while armed is refused and the Item kept.
 */
export const ghostBall: ItemHandler<"ghostBall"> = {
  id: "ghostBall",
  use(ctx) {
    const { user, def } = ctx;
    if (user.holedOut) return { ok: false, reason: "holed_out" };
    if (user.spectating) return { ok: false, reason: "spectating" };
    if (ctx.effects.find(user.id, "ghostBall")) return { ok: false, reason: "already_active" };
    ctx.effects.start("ghostBall", { sourceId: user.id, targetId: user.id, durationMs: def.durationMs, scaled: false });
    ctx.emit({ type: "fx", payload: { kind: "itemUse", item: "ghostBall", x: user.ball.x, y: user.ball.y, targetId: user.id }, audience: everyone });
    ctx.emit({ type: "feed", payload: { text: `${user.name} turned into a Ghost Ball` }, audience: everyone });
    return { ok: true, targetId: user.id, summary: `${user.name}: Ghost Ball` };
  },
};
