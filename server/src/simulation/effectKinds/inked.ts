import type { EffectDefinition } from "../effects";

/**
 * Inked (Ink Splat): ink over the victim's screen. Purely a display effect:
 * it doesn't stop shooting. Disabling (EFFECT_INFO), so the one-at-a-time cap,
 * immunity and Shields apply. Everyone sees a badge on the ball; the ink
 * itself is sent to the victim only (the Ink Splat handler).
 */
export const inked: EffectDefinition<"inked"> = {
  kind: "inked",
  visible: true,
};
