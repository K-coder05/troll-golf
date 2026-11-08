import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Shield: a bubble around your ball that absorbs the next attack Item, for up
 * to the Item's duration (30 s). Using another Shield refreshes it. Not after
 * Holing Out (a ball in the Cup can't be attacked anyway): the Item is kept.
 */
export const shield: ItemHandler<"shield"> = {
  id: "shield",
  use(ctx) {
    const { user, def } = ctx;
    if (user.holedOut) return { ok: false, reason: "holed_out" };
    if (user.spectating) return { ok: false, reason: "spectating" };
    ctx.effects.start("shielded", { sourceId: user.id, targetId: user.id, durationMs: def.durationMs });
    ctx.emit({
      type: "fx",
      payload: { kind: "itemUse", item: "shield", x: user.ball.x, y: user.ball.y, targetId: user.id },
      audience: everyone,
    });
    ctx.emit({ type: "feed", payload: { text: `${user.name} raised a Shield` }, audience: everyone });
    return { ok: true, targetId: user.id, summary: `${user.name}: Shield` };
  },
};
