import type { EffectDefinition } from "../effects";

/**
 * Ghost Ball: armed when the Item is used (translucent ball), it works on the
 * Player's NEXT shot: the ball passes through walls and moving obstacles (the
 * Hole's outer edge still holds it). Hazards, the Cup, Boost Pads, Teleporters
 * and surfaces work as usual, and other balls still collide with it.
 * It ends (consumed) when that shot comes to rest, sinks or drops in the Cup,
 * or when the Hole ends. A ball that comes to rest inside a wall is moved to
 * the nearest legal dry spot, which becomes its Rest Spot.
 * `data.flying` is 0 while armed and 1 once the shot is taken.
 */
export const ghostBall: EffectDefinition<"ghostBall"> = {
  kind: "ghostBall",
  visible: true,
  onShot(ctx, effect) {
    effect.data.flying = 1;
    ctx.balls.setGhost(effect.targetId, true);
  },
  onStep(ctx, effect) {
    // A ball that got a new body meanwhile (reconnect) is a ghost again.
    if (effect.data.flying) ctx.balls.setGhost(effect.targetId, true);
  },
  onRest(ctx, effect) {
    if (effect.data.flying) ctx.end(effect, "consumed");
  },
  onEnd(ctx, effect, why) {
    ctx.balls.setGhost(effect.targetId, false);
    if (effect.data.flying && why !== "cleared") ctx.balls.settle(effect.targetId);
  },
};
