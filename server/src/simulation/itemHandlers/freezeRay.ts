import { everyone } from "../events";
import type { ItemHandler } from "../items";

/**
 * Freeze Ray: the target's ball stops dead in ice for the Item's duration
 * (6 s) and they can't shoot; mashing click breaks out up to 1 s sooner (the
 * Frozen Effect). Targeted: tap = the Leader (or the next-best Standing who
 * can be targeted), hold = the picker; the pipeline resolves `ctx.target`.
 * Disabling, so a Player already under a disabling Effect can't be targeted.
 * A Shield eats it.
 */
export const freezeRay: ItemHandler<"freezeRay"> = {
  id: "freezeRay",
  use(ctx) {
    const { user, def } = ctx;
    const target = ctx.target;
    if (!target) return { ok: false, reason: "no_target" };
    // The ray fires either way; a Shield may still eat it.
    ctx.emit({
      type: "fx",
      payload: { kind: "itemUse", item: "freezeRay", x: target.ball.x, y: target.ball.y, targetId: target.id },
      audience: everyone,
    });
    const hit = ctx.hit(target.id, () => {
      ctx.effects.start("frozen", {
        sourceId: user.id,
        targetId: target.id,
        durationMs: def.durationMs,
        data: { mashSavesMs: def.params.mashSavesMs ?? 0, mashClicks: def.params.mashClicks ?? 1 },
      });
      ctx.emit({ type: "feed", payload: { text: `${target.name} got frozen` }, audience: everyone });
    });
    if (hit.result === "missed") return { ok: false, reason: hit.reason };
    return {
      ok: true,
      targetId: target.id,
      summary:
        hit.result === "landed"
          ? `${user.name}: Freeze Ray froze ${target.name}`
          : `${user.name}: Freeze Ray on ${target.name}, eaten by a Shield`,
    };
  },
};
