/**
 * Effects: ongoing states on a Player or their ball (Frozen, Shielded, later
 * Inked, Cup Magnet, Ghost Ball...). Shared data only; the server's Effects
 * engine (server/src/simulation/effects.ts) owns behaviour.
 *
 * The full record (type, sourceId, targetId, startedAt, durationMs, data)
 * lives server-side. What every client sees is the public projection below,
 * on the target's PlayerState, for Effects that are visible on the ball
 * (badges). It never names the source, so an Admin-caused Effect can't give
 * the Admin away.
 */

import type { PlayerState } from "./state";

/** Every Effect kind. Tickets 16-21 add theirs here. */
export type EffectKind = "frozen" | "shielded" | "inked";

export interface EffectInfo {
  kind: EffectKind;
  /** Display name, e.g. "Frozen". */
  name: string;
  /** Badge emoji on the ball. */
  icon: string;
  /** A disabling Effect (Freeze, Ink): a Player is under at most one at a time. */
  disabling: boolean;
}

export const EFFECT_INFO: { readonly [K in EffectKind]: EffectInfo } = {
  frozen: { kind: "frozen", name: "Frozen", icon: "🧊", disabling: true },
  inked: { kind: "inked", name: "Inked", icon: "🦑", disabling: true },
  shielded: { kind: "shielded", name: "Shielded", icon: "🛡️", disabling: false },
};

/** An active Effect as every client sees it: on the target's ball, never saying who caused it. */
export interface EffectState {
  /** Unique within the game. */
  id: number;
  kind: EffectKind;
  /** Clock time (ms) it started. */
  startedAt: number;
  /** Clock time (ms) it ends on its own (may move: mashing out of a Freeze). */
  endsAt: number;
}

/** After an attack Item lands, its target can't be hit again for this long (ms). */
export const IMMUNITY_MS = 3000;

/**
 * Whether an Item may target this Player right now, from public state alone
 * (so the client's target picker greys out exactly what the server refuses):
 * - not Holed Out, not disconnected, not a late joiner waiting for the next Hole;
 * - with `now`: not inside their post-hit immunity window;
 * - with `disabling`: not already under a disabling Effect.
 * Without `now` only the first rule is checked.
 */
export function canBeTargeted(
  player: Readonly<Pick<PlayerState, "connected" | "holedOut" | "spectating" | "immuneUntil" | "effects">>,
  at?: { now: number; disabling?: boolean },
): boolean {
  if (!player.connected || player.holedOut || player.spectating) return false;
  if (!at) return true;
  if (at.now < player.immuneUntil) return false;
  if (at.disabling && isDisabled(player)) return false;
  return true;
}

/** Whether the Player is under a disabling Effect. */
export function isDisabled(player: Readonly<Pick<PlayerState, "effects">>): boolean {
  return player.effects.some((e) => EFFECT_INFO[e.kind]?.disabling);
}
