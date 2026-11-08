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
import { isTargetable, type EffectSystem } from "./effects";
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
 *   useItem intent -> holds an Item? playing? roulette over?
 *     -> opponent Items: resolve the target (picked, else the best Standing
 *        that can be targeted; nobody -> refused, Item kept)
 *     -> handler.use() -> slot emptied (unless the handler keeps it) -> log entry
 *
 *   An attack reaches its target only through applyItemHit, the one place
 *   that checks targetability, immunity, the disabling cap and Shields (and,
 *   ticket 20, God Mode), grants the 3 s immunity and counts the Item Hit.
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
  /**
   * Knock the Player's ball: add `delta` to its velocity (it wakes up if
   * resting). If it ends in Water or Void soon after, the feed says `byName`
   * sniped it there.
   */
  push(playerId: string, delta: Vec2, byName: string): void;
  /** The Hole's width and height (a placed trap must lie inside it). */
  holeSize(): { width: number; height: number };
  /** Whether the Player's ball is in play and free to be moved by Swap (has a body; not Frozen, held by Ball Grab, Holed Out or waiting). */
  canSwap(playerId: string): boolean;
  /**
   * Trade the two balls' positions. Each ball keeps its own velocity and
   * resting state; a resting ball's new place becomes its Rest Spot. False
   * (nothing moves) unless both can be swapped.
   */
  swap(aId: string, bId: string): boolean;
  /** Where the Cup is now (a Holed-Out Golf Gun shooter fires from it). */
  cupPosition(): Vec2;
}

/** An Item in use that stays held for a while (Golf Gun crosshair mode). */
export interface ItemActive {
  /** Clock time (ms) it runs out. */
  until: number;
  shotsLeft: number;
}

/** The validated use request: a target for opponent Items, a point for aimed and placed ones. */
export interface ItemUseRequest {
  targetId?: string;
  point?: Vec2;
}

/**
 * What happened to an attack:
 * - landed: it took effect; the target is immune for 3 s and the attacker got an Item Hit;
 * - blocked: a Shield ate it (used up; no Item Hit, no immunity);
 * - missed: the target can't be hit right now (nothing happened).
 */
export type ItemHitResult =
  | { result: "landed" }
  | { result: "blocked"; by: "shield" }
  | { result: "missed"; reason: IntentRejection };

export interface ItemContext {
  /** The live room state, mutable. */
  readonly state: RoomState;
  /** The Player using the Item. */
  readonly user: PlayerState;
  /**
   * Opponent-targeted Items: the resolved target (the picked one, or on a
   * tap the best Standing who can be targeted). Undefined for other kinds.
   */
  readonly target?: PlayerState;
  /** The Item's data (duration, params...). */
  readonly def: ItemDefinition;
  readonly request: ItemUseRequest;
  /** This Item's in-use state, if a previous use left it armed (see `setActive`). */
  readonly active: ItemActive | null;
  /** Arm (or update) the in-use state; null clears it. Use with `keep: true`. The system uses the Item up when `until` passes. */
  setActive(active: ItemActive | null): void;
  now(): number;
  readonly rng: Rng;
  emit(event: GameEvent): void;
  /** Recompute Standing and the Leader after scores or positions change. */
  updateStandings(): void;
  readonly balls: ItemBallControl;
  /** The Effects engine (start Effects, look up Shields...). */
  readonly effects: EffectSystem;
  /**
   * Attack `targetId` with this Item: applyItemHit for the user. `land` is
   * called only if the attack gets through, and does what the Item does
   * (start an Effect, push the ball...) plus its own feed line.
   */
  hit(targetId: string, land: () => void): ItemHitResult;
  /** Opponents this Item may target right now, best Standing first (Swap picks from these). */
  targets(): PlayerState[];
  /** Lay a Banana Mine at `at` for the user; it lasts `def.durationMs`. */
  placeTrap(at: Vec2): void;
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
    }
  | {
      /** An attack Item landed: an Item Hit for `playerId` (the attacker), taken by `targetId`. */
      kind: "hit";
      at: number;
      holeIndex: number;
      playerId: string;
      targetId: string;
      item: ItemId;
    }
  | {
      /** An attack was blocked (a Shield ate it). Not an Item Hit. */
      kind: "blocked";
      at: number;
      holeIndex: number;
      playerId: string;
      targetId: string;
      item: ItemId;
      by: "shield";
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
 * If the drawn category has no such Item (today: chaos, until Swap in
 * ticket 19), the Item is drawn by weight from every available Item instead
 * (Freeze Ray, Shield or Mulligan). The returned `category` is still the
 * drawn one, so the odds can be checked and logged.
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
  effects: EffectSystem;
}

export interface ItemSystem {
  /** Put the boxes of a (new) Hole in state; none when Items are off. */
  setupHole(hole: HoleData): void;
  /** Shattered boxes whose time is up come back. Call while playing. */
  respawnBoxes(): void;
  /** Untriggered Banana Mines past their time disappear. Call while playing. */
  expireTraps(): void;
  /** Every trap goes (a Hole ends or starts). */
  clearTraps(): void;
  /**
   * A ball in play moved from `from` to `to` this physics step: it sets off
   * the first armed trap its path touched (owner's ball included). The
   * trap is consumed whatever happens; the push is random-direction via the
   * Rng. An opponent's trigger goes through applyItemHit (Shield, immunity,
   * Item Hit, feed); a ball that was already on the trap when it was laid is
   * exempt until it has left it.
   */
  triggerTraps(player: PlayerState, from: Vec2, to: Vec2): void;
  /** Items in use whose time is up (or whose Hole is over) are used up. Call every step. */
  expireActive(): void;
  /**
   * A ball in play moved from `from` to `to` this physics step: it picks up
   * from the first active box it passed through, if its slot is empty. Only
   * call it for balls with a physics body (Holed-Out, disconnected and
   * waiting balls never pick up).
   */
  rollThrough(player: PlayerState, from: Vec2, to: Vec2): void;
  use(playerId: string, request: { targetId?: unknown; point?: unknown }): IntentResult;
  /**
   * The single path for an attack Item reaching an opponent, for use
   * handlers (through ItemContext.hit) and for Items that hit later (Banana
   * Mine, ticket 18). In order: the target must be targetable for this Item
   * (in play, not immune, not already disabled if the Item is disabling);
   * (ticket 20: God Mode blocks it here, looking like a Shield pop); a
   * Shield eats it (fx `shieldPop`, feed line); otherwise `land()` runs, the
   * target becomes immune for 3 s and the attacker gets an Item Hit. Every
   * hit and block is logged. Admin Powers never come through here.
   */
  applyItemHit(attackerId: string, targetId: string, item: ItemId, land: () => void): ItemHitResult;
  /** Whether `target` can be attacked with `item` right now. */
  canTarget(target: PlayerState, item: ItemId): boolean;
  /** A Player's Item Hits this game. Server-only until the game ends. */
  itemHits(playerId: string): number;
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
  /** A new game: every slot empty, no rigs, no Item Hits. */
  resetAll(): void;
  readonly log: readonly ItemLogEntry[];
}

export function createItemSystem(options: ItemSystemOptions): ItemSystem {
  const { state, clock, rng, emit, catalogue, tuning, handlers } = options;
  // The held Items, by Player id: per-Player simulation state that a
  // disconnect doesn't touch, so a reconnect gets it back. Never synced.
  const slots = new Map<string, { item: ItemId; readyAt: number; active?: ItemActive }>();
  // Rig the Box: the Item each Player's next box gives. Server-only.
  const rigged = new Map<string, ItemId>();
  const log: ItemLogEntry[] = [];
  // Item Hits per attacker this game. Server-only until the game ends (then copied into PlayerState.itemHits).
  const hits = new Map<string, number>();
  const { effects } = options;
  // Banana Mines with their owners (public state has no owner). `exempt`: balls that were
  // already touching it when it was laid, until they roll clear.
  const trapOwners = new Map<number, { ownerId: string; exempt: Set<string> }>();
  let nextTrapId = 0;

  const available = (id: ItemId) => handlers[id] !== undefined;

  function sendSlot(playerId: string, roulette = false): void {
    const slot = slots.get(playerId);
    emit({
      type: "item",
      payload: {
        item: slot?.item ?? null,
        roulette,
        readyAt: slot?.readyAt ?? 0,
        ...(slot?.active ? { active: { shotsLeft: slot.active.shotsLeft, endsAt: slot.active.until } } : {}),
      },
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

  function canTarget(target: PlayerState, item: ItemId): boolean {
    const { disabling } = catalogue[item];
    if (!isTargetable(target, { now: clock.now(), disabling })) return false;
    // Hidden disabling Effects count too.
    return !(disabling && effects.isDisabled(target.id));
  }

  /** Opponents `item` may target right now, best Standing first. */
  function targetsFor(userId: string, item: ItemId): PlayerState[] {
    return Object.values(state.players)
      .filter((p) => p.id !== userId && canTarget(p, item))
      .sort((a, b) => a.standing - b.standing);
  }

  /**
   * An opponent Item's target: the one picked (it must be an opponent who can
   * be targeted now), or on a tap the Leader, skipping to the next-best
   * Standing whenever the better one can't be targeted.
   */
  function resolveTarget(user: PlayerState, item: ItemId, picked: string | undefined): PlayerState | IntentRejection {
    if (picked !== undefined) {
      const target = state.players[picked];
      if (!target || picked === user.id) return "unknown_target";
      return canTarget(target, item) ? target : "untargetable";
    }
    return targetsFor(user.id, item)[0] ?? "no_target";
  }

  function applyItemHit(attackerId: string, targetId: string, item: ItemId, land: () => void): ItemHitResult {
    const target = state.players[targetId];
    const attacker = state.players[attackerId];
    if (!target || !attacker || targetId === attackerId) return { result: "missed", reason: "unknown_target" };
    if (!canTarget(target, item)) return { result: "missed", reason: "untargetable" };
    const now = clock.now();
    const def = catalogue[item];
    // Ticket 20: God Mode blocks here, with exactly the events of a Shield pop in Stealth.
    const shield = effects.find(targetId, "shielded");
    if (shield) {
      effects.end(shield.id, "consumed");
      emit({ type: "fx", payload: { kind: "shieldPop", x: target.ball.x, y: target.ball.y, item, targetId }, audience: everyone });
      emit({ type: "feed", payload: { text: `${target.name}'s Shield ate a ${def.name}` }, audience: everyone });
      log.push({ kind: "blocked", at: now, holeIndex: state.holeIndex, playerId: attackerId, targetId, item, by: "shield" });
      return { result: "blocked", by: "shield" };
    }
    land();
    effects.grantImmunity(targetId);
    hits.set(attackerId, (hits.get(attackerId) ?? 0) + 1);
    log.push({ kind: "hit", at: now, holeIndex: state.holeIndex, playerId: attackerId, targetId, item });
    return { result: "landed" };
  }

  const trapDef = catalogue.bananaMine;
  const trapReach = (trapDef.params.trapRadius ?? 14) + BALL_RADIUS;

  function removeTrap(id: number): void {
    state.traps = state.traps.filter((t) => t.id !== id);
    trapOwners.delete(id);
  }

  function placeTrap(ownerId: string, at: Vec2): void {
    const id = nextTrapId++;
    const exempt = new Set<string>();
    for (const p of Object.values(state.players)) {
      if (!p.holedOut && !p.spectating && Math.hypot(p.ball.x - at.x, p.ball.y - at.y) <= trapReach) exempt.add(p.id);
    }
    state.traps.push({ id, x: at.x, y: at.y, expiresAt: clock.now() + trapDef.durationMs });
    trapOwners.set(id, { ownerId, exempt });
  }

  function setOff(trap: RoomState["traps"][number], victim: PlayerState): void {
    const owner = trapOwners.get(trap.id)!.ownerId;
    removeTrap(trap.id);
    const ownerName = state.players[owner]?.name ?? "Someone";
    // One roll of the Rng per trigger, whether or not the push lands.
    const angle = rng.next() * Math.PI * 2;
    const speed = trapDef.params.pushSpeed ?? 600;
    const spin = () => {
      emit({ type: "fx", payload: { kind: "itemUse", item: "bananaMine", x: trap.x, y: trap.y, targetId: victim.id }, audience: everyone });
      options.balls.push(victim.id, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, ownerName);
    };
    if (victim.id === owner) {
      spin();
      emit({ type: "feed", payload: { text: `${victim.name} slipped on their own banana` }, audience: everyone });
      return;
    }
    // Shield and immunity apply: a blocked or immune trigger still uses the trap up (no push).
    applyItemHit(owner, victim.id, "bananaMine", () => {
      spin();
      emit({ type: "feed", payload: { text: `${victim.name} slipped on ${ownerName}'s banana` }, audience: everyone });
    });
  }

  return {
    get log() {
      return log;
    },
    applyItemHit,
    canTarget,
    itemHits: (playerId) => hits.get(playerId) ?? 0,
    expireTraps() {
      const now = clock.now();
      for (const trap of [...state.traps]) if (now >= trap.expiresAt) removeTrap(trap.id);
    },
    clearTraps() {
      state.traps = [];
      trapOwners.clear();
    },
    triggerTraps(player, from, to) {
      if (player.holedOut || player.spectating || !player.connected) return;
      for (const trap of [...state.traps]) {
        const info = trapOwners.get(trap.id);
        if (!info) continue;
        const near = segmentDistance(trap, from, to) <= trapReach;
        if (info.exempt.has(player.id)) {
          if (!near) info.exempt.delete(player.id);
          continue;
        }
        if (!near) continue;
        setOff(trap, player);
        return;
      }
    },
    setupHole(hole) {
      state.traps = [];
      trapOwners.clear();
      const points = state.settings.itemsEnabled ? chooseBoxSpawns(hole.itemBoxes, tuning.boxCountScale, rng) : [];
      state.itemBoxes = points.map((p, id) => ({ id, x: p.x, y: p.y, active: true, respawnAt: 0 }));
    },
    expireActive() {
      const now = clock.now();
      for (const [playerId, slot] of [...slots]) {
        if (!slot.active) continue;
        if (now < slot.active.until && state.phase === "playing") continue;
        slots.delete(playerId);
        sendSlot(playerId);
      }
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
      let target: PlayerState | undefined;
      if (def.targeting === "opponent") {
        const resolved = resolveTarget(user, def.id, request.targetId);
        if (typeof resolved === "string") return deny(playerId, slot.item, resolved);
        target = resolved;
      }
      const outcome = handler.use({
        state,
        user,
        def,
        request,
        active: slot.active ?? null,
        setActive(active) {
          if (active) slot.active = active;
          else delete slot.active;
        },
        ...(target ? { target } : {}),
        now: () => clock.now(),
        rng,
        emit,
        updateStandings: options.updateStandings,
        balls: options.balls,
        effects,
        hit: (targetId, land) => applyItemHit(playerId, targetId, def.id, land),
        targets: () => targetsFor(playerId, def.id),
        placeTrap: (at) => placeTrap(playerId, at),
      });
      if (!outcome.ok) return deny(playerId, slot.item, outcome.reason);
      if (!outcome.keep) slots.delete(playerId);
      sendSlot(playerId);
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
      hits.clear();
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
