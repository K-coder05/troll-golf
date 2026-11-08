import type { AdminPowerHandler } from "../admin";

/**
 * Lip-Out: the chosen Player's next would-be hole-out pops back out, once.
 * Using it emits nothing in Stealth (the lip-out itself is a normal `lipOut`
 * fx when it happens); the pending flag lives only in the simulation.
 */
export const lipOut: AdminPowerHandler<"lipOut"> = {
  id: "lipOut",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { targetId } = params as Record<string, unknown>;
    return typeof targetId === "string" && targetId !== "" ? { targetId } : null;
  },
  use(ctx, { targetId }) {
    const armed = ctx.cup.armLipOut(targetId);
    if (!armed.ok) return armed;
    return {
      ok: true,
      targetId,
      summary: `Lip-Out armed for ${armed.name} on Hole ${ctx.state.holeIndex + 1}`,
      bannerDetail: `${armed.name}: lip-out incoming`,
    };
  },
};
