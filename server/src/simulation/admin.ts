import {
  GOLF_GODS_BANNER,
  type AdminMode,
  type AdminPowerId,
  type AdminPowerParams,
  type NukeAftermath,
  type Phase,
  type RoomState,
  type Vec2,
} from "@troll-golf/shared";
import type { Clock } from "./clock";
import { everyone, toAdmin, type GameEvent } from "./events";
import type { IntentRejection, IntentResult } from "./intents";

/**
 * The Admin Power pipeline: who the Admin is, the check that an admin intent
 * really comes from them, Stealth/Loud handling, and the timestamped log of
 * every use. Everything here is server-only state; none of it is in RoomState.
 *
 * Each Admin Power is one AdminPowerHandler registered in ADMIN_POWERS
 * (server/src/simulation/powers/). A handler only parses its params and
 * changes the game; the pipeline does the rest the same way for every power:
 *
 *   intent -> is the sender the Admin? -> known power, valid mode, valid
 *   params, allowed in this phase? -> handler.use() -> log entry ->
 *   Loud: Golf Gods banner to everyone -> result to the Admin only.
 *
 * Secrecy (docs/adr/0001): a handler must emit nothing that names the Admin
 * or marks its effect as an Admin Power in Stealth. The banner never says who.
 */

/**
 * The Admin's hold on a ball, for Ball Grab. A held ball is out of the physics
 * world (nothing touches it, it can't be shot) and sits wherever the Admin
 * drags it; releasing it puts it back under the normal rules.
 */
export interface AdminBallControl {
  /** The ball currently held, and the mode it was grabbed in. */
  readonly held: { id: string; mode: AdminMode } | null;
  /** Pick up a ball in play. Another ball already held is put down at rest first. */
  grab(id: string, mode: AdminMode): { ok: true; name: string; at: Vec2 } | { ok: false; reason: IntentRejection };
  /** Move the held ball (kept inside the Hole and out of walls). False if nothing is held. */
  move(x: number, y: number): boolean;
  /**
   * Put the held ball down: at rest, or thrown with a velocity (px/s). It then
   * Holes Out, sinks or rolls like any ball. False if nothing is held.
   */
  release(x: number, y: number, velocity?: Vec2): boolean;
}

/** The Admin's Nuke, a timed sequence the simulation runs (siren, blast, aftermath). */
export interface AdminNukeControl {
  /**
   * Start a Nuke at (x, y). Only one can be pending: `nuke_pending` while
   * another is. The impact point must be inside the Hole (`invalid_payload`).
   */
  launch(x: number, y: number, aftermath: NukeAftermath): { ok: true } | { ok: false; reason: IntentRejection };
}

/**
 * What a handler may touch. Deliberately small; later Admin Powers add the
 * hooks they need (physics, surfaces, the Cup, Items...) in game.ts, where the
 * context is built.
 */
export interface AdminPowerContext {
  /** The live room state, mutable. */
  readonly state: RoomState;
  /** The Admin's Player id. Never put it in an event or in state. */
  readonly adminId: string;
  now(): number;
  emit(event: GameEvent): void;
  /** Recompute Standing and the Leader after scores or positions change. */
  updateStandings(): void;
  /** Hold, move and release balls (Ball Grab). */
  readonly balls: AdminBallControl;
  /** Launch a Nuke. */
  readonly nukes: AdminNukeControl;
}

export type AdminPowerOutcome =
  | {
      ok: true;
      /** The Player the power was used on, if any. */
      targetId?: string;
      /**
       * What happened, for the log, the Admin's console and the Troll Recap
       * reveal (ticket 23), e.g. "Ben +2 Strokes on Hole 1". Never sent to
       * anyone but the Admin.
       */
      summary: string;
      /** Loud only: the banner's detail line, e.g. "Ben: +2 Strokes". It must not name the Admin. */
      bannerDetail?: string;
      /**
       * A continuation of an earlier use (a Ball Grab drag or release): not
       * logged again, no banner, no confirmation to the Admin.
       */
      quiet?: boolean;
    }
  | { ok: false; reason: IntentRejection };

export interface AdminPowerHandler<K extends AdminPowerId = AdminPowerId> {
  id: K;
  /** Phases the power can be used in. */
  phases: readonly Phase[];
  /** Validate untrusted params from the network; null means invalid_payload. */
  parse(params: unknown): AdminPowerParams[K] | null;
  /**
   * Apply the power. `mode` picks the Stealth form (looks like a natural
   * event or bad luck) or the Loud form (spectacle); the pipeline adds the
   * Golf Gods banner itself in Loud.
   */
  use(ctx: AdminPowerContext, params: AdminPowerParams[K], mode: AdminMode): AdminPowerOutcome;
}

/** The registry type: exactly one handler per Admin Power id. */
export type AdminPowerRegistry = { [K in AdminPowerId]: AdminPowerHandler<K> };

/**
 * One Admin Power use, as logged. Server-only, never synced. Ticket 23 builds
 * the Troll Recap reveal ("That lip-out on hole 4? That was me.") and the
 * saved session log from these.
 */
export interface AdminLogEntry {
  /** Clock time (ms) of the use. */
  at: number;
  phase: Phase;
  /** 0-based Hole index at the time. */
  holeIndex: number;
  adminId: string;
  power: AdminPowerId;
  mode: AdminMode;
  targetId?: string;
  summary: string;
  /** The validated params, as used. */
  params: unknown;
}

/** An admin intent as it arrives from the network: nothing in it is trusted yet. */
export interface AdminIntent {
  type: "admin";
  power: string;
  mode: string;
  params: unknown;
}

export interface AdminPowers {
  /** The Admin's Player id, or null if the room has none. */
  readonly adminId: string | null;
  isAdmin(playerId: string): boolean;
  /** Make this Player the Admin. False if the room already has one. */
  claim(playerId: string): boolean;
  /** This Player is gone for good: the room may get a new Admin. */
  release(playerId: string): void;
  use(playerId: string, intent: AdminIntent): IntentResult;
  readonly log: readonly AdminLogEntry[];
}

export interface AdminPowersOptions {
  registry: AdminPowerRegistry;
  clock: Clock;
  state: RoomState;
  emit(event: GameEvent): void;
  updateStandings(): void;
  balls: AdminBallControl;
  nukes: AdminNukeControl;
}

export function createAdminPowers(options: AdminPowersOptions): AdminPowers {
  const { registry, clock, state, emit } = options;
  let adminId: string | null = null;
  const log: AdminLogEntry[] = [];

  const lookup = (power: string): AdminPowerHandler | undefined =>
    Object.hasOwn(registry, power) ? (registry[power as AdminPowerId] as AdminPowerHandler) : undefined;

  /** Tell the Admin (and only the Admin) why a use failed. */
  function reject(power: string, reason: IntentRejection): IntentResult {
    emit({ type: "adminResult", payload: { ok: false, power: String(power), reason }, audience: toAdmin });
    return { ok: false, reason };
  }

  return {
    get adminId() {
      return adminId;
    },
    get log() {
      return log;
    },
    isAdmin: (playerId) => adminId !== null && playerId === adminId,
    claim(playerId) {
      if (adminId !== null && adminId !== playerId) return false;
      adminId = playerId;
      return true;
    },
    release(playerId) {
      if (adminId === playerId) adminId = null;
    },
    use(playerId, intent) {
      if (!state.players[playerId]) return { ok: false, reason: "unknown_player" };
      // Anyone else gets a plain rejection and nothing is emitted, logged or changed.
      if (adminId === null || playerId !== adminId) return { ok: false, reason: "not_admin" };

      const handler = lookup(intent.power);
      if (!handler) return reject(intent.power, "unknown_power");
      if (intent.mode !== "stealth" && intent.mode !== "loud") return reject(intent.power, "invalid_payload");
      const mode: AdminMode = intent.mode;
      const params = handler.parse(intent.params);
      if (params === null) return reject(handler.id, "invalid_payload");
      if (!handler.phases.includes(state.phase)) return reject(handler.id, "wrong_phase");

      const ctx: AdminPowerContext = {
        state,
        adminId,
        now: () => clock.now(),
        emit,
        updateStandings: options.updateStandings,
        balls: options.balls,
        nukes: options.nukes,
      };
      const outcome = handler.use(ctx, params as never, mode);
      if (!outcome.ok) return reject(handler.id, outcome.reason);
      if (outcome.quiet) return { ok: true };

      const entry: AdminLogEntry = {
        at: clock.now(),
        phase: state.phase,
        holeIndex: state.holeIndex,
        adminId,
        power: handler.id,
        mode,
        summary: outcome.summary,
        params,
        ...(outcome.targetId !== undefined ? { targetId: outcome.targetId } : {}),
      };
      log.push(entry);

      if (mode === "loud") {
        emit({
          type: "banner",
          payload: { text: GOLF_GODS_BANNER, ...(outcome.bannerDetail ? { detail: outcome.bannerDetail } : {}) },
          audience: everyone,
        });
      }
      emit({
        type: "adminResult",
        payload: { ok: true, power: handler.id, mode, summary: outcome.summary, at: entry.at },
        audience: toAdmin,
      });
      return { ok: true };
    },
  };
}
