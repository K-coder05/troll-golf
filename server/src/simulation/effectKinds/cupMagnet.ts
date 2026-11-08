import type { EffectDefinition } from "../effects";

/**
 * Cup Magnet: armed when the Item is used (a badge on the ball), it works on
 * the Player's NEXT shot: while that shot rolls, every physics step adds a
 * small acceleration (`data.pull` px/s^2, from the Item's params) toward the
 * Cup, so the ball curves in rather than teleporting. It ends (consumed) when
 * that shot comes to rest, sinks or drops in the Cup, or when the Hole ends.
 * `data.flying` is 0 while armed and 1 once the shot is taken.
 */
export const cupMagnet: EffectDefinition<"cupMagnet"> = {
  kind: "cupMagnet",
  visible: true,
  onShot(_ctx, effect) {
    effect.data.flying = 1;
  },
  onStep(ctx, effect) {
    if (!effect.data.flying) return;
    ctx.balls.pullToCup(effect.targetId, effect.data.pull ?? 0);
  },
  onRest(ctx, effect) {
    if (effect.data.flying) ctx.end(effect, "consumed");
  },
};

