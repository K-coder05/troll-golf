/**
 * Public interface of the Game simulation. Import from here, not from the
 * files inside. This module must never import Colyseus or Phaser
 * (enforced by test/simulation-boundary.test.ts).
 */
export {
  createGame,
  DEFAULT_SETTINGS,
  COUNTDOWN_MS,
  SCOREBOARD_MS,
  CUP_CAPTURE_SPEED,
  unfinishedScore,
  isTargetable,
  type Game,
  type CreateGameOptions,
} from "./game";
export type { Intent, IntentResult, IntentRejection } from "./intents";
export { everyone, toPlayer, toAdmin, type Audience, type GameEvent } from "./events";
export { createSeededRng, mathRandomRng, type Rng } from "./random";
export { ManualClock, systemClock, type Clock } from "./clock";
