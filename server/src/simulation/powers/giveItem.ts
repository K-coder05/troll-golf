import { isItemId, ITEM_CATALOGUE } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";
import { everyone } from "../events";

/**
 * Give Item: put any Item in any Player's slot (the Admin's included),
 * replacing what they held. It does not hit anyone, so Shields, immunity and
 * the disabling cap are irrelevant: it always works.
 * - Stealth: only the recipient learns (their `item` message, no roulette).
 * - Loud: a feed line that doesn't say which Item; the pipeline adds the banner.
 */
export const giveItem: AdminPowerHandler<"giveItem"> = {
  id: "giveItem",
  phases: ["countdown", "playing", "holeEnd"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { targetId, item } = params as Record<string, unknown>;
    if (typeof targetId !== "string" || targetId === "" || !isItemId(item)) return null;
    return { targetId, item };
  },
  use(ctx, { targetId, item }, mode) {
    const target = ctx.state.players[targetId];
    if (!target) return { ok: false, reason: "unknown_target" };
    ctx.items.give(targetId, item);
    if (mode === "loud") {
      ctx.emit({ type: "feed", payload: { text: `👑 The Golf Gods gave ${target.name} a gift` }, audience: everyone });
    }
    return {
      ok: true,
      targetId,
      summary: `Gave ${target.name} ${ITEM_CATALOGUE[item].name}`,
      bannerDetail: `${target.name} got a gift`,
    };
  },
};
