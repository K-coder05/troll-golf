import {
  BALL_RADIUS,
  ITEM_CATEGORIES,
  type HoleData,
  type ItemCatalogue,
  type ItemCategory,
  type ItemDefinition,
  type ItemId,
  type ItemTuning,
  type OddsRow,
  type OddsTable,
  type Phase,
  type PlayerState,
  type RoomState,
  type Vec2,
} from "@troll-golf/shared";
import type { Clock } from "./clock";
import { everyone, toPlayer, type GameEvent } from "./events";
import type { IntentRejection, IntentResult } from "./intents";
import type { Rng } from "./random";

/**
 * The Item system: Item Boxes, the rubber-band draw, the one held Item per
 * Player, the use pipeline and the timestamped Item log.
 *
 *   ball rolls through an active box with an empty slot
 *     -> box shatters (public fx, `active = false` until respawn)
 *     -> Item drawn now (category by Standing row, then Item by weight)
 *     -> held, private: `item` message to the holder only (roulette)
 *
 *   useItem intent -> holds an Item? playing? roulette over? -> handler.use()
 *     -> slot emptied (unless the handler keeps it) -> log entry
 *
 * Each Item is one ItemHandler registered in ITEM_HANDLERS
 * (server/src/simulation/itemHandlers/), mirroring the Admin Power registry.
 * Its numbers come from the data catalogue (shared/src/items.ts).
 *
 * Secrecy: what a Player holds is never in RoomState and never sent to
 * anyone but them (ticket 20's x-ray reads it server-side for the Admin).
 */

// ---- What an Item handler may touch ----------------------------------------

/** Game hooks for Items that move balls. Grows with tickets 15-19. */
export interface ItemBallControl {
  /**
   * The Player's last shot on this Hole: where the ball was before it, and
   * how many penalty Strokes it has taken since. null if they haven't shot
   * this Hole (or it was already taken back).
   */
  lastShot(playerId: string): { from: Vec2; penalties: number } | null;
  /** Forget the last shot (it has been taken back). */
  clearLastShot(playerId: string): void;
  /**
   * Put the Player's ball at rest at `at`, which becomes its Rest Spot (the
   * nearest dry spot if `at` is now Water or Void). A ball the Admin is
   * holding is let go first.
   */
  placeAtRest(playerId: string, at: Vec2): Vec2;
}

/** The validated use request: a target for opponent Items, a point for aimed and placed ones. */
export interface ItemUseRequest {
  targetId?: string;
  point?: Vec2;
}

export interface ItemContext {
  /** The live room state, mutable. */
  readonly state: RoomState;
  /** The Player using the Item. */
  readonly user: PlayerState;
  /** The Item's data (duration, params...). */
  readonly def: ItemDefinition;
  readonly request: ItemUseRequest;
  now(): number;
  readonly rng: Rng;
  emit(event: GameEvent): void;
  /** Recompute Standing and the Leader after scores or positions change. */
  updateStandings(): void;
  readonly balls: ItemBallControl;
}

export type ItemUseOutcome =
  | {
      ok: true;
      /** The Player it was used on, if any. */
      targetId?: string;
      /** What happened, for the Item log (and ticket 23's Recap), e.g. "Maya: Mulligan, -2 Strokes". */
      summary: string;
      /** The Item stays held after this use (e.g. Golf Gun shots left, ticket 17). */
      keep?: boolean;
    }
  | { ok: false; reason: IntentRejection };

export interface ItemHandler<K extends ItemId = ItemId> {
  id: K;
  /** Apply the Item. Rejecting leaves it held. Handlers emit their own fx and feed lines. */
  use(ctx: ItemContext): ItemUseOutcome;
}

/**
 * One handler per Item. Partial until every v1 Item exists (tickets 15-19):
 * an Item without a handler is never drawn from a box.
 */
export type ItemHandlerRegistry = { readonly [K in ItemId]?: ItemHandler<K> };

// ---- The Item log ------------------------------------------------------------

/**
 * One line of the Item log. Server-only: for balance tuning and ticket 23's
 * Recap. A pickup line says whether the box was rigged (an Admin secret), so
 * the log must never reach non-Admins as is.
 */
export type ItemLogEntry =
  | {
      kind: "pickup";
      /** Clock time (ms). */
      at: number;
      holeIndex: number;
      playerId: string;
      item: ItemId;
      category: ItemCategory;
      standing: number;
      row: OddsRow;
      /** Rig the Box (ticket 20) decided it, not the draw. */
      rigged: boolean;
    }
  | {
      kind: "use";
      at: number;
      phase: Phase;
      holeIndex: number;
      playerId: string;
      item: ItemId;
      category: ItemCategory;
      targetId?: string;
      summary: string;
    };

// ---- The draw ----------------------------------------------------------------

/** 1st Standing uses the first row, last Standing the last, everyone between the middle one. */
export function oddsRowFor(standing: number, playerCount: number): OddsRow {
  if (standing <= 1) return "first";
  if (standing >= playerCount) return "last";
  return "middle";
}

/** A category from one row of the odds table, with one roll of the Rng. */
export function drawCategory(rng: Rng, odds: OddsTable, row: OddsRow): ItemCategory {
  const weights = odds[row];
  const total = ITEM_CATEGORIES.reduce((sum, c) => sum + weights[c], 0);
  let roll = rng.next() * total;
  for (const category of ITEM_CATEGORIES) {
    roll -= weights[category];
    if (roll < 0) return category;
  }
  return ITEM_CATEGORIES.findLast((c) => weights[c] > 0) ?? "self";
}

/** One of `items`, by weight, with one roll of the Rng. */
function drawWeighted(rng: Rng, items: readonly ItemDefinition[]): ItemId {
  const total = items.reduce((sum, d) => sum + d.weight, 0);
  let roll = rng.next() * total;
  for (const def of items) {
    roll -= def.weight;
    if (roll < 0) return def.id;
  }
  return items[items.length - 1]!.id;
}

/**
 * The box's Item: a category from the row's odds, then an Item of that
 * category by weight. Only Items that can come from a box take part: those
 * with a handler (`available`) and a weight above 0.
 *
 * Placeholder until tickets 15-19 fill the catalogue: if the drawn category
 * has no such Item yet, the Item is drawn by weight from every available
 * Item instead (today that is always Mulligan). The returned `category` is
 * still the drawn one, so the odds can be checked and logged.
 * Returns null if no Item at all can come from a box.
 */
export function drawItem(
  rng: Rng,
  odds: OddsTable,
  row: OddsRow,
  catalogue: ItemCatalogue,
  available: (id: ItemId) => boolean,
): { category: ItemCategory; item: ItemId } | null {
  const pool = Object.values(catalogue).filter((d) => d.weight > 0 && available(d.id));
  if (pool.length === 0) return null;
  const category = drawCategory(rng, odds, row);
  const inCategory = pool.filter((d) => d.category === category);
  return { category, item: drawWeighted(rng, inCategory.length > 0 ? inCategory : pool) };
}

/**
 * Which spawn points get a box: all of them at scale 1; otherwise
 * round(n x scale) of them (at least one), picked with the Rng. Ticket 24
 * scales it by the chaos level.
 */
export function chooseBoxSpawns(points: readonly Vec2[], scale: number, rng: Rng): Vec2[] {
  const count = Math.min(points.length, Math.max(points.length > 0 ? 1 : 0, Math.round(points.length * scale)));
  if (count >= points.length) return points.map((p) => ({ ...p }));
  const pool = points.map((p) => ({ ...p }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

// ---- The system ----------------------------------------------------------------

export interface ItemSystemOptions {
  state: RoomState;
  clock: Clock;
  rng: Rng;
  emit(event: GameEvent): void;
  updateStandings(): void;
  catalogue: ItemCatalogue;
  tuning: ItemTuning;
  handlers: ItemHandlerRegistry;
  balls: ItemBallControl;
}

export interface ItemSystem {
  /** Put the boxes of a (new) Hole in state; none when Items are off. */
  setupHole(hole: HoleData): void;
  /** Shattered boxes whose time is up come back. Call while playing. */
  respawnBoxes(): void;
  /**
   * A ball in play moved from `from` to `to` this physics step: it picks up
   * from the first active box it passed through, if its slot is empty. Only
   * call it for balls with a physics body (Holed-Out, disconnected and
   * waiting balls never pick up).
   */
  rollThrough(player: PlayerState, from: Vec2, to: Vec2): void;
  use(playerId: string, request: { targetId?: unknown; point?: unknown }): IntentResult;
  /** What the Player holds, or null. Server-only (ticket 20's x-ray reads it). */
  held(playerId: string): ItemId | null;
  /** Put an Item in the slot, replacing any (Give Item, ticket 20). No roulette. */
  give(playerId: string, item: ItemId): void;
  /** The Player's next box gives exactly this Item, then the rig clears (Rig the Box, ticket 20). Server-only. */
  rig(playerId: string, item: ItemId): void;
  /** Tell the Player what is in their slot (on join and reconnect). */
  sendSlot(playerId: string): void;
  /** The Player is gone from the room (lobby leave). */
  forget(playerId: string): void;
  /** A new game: every slot empty, no rigs. */
  resetAll(): void;
  readonly log: readonly ItemLogEntry[];
}

export function createItemSystem(options: ItemSystemOptions): ItemSystem {
  const { state, clock, rng, emit, catalogue, tuning, handlers } = options;
  // The held Items, by Player id: per-Player simulation state that a
  // disconnect doesn't touch, so a reconnect gets it back. Never synced.
  const slots = new Map<string, { item: ItemId; readyAt: number }>();
  // Rig the Box: the Item each Player's next box gives. Server-only.
  const rigged = new Map<string, ItemId>();
  const log: ItemLogEntry[] = [];

  const available = (id: ItemId) => handlers[id] !== undefined;

  function sendSlot(playerId: string, roulette = false): void {
    const slot = slots.get(playerId);
    emit({
      type: "item",
      payload: { item: slot?.item ?? null, roulette, readyAt: slot?.readyAt ?? 0 },
      audience: toPlayer(playerId),
    });
  }

  function pickUp(player: PlayerState, box: RoomState["itemBoxes"][number]): void {
    const now = clock.now();
    const playerCount = Object.keys(state.players).length;
    const row = oddsRowFor(player.standing, playerCount);
    const forced = rigged.get(player.id);
    let drawn: { category: ItemCategory; item: ItemId } | null;
    if (forced) {
      rigged.delete(player.id);
      drawn = { category: catalogue[forced].category, item: forced };
    } else {
      drawn = drawItem(rng, tuning.odds, row, catalogue, available);
    }
    if (!drawn) return; // nothing can come from a box: the box stays
    box.active = false;
    box.respawnAt = now + tuning.boxRespawnMs;
    emit({ type: "fx", payload: { kind: "itemBox", x: box.x, y: box.y }, audience: everyone });
    slots.set(player.id, { item: drawn.item, readyAt: now + tuning.rouletteMs });
    log.push({
      kind: "pickup",
      at: now,
      holeIndex: state.holeIndex,
      playerId: player.id,
      item: drawn.item,
      category: drawn.category,
      standing: player.standing,
      row,
      rigged: forced !== undefined,
    });
    sendSlot(player.id, true);
  }

  /** Why a use was refused, to the holder only; the Item stays. */
  function deny(playerId: string, item: ItemId, reason: IntentRejection): IntentResult {
    emit({ type: "itemDenied", payload: { item, reason }, audience: toPlayer(playerId) });
    return { ok: false, reason };
  }

  return {
    get log() {
      return log;
    },
    setupHole(hole) {
      const points = state.settings.itemsEnabled ? chooseBoxSpawns(hole.itemBoxes, tuning.boxCountScale, rng) : [];
      state.itemBoxes = points.map((p, id) => ({ id, x: p.x, y: p.y, active: true, respawnAt: 0 }));
    },
    respawnBoxes() {
      const now = clock.now();
      for (const box of state.itemBoxes) {
        if (box.active || now < box.respawnAt) continue;
        box.active = true;
        box.respawnAt = 0;
      }
    },
    rollThrough(player, from, to) {
      if (slots.has(player.id) || player.holedOut || player.spectating || !player.connected) return;
      const reach = tuning.boxRadius + BALL_RADIUS;
      for (const box of state.itemBoxes) {
        if (!box.active || segmentDistance(box, from, to) > reach) continue;
        pickUp(player, box);
        return;
      }
    },
    use(playerId, raw) {
      const user = state.players[playerId];
      if (!user) return { ok: false, reason: "unknown_player" };
      const slot = slots.get(playerId);
      if (!slot) return { ok: false, reason: "no_item" };
      if (!user.connected) return { ok: false, reason: "not_connected" };
      if (state.phase !== "playing") return deny(playerId, slot.item, "wrong_phase");
      if (clock.now() < slot.readyAt) return deny(playerId, slot.item, "item_not_ready");
      const request = parseRequest(raw);
      if (!request) return deny(playerId, slot.item, "invalid_payload");
      const handler = handlers[slot.item] as ItemHandler | undefined;
      if (!handler) return deny(playerId, slot.item, "item_unavailable");

      const def = catalogue[slot.item];
      const outcome = handler.use({
        state,
        user,
        def,
        request,
        now: () => clock.now(),
        rng,
        emit,
        updateStandings: options.updateStandings,
        balls: options.balls,
      });
      if (!outcome.ok) return deny(playerId, slot.item, outcome.reason);
      if (!outcome.keep) {
        slots.delete(playerId);
        sendSlot(playerId);
      }
      log.push({
        kind: "use",
        at: clock.now(),
        phase: state.phase,
        holeIndex: state.holeIndex,
        playerId,
        item: def.id,
        category: def.category,
        summary: outcome.summary,
        ...(outcome.targetId !== undefined ? { targetId: outcome.targetId } : {}),
      });
      return { ok: true };
    },
    held: (playerId) => slots.get(playerId)?.item ?? null,
    give(playerId, item) {
      slots.set(playerId, { item, readyAt: clock.now() });
      sendSlot(playerId);
    },
    rig(playerId, item) {
      rigged.set(playerId, item);
    },
    sendSlot: (playerId) => sendSlot(playerId),
    forget(playerId) {
      slots.delete(playerId);
      rigged.delete(playerId);
    },
    resetAll() {
      const holders = [...slots.keys()];
      slots.clear();
      rigged.clear();
      for (const id of holders) sendSlot(id);
    },
  };
}

/** Untrusted use params -> a request, or null if malformed. */
function parseRequest(raw: { targetId?: unknown; point?: unknown }): ItemUseRequest | null {
  const request: ItemUseRequest = {};
  if (raw.targetId !== undefined) {
    if (typeof raw.targetId !== "string" || raw.targetId === "") return null;
    request.targetId = raw.targetId;
  }
  if (raw.point !== undefined) {
    const p = raw.point as { x?: unknown; y?: unknown } | null;
    if (!p || typeof p !== "object" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    request.point = { x: p.x as number, y: p.y as number };
  }
  return request;
}

/** Distance from point `p` to the segment a-b. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
