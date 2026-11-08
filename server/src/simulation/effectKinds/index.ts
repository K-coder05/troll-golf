import type { EffectRegistry } from "../effects";
import { frozen } from "./frozen";
import { inked } from "./inked";
import { shielded } from "./shielded";

/**
 * Every Effect kind's behaviour, by kind. Adding an Effect: its kind and info
 * in shared/src/effects.ts (EffectKind, EFFECT_INFO), a definition file here
 * and an entry in this map (missing ones are a compile error), plus a badge
 * on the client (client/src/items/effects.ts).
 */
export const EFFECT_DEFINITIONS: EffectRegistry = {
  frozen,
  inked,
  shielded,
};
