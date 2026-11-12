import { isItemId, ITEM_CATALOGUE } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

/**
 * Rig the Box: the Player's next Item Box gives exactly the chosen Item. The
 * draw still happens (same Rng rolls, same roulette, same events); only its
 * result is replaced, so a rigged pickup cannot be told from a natural one.
 * Nothing is emitted in either mode beyond the Loud banner.
 */
export const rigBox: AdminPowerHandler<"rigBox"> = {
  id: "rigBox",
  phases: ["countdown", "playing", "holeEnd"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { targetId, item } = params as Record<string, unknown>;
    if (typeof targetId !== "string" || targetId === "" || !isItemId(item)) return null;
    return { targetId, item };
  },
  use(ctx, { targetId, item }) {
    const target = ctx.state.players[targetId];
    if (!target) return { ok: false, reason: "unknown_target" };
    ctx.items.rig(targetId, item);
    return {
      ok: true,
      targetId,
      summary: `Rigged ${target.name}'s next Item Box to ${ITEM_CATALOGUE[item].name}`,
      bannerDetail: `${target.name}: next box rigged`,
    };
  },
};
