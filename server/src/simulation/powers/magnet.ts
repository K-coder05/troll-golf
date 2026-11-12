import type { MagnetPolarity } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

const POLARITIES: readonly MagnetPolarity[] = ["attract", "repel", "off"];

/**
 * Magnet/Repel: the Cup pulls or pushes rolling balls (a steady acceleration,
 * so paths curve). `toggle` is the master switch; `set` chooses attract,
 * repel or off for one Player. Stealth emits nothing: a subtle physical
 * force. Loud adds the Golf Gods banner. State is server-only and resets at
 * the next Hole.
 */
export const magnet: AdminPowerHandler<"magnet"> = {
  id: "magnet",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const p = params as Record<string, unknown>;
    if (p.action === "toggle") return typeof p.enabled === "boolean" ? { action: "toggle", enabled: p.enabled } : null;
    if (p.action === "set") {
      if (typeof p.targetId !== "string" || !POLARITIES.includes(p.polarity as MagnetPolarity)) return null;
      return { action: "set", targetId: p.targetId, polarity: p.polarity as MagnetPolarity };
    }
    return null;
  },
  use(ctx, params) {
    if (params.action === "toggle") {
      ctx.magnet.setEnabled(params.enabled);
      return {
        ok: true,
        summary: `Magnet ${params.enabled ? "on" : "off"}`,
        bannerDetail: params.enabled ? "The Cup stirs" : "The Cup settles",
      };
    }
    const set = ctx.magnet.setPolarity(params.targetId, params.polarity);
    if (!set.ok) return set;
    return {
      ok: true,
      targetId: params.targetId,
      summary: `Magnet: ${set.name} ${params.polarity === "off" ? "unaffected" : params.polarity === "attract" ? "attracted" : "repelled"}`,
      bannerDetail: `${set.name}: ${params.polarity}`,
    };
  },
};
