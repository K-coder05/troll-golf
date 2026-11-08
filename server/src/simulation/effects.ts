import {
  canBeTargeted,
  EFFECT_INFO,
  IMMUNITY_MS,
  type EffectKind,
  type EffectState,
  type PlayerState,
  type RoomState,
} from "@troll-golf/shared";
import type { Clock } from "./clock";
import type { GameEvent } from "./events";
import type { IntentRejection } from "./intents";

/**
 * The Effects engine: every ongoing state on a Player or their ball (Frozen,
 * Shielded, later Inked, Cup Magnet, Ghost Ball, Invert Controls...), the 3 s
 * post-hit immunity window and the one-disabling-Effect cap.
 *
 *   start(kind, { sourceId, targetId, durationMs, data })
 *     -> duration scaled (chaos level, ticket 24) unless `scaled: false`
 *     -> record kept server-side (with its source), a public projection on the
 *        target's PlayerState.effects if the kind is visible (ball badges)
 *     -> def.onStart
 *   every physics step  -> def.onStep (e.g. Freeze keeps the ball pinned)
 *   clock past endsAt   -> end(id, "expired") -> def.onEnd
 *
 * Each Effect kind is one EffectDefinition in EFFECT_DEFINITIONS
 * (server/src/simulation/effectKinds/). The engine is mechanism only: it
 * knows nothing about Items. Whether an attack may land (Shield, immunity,
 * the disabling cap, later God Mode) is decided in one place, the Item
 * system's applyItemHit (items.ts), which calls into this engine. Admin
 * Powers call start() directly and so skip every one of those limits.
 *
 * Secrecy: the public projection never carries the source, and an Effect
 * kind that must stay hidden (e.g. Stealth Invert Controls) is `visible: false`.
 */

/**
 * Whether Items may target this Player right now. Always: not Holed Out, not
 * disconnected, not a late joiner waiting for the next Hole (no ball in
 * play). With `at`: also not inside the 3 s post-hit immunity window and,
 * for a disabling Item, not already under a visible disabling Effect. The
 * same rule as the client's target picker (canBeTargeted in shared). The Item
 * system additionally asks the engine about hidden disabling Effects.
 * Admin Powers never go through this.
 */
export function isTargetable(player: Readonly<PlayerState>, at?: { now: number; disabling?: boolean }): boolean {
  return canBeTargeted(player, at);
}

/** The full server-side record of an active Effect. */
export interface ActiveEffect {
  /** Unique within the game. */
  readonly id: number;
  readonly kind: EffectKind;
  /** Who caused it (a Player id). Server-only: never synced. */
  readonly sourceId: string;
  readonly targetId: string;
  /** Clock time (ms). */
  readonly startedAt: number;
  /** The duration it started with, after scaling (ms). */
  readonly durationMs: number;
  /** Clock time (ms) it ends on its own; moved with setEndsAt (mashing out of a Freeze). */
  endsAt: number;
  /** Kind-specific numbers (e.g. Freeze's mash count). */
  readonly data: Record<string, number>;
}

/** Why an Effect ended: its time ran out, it was used up (a Shield that ate an attack), something cleared it (new Hole), or a fresh one of the same kind replaced it. */
export type EffectEndReason = "expired" | "consumed" | "cleared" | "replaced";

/** Game hooks an Effect may use on balls. Grows with the Effects of tickets 16-21. */
export interface EffectBallControl {
  /**
   * Pin the Player's ball where it is (it stops dead and becomes an immovable
   * block other balls bounce off), or let it roll again. Does nothing for a
   * ball with no physics body (Holed Out, disconnected, held by Ball Grab);
   * call it again once it has one.
   */
  pin(playerId: string, pinned: boolean): void;
  /** Let the ball pass through walls and obstacles (the Hole's edge still holds it), or collide again. */
  setGhost(playerId: string, ghost: boolean): void;
  /** Pull the ball toward the Cup: add `accel` px/s^2 for one physics step to its velocity. No-op without a body. */
  pullToCup(playerId: string, accel: number): void;
  /**
   * The ball comes out of a wall it was inside (a Ghost Ball that stopped in
   * one): it moves to the nearest legal, dry spot, which becomes its Rest Spot.
   */
  settle(playerId: string): void;
}

export interface EffectHookContext {
  readonly state: RoomState;
  now(): number;
  emit(event: GameEvent): void;
  readonly balls: EffectBallControl;
  /** Move the Effect's end time (synced to clients too). At or before now, it ends on the next step. */
  setEndsAt(effect: ActiveEffect, endsAt: number): void;
  /** End this Effect now. */
  end(effect: ActiveEffect, why: EffectEndReason): void;
}

export interface EffectDefinition<K extends EffectKind = EffectKind> {
  kind: K;
  /**
   * Shown on the target's ball to everyone (synced in PlayerState.effects).
   * A hidden Effect stays server-only (and in the Admin's x-ray, ticket 20).
   */
  visible: boolean;
  /** While it is on, the target's shots are refused with this reason. */
  blocksShot?: IntentRejection;
  onStart?(ctx: EffectHookContext, effect: ActiveEffect): void;
  /** Every physics step while the Hole is played. */
  onStep?(ctx: EffectHookContext, effect: ActiveEffect): void;
  onEnd?(ctx: EffectHookContext, effect: ActiveEffect, why: EffectEndReason): void;
  /** The target took a shot (Cup Magnet and Ghost Ball start working on it). */
  onShot?(ctx: EffectHookContext, effect: ActiveEffect): void;
  /** The target's ball came to rest (or sank, or dropped into the Cup). */
  onRest?(ctx: EffectHookContext, effect: ActiveEffect): void;
  /** One mash click from the target (Freeze: break out sooner). */
  onMash?(ctx: EffectHookContext, effect: ActiveEffect): void;
}

/** Every Effect kind's behaviour. Complete: a kind without a definition is a compile error. */
export type EffectRegistry = { readonly [K in EffectKind]: EffectDefinition<K> };

export interface EffectStartOptions {
  sourceId: string;
  targetId: string;
  /** Unscaled duration, ms (the Item's catalogue duration). */
  durationMs: number;
  data?: Record<string, number>;
  /**
   * Scale the duration by the chaos level (ticket 24). True for Item
   * Effects; Admin Powers pass false (they aren't affected by chaos).
   */
  scaled?: boolean;
}

/**
 * The Effect log, server-only, for ticket 23's Recap (e.g. longest total
 * Freeze time: sum `lastedMs` of the `end` entries of kind "frozen") and
 * balance tuning. It names sources, so it must never reach non-Admins as is.
 */
export type EffectLogEntry =
  | {
      kind: "start";
      at: number;
      holeIndex: number;
      effectId: number;
      effect: EffectKind;
      sourceId: string;
      targetId: string;
      durationMs: number;
    }
  | {
      kind: "end";
      at: number;
      holeIndex: number;
      effectId: number;
      effect: EffectKind;
      sourceId: string;
      targetId: string;
      why: EffectEndReason;
      /** How long it was actually on, ms. */
      lastedMs: number;
    };

export interface EffectSystemOptions {
  state: RoomState;
  clock: Clock;
  emit(event: GameEvent): void;
  registry: EffectRegistry;
  balls: EffectBallControl;
  /**
   * Multiplier for scaled Effect durations, read at each start. 1 by default;
   * ticket 24 returns the chaos level's (0.6 / 1 / 1.5).
   */
  durationScale?: () => number;
}

export interface EffectSystem {
  /** Start an Effect on a Player (any limits were checked by the caller). Null if there is no such Player. */
  start(kind: EffectKind, options: EffectStartOptions): ActiveEffect | null;
  /** End one Effect now. Does nothing if it already ended. */
  end(effectId: number, why: EffectEndReason): void;
  /** The Player's active Effect of this kind, if any. */
  find(playerId: string, kind: EffectKind): ActiveEffect | undefined;
  /** Every active Effect on the Player, oldest first (visible and hidden). */
  on(playerId: string): readonly ActiveEffect[];
  /** Under a disabling Effect (Freeze, Ink): can't receive another. */
  isDisabled(playerId: string): boolean;
  /** Inside the post-hit immunity window. */
  isImmune(playerId: string): boolean;
  /** Start the 3 s immunity window (an attack just landed). */
  grantImmunity(playerId: string): void;
  /** Why the Player can't shoot right now because of an Effect, or null. */
  shotBlocker(playerId: string): IntentRejection | null;
  /** A mash click: passed to every active Effect on the Player that reacts to it. False if none does. */
  mash(playerId: string): boolean;
  /** The Player just took a shot: onShot hooks. */
  shot(playerId: string): void;
  /** The Player's ball came to rest, sank or was holed: onRest hooks. */
  rested(playerId: string): void;
  /** Each physics step while playing: onStep hooks. */
  step(): void;
  /** End every Effect whose time is up. Call while playing. */
  expire(): void;
  /** End every Effect and immunity window (a new Hole, a new game, the Hole ending). */
  clearAll(): void;
  /** Effects on (and immunity of) a Player who is gone from the room. */
  forget(playerId: string): void;
  readonly log: readonly EffectLogEntry[];
}

export function createEffectSystem(options: EffectSystemOptions): EffectSystem {
  const { state, clock, emit, registry, balls } = options;
  const active: ActiveEffect[] = [];
  const log: EffectLogEntry[] = [];
  let nextId = 1;

  const hookContext: EffectHookContext = {
    state,
    now: () => clock.now(),
    emit,
    balls,
    setEndsAt(effect, endsAt) {
      effect.endsAt = endsAt;
      const shown = state.players[effect.targetId]?.effects.find((e) => e.id === effect.id);
      if (shown) shown.endsAt = endsAt;
    },
    end: (effect, why) => end(effect.id, why),
  };

  const def = (kind: EffectKind) => registry[kind] as EffectDefinition;
  const onPlayer = (playerId: string) => active.filter((e) => e.targetId === playerId);

  function end(effectId: number, why: EffectEndReason): void {
    const index = active.findIndex((e) => e.id === effectId);
    if (index < 0) return;
    const [effect] = active.splice(index, 1) as [ActiveEffect];
    const player = state.players[effect.targetId];
    if (player) player.effects = player.effects.filter((e) => e.id !== effect.id);
    const now = clock.now();
    log.push({
      kind: "end",
      at: now,
      holeIndex: state.holeIndex,
      effectId: effect.id,
      effect: effect.kind,
      sourceId: effect.sourceId,
      targetId: effect.targetId,
      why,
      lastedMs: now - effect.startedAt,
    });
    def(effect.kind).onEnd?.(hookContext, effect, why);
  }

  return {
    get log() {
      return log;
    },
    start(kind, opts) {
      const player = state.players[opts.targetId];
      if (!player) return null;
      // One Effect of a kind per Player: a fresh one replaces the old (e.g. a second Shield).
      const old = active.find((e) => e.targetId === opts.targetId && e.kind === kind);
      if (old) end(old.id, "replaced");
      const now = clock.now();
      const scale = opts.scaled === false ? 1 : (options.durationScale?.() ?? 1);
      const durationMs = Math.round(opts.durationMs * scale);
      const effect: ActiveEffect = {
        id: nextId++,
        kind,
        sourceId: opts.sourceId,
        targetId: opts.targetId,
        startedAt: now,
        durationMs,
        endsAt: now + durationMs,
        data: { ...opts.data },
      };
      active.push(effect);
      if (def(kind).visible) {
        const shown: EffectState = { id: effect.id, kind, startedAt: now, endsAt: effect.endsAt };
        player.effects.push(shown);
      }
      log.push({
        kind: "start",
        at: now,
        holeIndex: state.holeIndex,
        effectId: effect.id,
        effect: kind,
        sourceId: opts.sourceId,
        targetId: opts.targetId,
        durationMs,
      });
      def(kind).onStart?.(hookContext, effect);
      return effect;
    },
    end,
    find: (playerId, kind) => active.find((e) => e.targetId === playerId && e.kind === kind),
    on: onPlayer,
    isDisabled: (playerId) => onPlayer(playerId).some((e) => EFFECT_INFO[e.kind].disabling),
    isImmune: (playerId) => clock.now() < (state.players[playerId]?.immuneUntil ?? 0),
    grantImmunity(playerId) {
      const player = state.players[playerId];
      if (player) player.immuneUntil = clock.now() + IMMUNITY_MS;
    },
    shotBlocker(playerId) {
      for (const effect of onPlayer(playerId)) {
        const reason = def(effect.kind).blocksShot;
        if (reason) return reason;
      }
      return null;
    },
    mash(playerId) {
      let handled = false;
      for (const effect of onPlayer(playerId)) {
        const onMash = def(effect.kind).onMash;
        if (!onMash) continue;
        onMash(hookContext, effect);
        handled = true;
      }
      return handled;
    },
    shot(playerId) {
      for (const effect of onPlayer(playerId)) def(effect.kind).onShot?.(hookContext, effect);
    },
    rested(playerId) {
      for (const effect of onPlayer(playerId)) def(effect.kind).onRest?.(hookContext, effect);
    },
    step() {
      for (const effect of [...active]) def(effect.kind).onStep?.(hookContext, effect);
    },
    expire() {
      const now = clock.now();
      for (const effect of active.filter((e) => e.endsAt <= now)) end(effect.id, "expired");
    },
    clearAll() {
      for (const effect of [...active]) end(effect.id, "cleared");
      for (const player of Object.values(state.players)) player.immuneUntil = 0;
    },
    forget(playerId) {
      for (const effect of onPlayer(playerId)) end(effect.id, "cleared");
    },
  };
}
