import { INVERT_DEFAULT_SEC, INVERT_MAX_SEC } from "@troll-golf/shared";
import type { AdminPowerHandler } from "../admin";

/**
 * Invert Controls: for a while the target's shots go the opposite way to
 * their drag (the flip is applied by the server in `shoot`, whatever the
 * client does). Started directly on the Effects engine, so Shields,
 * immunity and the disabling cap don't apply. Stealth: a hidden Effect, no
 * badge and no event for anyone (the target's aim line still shows their
 * drag, so they just miss). Loud: a visible badge and the Golf Gods banner.
 */
export const invertControls: AdminPowerHandler<"invertControls"> = {
  id: "invertControls",
  phases: ["playing"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { targetId, durationSec } = params as Record<string, unknown>;
    if (typeof targetId !== "string") return null;
    if (durationSec !== undefined && (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > INVERT_MAX_SEC)) {
      return null;
    }
    return { targetId, ...(durationSec !== undefined ? { durationSec } : {}) };
  },
  use(ctx, { targetId, durationSec = INVERT_DEFAULT_SEC }, mode) {
    const started = ctx.effects.invertControls(targetId, durationSec * 1000, mode === "stealth");
    if (!started.ok) return started;
    return {
      ok: true,
      targetId,
      summary: `Inverted ${started.name}'s controls for ${durationSec} s`,
      bannerDetail: `${started.name}: controls inverted`,
    };
  },
};
