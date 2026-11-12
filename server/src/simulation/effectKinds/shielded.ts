import type { EffectDefinition } from "../effects";

/**
 * Shielded (Shield): a bubble around the ball. The Item system's
 * applyItemHit uses it up on the next attack (fx `shieldPop`); otherwise it
 * simply runs out. The bubble is visible to everyone.
 */
export const shielded: EffectDefinition<"shielded"> = {
  kind: "shielded",
  visible: true,
};
