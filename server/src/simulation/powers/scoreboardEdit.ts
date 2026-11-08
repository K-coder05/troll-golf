import type { AdminPowerHandler } from "../admin";
import { everyone } from "../events";

/** The biggest change one Scoreboard Edit can make, either way. */
export const MAX_SCOREBOARD_EDIT = 20;

/**
 * Scoreboard Edit: add or remove Strokes on any Player (the Admin included),
 * on the current Hole or an earlier one. Strokes never go below 0.
 * - Stealth: the number just changes. Nothing is emitted, nothing attributed.
 * - Loud: a feed line naming the target (never the Admin); the pipeline adds the banner.
 */
export const scoreboardEdit: AdminPowerHandler<"scoreboardEdit"> = {
  id: "scoreboardEdit",
  // Not in the lobby: Strokes are reset when the game starts.
  phases: ["countdown", "playing", "holeEnd", "gameEnd"],
  parse(params) {
    if (typeof params !== "object" || params === null) return null;
    const { targetId, delta, holeIndex } = params as Record<string, unknown>;
    if (typeof targetId !== "string" || targetId === "") return null;
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) return null;
    if (Math.abs(delta) > MAX_SCOREBOARD_EDIT) return null;
    if (holeIndex !== undefined && (typeof holeIndex !== "number" || !Number.isInteger(holeIndex) || holeIndex < 0)) {
      return null;
    }
    return holeIndex === undefined ? { targetId, delta } : { targetId, delta, holeIndex };
  },
  use(ctx, { targetId, delta, holeIndex }, mode) {
    const { state } = ctx;
    const target = state.players[targetId];
    if (!target) return { ok: false, reason: "unknown_target" };
    const hole = holeIndex ?? state.holeIndex;
    if (hole > state.holeIndex || hole >= target.strokes.length) return { ok: false, reason: "invalid_payload" };

    const before = target.strokes[hole] ?? 0;
    const after = Math.max(0, before + delta);
    target.strokes[hole] = after;
    ctx.updateStandings();

    const change = after - before;
    const strokes = `${change >= 0 ? "+" : ""}${change} Stroke${Math.abs(change) === 1 ? "" : "s"}`;
    if (mode === "loud") {
      ctx.emit({ type: "feed", payload: { text: `👑 The Golf Gods gave ${target.name} ${strokes}` }, audience: everyone });
    }
    return {
      ok: true,
      targetId,
      summary: `${target.name} ${strokes} on Hole ${hole + 1} (${before} → ${after})`,
      bannerDetail: `${target.name}: ${strokes}`,
    };
  },
};

