import { CUP_MAX_RADIUS, CUP_MIN_RADIUS } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

/**
 * Cup Size: change the Cup's capture radius (the no-collision zone around it
 * follows). Stealth emits nothing: the Cup is simply a different size.
 */
export const cupSize: AdminPowerHandler<"cupSize"> = {
  id: "cupSize",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { radius } = params as Record<string, unknown>;
    if (typeof radius !== "number" || !Number.isFinite(radius)) return null;
    if (radius < CUP_MIN_RADIUS || radius > CUP_MAX_RADIUS) return null;
    return { radius };
  },
  use(ctx, { radius }) {
    const before = ctx.state.cup.radius;
    ctx.cup.resize(radius);
    return {
      ok: true,
      summary: `Cup radius ${Math.round(before)} -> ${Math.round(radius)} on Hole ${ctx.state.holeIndex + 1}`,
      bannerDetail: radius > before ? "The Cup has grown" : "The Cup has shrunk",
    };
  },
};
