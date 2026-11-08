import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Cup Magnet: arms the Cup Magnet Effect on your ball. Your next shot curves
 * toward the Cup (a steady pull while it rolls, `params.pull` px/s^2); the
 * Effect clears when that shot comes to rest. Not after Holing Out; a second
 * use while armed is refused and the Item kept.
 */
export const cupMagnet: ItemHandler<"cupMagnet"> = {
  id: "cupMagnet",
  use(ctx) {
    const { user, def } = ctx;
    if (user.holedOut) return { ok: false, reason: "holed_out" };
    if (user.spectating) return { ok: false, reason: "spectating" };
    if (ctx.effects.find(user.id, "cupMagnet")) return { ok: false, reason: "already_active" };
    ctx.effects.start("cupMagnet", {
      sourceId: user.id,
      targetId: user.id,
      durationMs: def.durationMs,
      scaled: false,
      data: { pull: def.params.pull ?? 0 },
    });
    ctx.emit({ type: "fx", payload: { kind: "itemUse", item: "cupMagnet", x: user.ball.x, y: user.ball.y, targetId: user.id }, audience: everyone });
    ctx.emit({ type: "feed", payload: { text: `${user.name} switched on a Cup Magnet` }, audience: everyone });
    return { ok: true, targetId: user.id, summary: `${user.name}: Cup Magnet` };
  },
};
