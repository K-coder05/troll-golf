import { everyone, toPlayer } from "../events";
import type { ItemHandler } from "../items";

/**
 * Ink Splat: ink blots cover the victim's screen for the Item's duration
 * (6 s), fading; the victim scrubs it away client-side. The screen effect
 * (`inkScreen` fx) goes to the victim's connection only; everyone else sees
 * the Inked badge on the ball. Disabling, so a Player under another disabling
 * Effect can't be targeted, immunity applies and a Shield eats it.
 */
export const inkSplat: ItemHandler<"inkSplat"> = {
  id: "inkSplat",
  use(ctx) {
    const { user, def } = ctx;
    const target = ctx.target;
    if (!target) return { ok: false, reason: "no_target" };
    const hit = ctx.hit(target.id, () => {
      const effect = ctx.effects.start("inked", {
        sourceId: user.id,
        targetId: target.id,
        durationMs: def.durationMs,
      });
      if (!effect) return;
      ctx.emit({
        type: "fx",
        payload: {
          kind: "inkScreen",
          x: target.ball.x,
          y: target.ball.y,
          item: "inkSplat",
          targetId: target.id,
          durationMs: effect.endsAt - effect.startedAt,
          coverage: def.params.coverage ?? 0.6,
        },
        audience: toPlayer(target.id),
      });
      ctx.emit({ type: "feed", payload: { text: `${target.name} got inked` }, audience: everyone });
    });
    if (hit.result === "missed") return { ok: false, reason: hit.reason };
    return {
      ok: true,
      targetId: target.id,
      summary:
        hit.result === "landed"
          ? `${user.name}: Ink Splat inked ${target.name}`
          : `${user.name}: Ink Splat on ${target.name}, eaten by a Shield`,
    };
  },
};
