import type { EffectDefinition } from "../effects";

/**
 * Inverted controls: while on, the target's shots go the opposite way to
 * their drag. The flip itself is in game.ts `shoot` (it asks the Effects
 * engine whether this Effect is active), so it holds whatever the client
 * sends. Visible by default (a badge, Loud); a Stealth use starts it with
 * `hidden: true`, which keeps it server-only. Not disabling, and cleared at
 * the end of the Hole like every Effect.
 */
export const invertControls: EffectDefinition<"invertControls"> = {
  kind: "invertControls",
  visible: true,
};
