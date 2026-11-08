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
  EMOTE_GAP_MS,
  NEAR_MISS_MARGIN,
  unfinishedScore,
  type Game,
  type CreateGameOptions,
} from "./game";
export type { Intent, IntentResult, IntentRejection } from "./intents";
export type {
  AdminIntent,
  AdminLogEntry,
  AdminPowerContext,
  AdminPowerHandler,
  AdminPowerOutcome,
  AdminPowerRegistry,
} from "./admin";
export { ADMIN_POWERS } from "./powers";
export {
  chooseBoxSpawns,
  drawCategory,
  drawItem,
  oddsRowFor,
  type ItemBallControl,
  type ItemContext,
  type ItemHandler,
  type ItemHandlerRegistry,
  type ItemHitResult,
  type ItemLogEntry,
  type ItemUseOutcome,
  type ItemUseRequest,
} from "./items";
export { ITEM_HANDLERS } from "./itemHandlers";
export {
  createEffectSystem,
  isTargetable,
  type ActiveEffect,
  type EffectDefinition,
  type EffectEndReason,
  type EffectHookContext,
  type EffectLogEntry,
  type EffectRegistry,
  type EffectStartOptions,
  type EffectSystem,
} from "./effects";
export { EFFECT_DEFINITIONS } from "./effectKinds";
export { everyone, toPlayer, toAdmin, type Audience, type GameEvent } from "./events";
export { createSeededRng, mathRandomRng, type Rng } from "./random";
export { ManualClock, systemClock, type Clock } from "./clock";
