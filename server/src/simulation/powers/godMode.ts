import type { AdminPowerHandler } from "../admin";

/**
 * God Mode: while on, every Item attack on the Admin is turned away inside
 * the Item Hit path (items.ts applyItemHit): no effect, no immunity, not an
 * Item Hit. Stealth looks exactly like a Shield pop; Loud is a divine block.
 * The toggle itself emits nothing (the pipeline adds the Loud banner). It
 * stays on until toggled off or the Admin leaves.
 */
export const godMode: AdminPowerHandler<"godMode"> = {
  id: "godMode",
  phases: ["countdown", "playing", "holeEnd", "gameEnd"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { enabled } = params as Record<string, unknown>;
    return typeof enabled === "boolean" ? { enabled } : null;
  },
  use(ctx, { enabled }, mode) {
    ctx.items.setGodMode(enabled, mode);
    return {
      ok: true,
      targetId: ctx.adminId,
      summary: `God Mode ${enabled ? "on" : "off"}`,
      bannerDetail: enabled ? "Divine protection" : "Protection lifted",
    };
  },
};
