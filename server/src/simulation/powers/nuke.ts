import type { AdminPowerHandler } from "../admin";

/**
 * Nuke: the Admin picks an impact point. Everyone gets a 3 s siren and red
 * flash, then a white-out, screen shake and a blast that pushes every ball
 * outward; then the aftermath, Wipe (default) or Reset (see game.ts `nukeControl`).
 *
 * A Nuke is spectacular in both modes: the fx are the same in Stealth and
 * Loud, and none of them names the Admin. Loud only adds the Golf Gods banner
 * (added by the pipeline). The sequence is timed by the simulation's clock,
 * not by any client.
 */
export const nuke: AdminPowerHandler<"nuke"> = {
  id: "nuke",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { x, y, aftermath } = params as Record<string, unknown>;
    if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) return null;
    if (aftermath === undefined) return { x, y };
    return aftermath === "wipe" || aftermath === "reset" ? { x, y, aftermath } : null;
  },
  use(ctx, { x, y, aftermath = "wipe" }) {
    const launched = ctx.nukes.launch(x, y, aftermath);
    if (!launched.ok) return launched;
    return {
      ok: true,
      summary: `Nuke (${aftermath}) at (${Math.round(x)}, ${Math.round(y)}) on Hole ${ctx.state.holeIndex + 1}`,
      bannerDetail: "A nuke is incoming",
    };
  },
};
