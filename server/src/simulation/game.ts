import {
  BALL_RADIUS,
  distanceToSegmentSq,
  ITEM_CATALOGUE,
  ITEM_TUNING,
  MAGNET_ACCEL,
  MAGNET_RANGE,
  MAX_PLAYERS,
  MAX_THROW_SPEED,
  NUKE_BLAST_MIN_SPEED,
  NUKE_BLAST_MS,
  NUKE_BLAST_RANGE,
  NUKE_BLAST_SPEED,
  NUKE_SIREN_MS,
  REST_DURATION_MS,
  REST_SPEED,
  type AdminMode,
  type CourseData,
  type CourseSummary,
  type GameSettings,
  type ItemCatalogue,
  type ItemId,
  EMOTE_KINDS,
  type EmoteKind,
  type ItemTuning,
  type MagnetPolarity,
  type NukeAftermath,
  type PaintStrokeEdit,
  type PlayerState,
  type RoomState,
  type TerrainEdit,
  type Vec2,
  type WallEdit,
  wallTouches,
  XRAY_AIM_STALE_MS,
  XRAY_INTERVAL_MS,
} from "@troll-golf/shared";
import {
  createAdminPowers,
  type AdminBallControl,
  type AdminCupControl,
  type AdminEffectControl,
  type AdminMagnetControl,
  type AdminWallControl,
  type AdminLogEntry,
  type AdminNukeControl,
  type AdminTerrainControl,
} from "./admin";
import type { Clock } from "./clock";
import { everyone, toAdmin, toPlayer, type GameEvent } from "./events";
import type { Intent, IntentResult } from "./intents";
import { EFFECT_DEFINITIONS } from "./effectKinds";
import { createEffectSystem, type EffectLogEntry } from "./effects";
import { ITEM_HANDLERS } from "./itemHandlers";
import { createItemSystem, type ItemBallControl, type ItemHandlerRegistry, type ItemLogEntry } from "./items";
import { PHYSICS_STEP_MS, PhysicsWorld } from "./physics";
import { ADMIN_POWERS } from "./powers";
import type { Rng } from "./random";
import { courseSurfaces, isHazard, pointInPolygon, shotPowerFactor, SURFACE_DAMPING } from "./surfaces";
import { createTerrain, type Terrain } from "./terrain";

export const DEFAULT_SETTINGS: GameSettings = {
  chaosLevel: "normal",
  holeTimerSec: 90,
  strokeCapOverPar: 4,
  itemsEnabled: true,
};

/** Ball colours handed out when a join brings no valid colour. */
const FALLBACK_COLORS = ["#ff4d4d", "#4da6ff", "#ffd24d", "#5cd65c", "#c266ff", "#ff9f40", "#40e0d0", "#ff66b3"];
const MAX_NAME_LENGTH = 16;

/** Launch speed of a full-power shot, px/s. On Fairway it rolls roughly 1000 px before stopping. */
export const MAX_SHOT_SPEED = 1100;
/** Consecutive slow physics steps before a ball counts as at rest (300 ms at 60 Hz). */
const REST_STEPS = Math.round(REST_DURATION_MS / PHYSICS_STEP_MS);
/** A long stall (e.g. a paused server) is not caught up beyond this many steps. */
const MAX_STEPS_PER_CALL = 15;
/** Speed (px/s) a Boost Pad of strength 1 adds. */
export const BOOST_IMPULSE = 500;
/**
 * A ball inside the Cup's capture radius drops in only below this speed (px/s);
 * faster, it lips out and keeps rolling. On Fairway a ball this fast would roll
 * on for about 150 px.
 */
export const CUP_CAPTURE_SPEED = 220;

/** A moving ball that comes within this many px of the Cup's edge without dropping in is a near-miss. */
export const NEAR_MISS_MARGIN = 36;
/** Slower than this, a ball drifting by the Cup is not worth a slow-mo. */
export const NEAR_MISS_MIN_SPEED = 90;
/** Wall clinks: slower hits are silent, and one ball clinks at most this often. */
export const WALL_HIT_MIN_SPEED = 80;
export const WALL_HIT_GAP_MS = 120;
/** One emote per Player per this long. */
export const EMOTE_GAP_MS = 1000;
/**
 * Synced-state budget for terrain edits per Hole: at most this many edits,
 * this many points in all, and this many points per stroke (a longer brush
 * stroke carries on as a new one). Every client gets the whole list.
 */
export const MAX_TERRAIN_EDITS = 48;
export const MAX_TERRAIN_POINTS = 1500;
export const MAX_STROKE_POINTS = 64;
/** A brush point closer than this fraction of the brush radius to the previous one adds nothing and is dropped. */
const STROKE_SPACING = 0.4;
/** The 3-2-1 before each Hole. */
export const COUNTDOWN_MS = 3000;
/** The scoreboard between Holes. */
export const SCOREBOARD_MS = 8000;
/** Strokes added to an unfinished Player's score when the Hole timer runs out (before the stroke cap). */
export const UNFINISHED_PENALTY = 2;
/** Balls joining at the same time line up around the Tee instead of on top of each other. */
const TEE_SPACING = BALL_RADIUS * 2.5;
const TEE_SLOTS: Vec2[] = [
  { x: 0, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
];

export interface CreateGameOptions {
  /** The Course the room starts with. */
  course: CourseData;
  /**
   * Courses the room creator may pick from in the lobby, by id. The starting
   * `course` is always included.
   */
  courses?: Readonly<Record<string, CourseData>>;
  /** The room code shown to Players. */
  code: string;
  settings?: Partial<GameSettings>;
  rng: Rng;
  clock: Clock;
  /**
   * Item data and handlers; defaults to ITEM_CATALOGUE, ITEM_TUNING and
   * ITEM_HANDLERS. Tests swap in other data (weights, durations) or extra
   * handlers.
   */
  items?: { catalogue?: ItemCatalogue; tuning?: ItemTuning; handlers?: ItemHandlerRegistry };
}

/**
 * The Game simulation: every rule of Troll Golf lives behind this interface.
 * It knows nothing about Colyseus, Phaser or sockets.
 */
export interface Game {
  /** Apply one intent from a Player's session. Rejected intents change nothing. */
  handleIntent(playerId: string, intent: Intent): IntentResult;
  /** Advance the simulation by `dtMs` milliseconds. */
  step(dtMs: number): void;
  /** The current public room state. Read-only: never mutate it. */
  getState(): Readonly<RoomState>;
  /** Outbound events since the last drain, oldest first, each tagged with its audience. */
  drainEvents(): GameEvent[];
  /**
   * The Admin's Player id, or null. Server-only: the adapter uses it to route
   * admin-audience events and hand out the admin bundle. Never synced.
   */
  getAdminId(): string | null;
  /** Every Admin Power use so far, oldest first, timestamped. Server-only, never synced. */
  getAdminLog(): readonly AdminLogEntry[];
  /** Every Item pickup and use so far, oldest first, timestamped. Server-only, never synced. */
  getItemLog(): readonly ItemLogEntry[];
  /** The Item a Player holds, or null. Server-only: held Items are private (ticket 20's x-ray). */
  getHeldItem(playerId: string): ItemId | null;
  /** Every Effect start and end so far, with sources. Server-only, never synced (ticket 23's Recap, 20's x-ray). */
  getEffectLog(): readonly EffectLogEntry[];
}

/**
 * The score of a Player who hasn't Holed Out when the Hole ends:
 * min(Strokes + 2, stroke cap), with the stroke cap at Par + strokeCapOverPar.
 */
export function unfinishedScore(strokes: number, par: number, strokeCapOverPar: number): number {
  return Math.min(strokes + UNFINISHED_PENALTY, par + strokeCapOverPar);
}

/**
 * Whether a Player's ball is a body in the physics world: on the course, its
 * Player connected and actually playing this Hole. Every other ball stays
 * frozen where its state says, with no collisions at all.
 */
function hasBallInPlay(player: Readonly<PlayerState>): boolean {
  return player.connected && !player.holedOut && !player.spectating;
}

/** Standing distance for a late joiner who has no ball on the course: behind everyone. */
const NOT_ON_COURSE_DISTANCE = 1e9;

export function createGame(options: CreateGameOptions): Game {
  // Every roll comes from options.rng so tests stay deterministic.
  const { clock } = options;
  let course = options.course;
  const catalogue: Readonly<Record<string, CourseData>> = { ...options.courses, [course.id]: course };
  for (const c of Object.values(catalogue)) {
    if (c.holes.length === 0) throw new Error(`Course "${c.id}" has no Holes`);
  }
  const courseList: CourseSummary[] = Object.values(catalogue).map((c) => ({ id: c.id, name: c.name, holes: c.holes.length }));

  const firstHole = course.holes[0]!;
  const state: RoomState = {
    code: options.code,
    phase: "lobby",
    creatorId: "",
    leaderId: "",
    courseId: course.id,
    holeIndex: 0,
    holeEndsAt: 0,
    phaseEndsAt: 0,
    pars: course.holes.map((h) => h.par),
    cup: { ...firstHole.cup },
    obstacleTimeMs: 0,
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    players: {},
    terrainEdits: [],
    itemBoxes: [],
    traps: [],
  };
  let events: GameEvent[] = [];
  let joinCount = 0;
  // When each Player joined (a join counter): the last Standing tiebreak and who takes over running the lobby.
  const joinOrder = new Map<string, number>();
  // Simulation time in ms, advanced in fixed physics steps by step().
  let elapsedMs = 0;
  // Time handed to step() that hasn't been simulated yet (less than one step).
  let pendingMs = 0;

  const currentHole = () => course.holes[state.holeIndex]!;

  // The surface lookup of the current Hole: its own zones under the terrain
  // edits (which live in state.terrainEdits). Rebuilt by startHole().
  let surfaces: Terrain = createTerrain(courseSurfaces(currentHole()), state.terrainEdits);
  // The Admin's current brush stroke (Terrain Paint), by edit id; next edit id. Server-only.
  let activeStroke: number | null = null;
  let nextEditId = 1;
  // Magnet/Repel: master switch and per-Player overrides (default: Admin attract, others repel). Server-only, reset each Hole.
  let magnetOn = false;
  const magnetPolarity = new Map<string, MagnetPolarity>();
  // The physics world of the current Hole, rebuilt by startHole().
  let physics = newPhysicsWorld();
  // Boost Pads / Teleporters a ball is currently inside, so each fires once per entry.
  const insidePads = new Map<string, Set<number>>();
  const portalLocked = new Set<string>();
  // Consecutive physics steps each moving ball has spent under REST_SPEED.
  const slowSteps = new Map<string, number>();
  // Balls inside the Cup's capture radius that already lipped out, so each pass lips out once.
  const lippedOut = new Set<string>();
  /** Balls on a pass near the Cup: the closest they have been, and whether they were fast enough to count. */
  const nearPass = new Map<string, { min: number; fast: boolean }>();
  const lastWallHitAt = new Map<string, number>();
  const lastEmoteAt = new Map<string, number>();
  // Players whose next would-be hole-out lips out instead (Lip-Out). Server-only, never synced.
  const pendingLipOut = new Set<string>();
  // Balls just popped out by a Lip-Out: they can't drop in until they have left the capture radius.
  const poppedOut = new Set<string>();
  // A sliding Cup (Move the Cup): drifts away from balls within `trigger` px at `speed` px/s. Server-only.
  let cupSlide: { trigger: number; speed: number } | null = null;
  // Balls in the Cup's no-collision zone, where other balls pass through them.
  const cupGuarded = new Set<string>();
  // Players who left mid-game for good. They stay in state (their scores
  // count) but can't reconnect and don't take up a seat.
  const gone = new Set<string>();
  // Players connected at some point while the current Hole was set up or
  // played. Anyone else missed the whole Hole and is scored at its stroke cap.
  const presentThisHole = new Set<string>();
  // Each Player's last shot on this Hole, for Mulligan: where the ball was
  // before it and the penalty Strokes since. Cleared when a Hole (re)starts.
  const lastShots = new Map<string, { from: Vec2; penalties: number }>();
  // Who last knocked each ball with the Golf Gun, for "sniped X into the lake". Server-only.
  const snipers = new Map<string, { name: string; until: number }>();
  const SNIPE_CREDIT_MS = 5000;

  const emit = (event: GameEvent) => events.push(event);
  // The secret Admin and the Admin Power pipeline. Server-only: nothing in here reaches RoomState.
  const admin = createAdminPowers({
    registry: ADMIN_POWERS,
    clock,
    state,
    emit,
    updateStandings: () => updateStandings(),
    balls: ballControl(),
    nukes: nukeControl(),
    cup: cupControl(),
    terrain: terrainControl(),
    magnet: magnetControl(),
    walls: wallControl(),
    effects: effectControl(),
    // Defined below; only called once the game runs. None of these go through the Item Hit path.
    items: {
      give: (playerId, item) => items.give(playerId, item),
      rig: (playerId, item) => items.rig(playerId, item),
      setGodMode: (enabled, mode) => {
        const adminId = admin.adminId;
        if (adminId !== null) items.setGodMode(adminId, enabled, mode);
      },
    },
  });
  // Where each Player is aiming right now (only the Admin's x-ray reads it). Server-only.
  const aims = new Map<string, { angle: number; power: number; at: number }>();
  let xrayAccumMs = 0;
  // The Effects engine: Frozen, Shielded..., immunity windows. Visible Effects are mirrored into PlayerState.effects.
  const effects = createEffectSystem({
    state,
    clock,
    emit,
    registry: EFFECT_DEFINITIONS,
    balls: {
      pin(playerId, pinned) {
        if (!physics.hasBall(playerId)) return;
        physics.setPinned(playerId, pinned);
        const ball = state.players[playerId]?.ball;
        if (pinned && ball) {
          ball.vx = 0;
          ball.vy = 0;
        }
      },
      setGhost(playerId, ghost) {
        if (!physics.hasBall(playerId) || physics.isGhost(playerId) === ghost) return;
        physics.setCollisions(playerId, { walls: !ghost, balls: !cupGuarded.has(playerId) });
      },
      pullToCup: (playerId, accel) => pullBallToCup(playerId, accel),
      settle(playerId) {
        const ball = state.players[playerId]?.ball;
        if (!ball || !physics.hasBall(playerId) || held?.id === playerId) return;
        const spot = legalRestSpot({ x: ball.x, y: ball.y });
        if (spot.x !== ball.x || spot.y !== ball.y) {
          physics.teleport(playerId, spot);
          ball.x = spot.x;
          ball.y = spot.y;
          ball.vx = 0;
          ball.vy = 0;
        }
        if (ball.atRest) ball.restSpot = { ...spot };
      },
    },
  });
  // Item Boxes, the draw, held Items and their use. Held Items are server-only (private to their holder).
  const items = createItemSystem({
    state,
    clock,
    rng: options.rng,
    emit,
    updateStandings: () => updateStandings(),
    catalogue: options.items?.catalogue ?? ITEM_CATALOGUE,
    tuning: options.items?.tuning ?? ITEM_TUNING,
    handlers: options.items?.handlers ?? ITEM_HANDLERS,
    balls: itemBallControl(),
    effects,
  });
  items.setupHole(firstHole);

  function itemBallControl(): ItemBallControl {
    return {
      lastShot: (playerId) => {
        const shot = lastShots.get(playerId);
        return shot ? { from: { ...shot.from }, penalties: shot.penalties } : null;
      },
      clearLastShot: (playerId) => void lastShots.delete(playerId),
      push(playerId, delta, byName) {
        const player = state.players[playerId];
        if (!player || !physics.hasBall(playerId)) return;
        physics.addVelocity(playerId, delta);
        const motion = physics.motion(playerId);
        player.ball.vx = motion.vx;
        player.ball.vy = motion.vy;
        player.ball.atRest = false;
        slowSteps.set(playerId, 0);
        snipers.set(playerId, { name: byName, until: clock.now() + SNIPE_CREDIT_MS });
      },
      cupPosition: () => ({ x: state.cup.x, y: state.cup.y }),
      canSwap: (playerId) => {
        const player = state.players[playerId];
        return !!player && state.phase === "playing" && hasBallInPlay(player) && physics.hasBall(playerId) && !physics.isPinned(playerId) && held?.id !== playerId;
      },
      swap(aId, bId) {
        const control = itemBallControl();
        if (aId === bId || !control.canSwap(aId) || !control.canSwap(bId)) return false;
        const a = state.players[aId]!.ball;
        const b = state.players[bId]!.ball;
        const posA = { x: a.x, y: a.y };
        const posB = { x: b.x, y: b.y };
        const move = (id: string, ball: PlayerState["ball"], to: Vec2) => {
          // A ghost caught inside a wall mid-flight must not drop its partner into it.
          const dest = legalBallSpot(to) ? to : legalRestSpot(to);
          physics.teleport(id, dest, { x: ball.vx, y: ball.vy });
          ball.x = dest.x;
          ball.y = dest.y;
          // Each ball keeps its own velocity; a resting ball's new place is its Rest Spot, a rolling ball keeps the one it left from.
          if (ball.atRest) ball.restSpot = { ...dest };
          insidePads.delete(id);
          portalLocked.delete(id);
        };
        move(aId, a, posB);
        move(bId, b, posA);
        return true;
      },
      holeSize: () => ({ width: currentHole().width, height: currentHole().height }),
      placeAtRest(playerId, at) {
        const player = state.players[playerId]!;
        // The Admin loses their grip on it.
        if (held?.id === playerId) held = null;
        physics.removeBall(playerId);
        forgetBall(playerId);
        const spot = dryReturnSpot(at);
        player.ball = { x: spot.x, y: spot.y, vx: 0, vy: 0, atRest: true, restSpot: { ...spot } };
        addBody(player);
        return spot;
      },
    };
  }

  // ---- Ball Grab: the Admin holds one ball at a time ----

  /**
   * The ball the Admin is holding. It has no physics body (nothing touches it),
   * is flagged as moving so it can't be shot, and follows the Admin's drag.
   * Only balls in play can be held: a Holed-Out, disconnected or waiting
   * late-joiner ball has no body to take. Server-only, never synced.
   */
  let held: { id: string; mode: AdminMode; lastMoveAt: number } | null = null;

  /** Whether a ball centre may be here: inside the Hole and not inside a wall. */
  function legalBallSpot(p: Vec2): boolean {
    const { width, height, walls } = currentHole();
    return (
      p.x >= BALL_RADIUS && p.y >= BALL_RADIUS && p.x <= width - BALL_RADIUS && p.y <= height - BALL_RADIUS &&
      !walls.some((w) => pointInPolygon(p, w)) &&
      !surfaces.edits.some((e) => e.kind === "wall" && wallTouches(e, p, BALL_RADIUS))
    );
  }

  function ballControl(): AdminBallControl {
    return {
      get held() {
        return held ? { id: held.id, mode: held.mode } : null;
      },
      grab(id, mode) {
        const player = state.players[id];
        if (!player) return { ok: false, reason: "unknown_target" };
        if (state.phase !== "playing" || !hasBallInPlay(player) || (!physics.hasBall(id) && held?.id !== id)) {
          return { ok: false, reason: "not_in_play" };
        }
        if (held && held.id !== id) putDown(held.id, state.players[held.id]!.ball, undefined);
        if (held?.id === id) {
          held.mode = mode;
        } else {
          removeBody(player);
          held = { id, mode, lastMoveAt: clock.now() };
        }
        player.ball.atRest = false;
        return { ok: true, name: player.name, at: { x: player.ball.x, y: player.ball.y } };
      },
      move(x, y) {
        if (!held) return false;
        const ball = state.players[held.id]!.ball;
        const to = { x, y };
        if (!legalBallSpot(to)) return true; // dragged over a wall or off the map: the ball stays at the last legal spot
        const now = clock.now();
        const dt = Math.max(now - held.lastMoveAt, 1) / 1000;
        held.lastMoveAt = now;
        // The drag's velocity, so the held ball reads as a moving one.
        const limit = MAX_THROW_SPEED;
        const vx = clamp((to.x - ball.x) / dt, -limit, limit);
        const vy = clamp((to.y - ball.y) / dt, -limit, limit);
        ball.x = to.x;
        ball.y = to.y;
        ball.vx = vx;
        ball.vy = vy;
        return true;
      },
      release(x, y, velocity) {
        if (!held) return false;
        const id = held.id;
        const ball = state.players[id]!.ball;
        if (legalBallSpot({ x, y })) {
          ball.x = x;
          ball.y = y;
        }
        putDown(id, ball, velocity);
        return true;
      },
    };
  }

  /**
   * Back under the normal rules: the ball gets a body where it is, at rest or
   * thrown, and is checked at once against the Cup and hazards (a ball placed
   * at rest never moves, so the per-step checks wouldn't catch it).
   */
  function putDown(id: string, ball: PlayerState["ball"], velocity: Vec2 | undefined): void {
    held = null;
    const player = state.players[id]!;
    const at = { x: ball.x, y: ball.y };
    physics.addBall(id, at);
    slowSteps.set(id, 0);
    const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
    if (velocity && speed >= REST_SPEED) {
      physics.setVelocity(id, velocity);
      ball.vx = velocity.x;
      ball.vy = velocity.y;
      ball.atRest = false;
    } else {
      ball.vx = 0;
      ball.vy = 0;
      ball.atRest = true;
      // Water and Void aren't a place to rest: the penalty returns it to the old Rest Spot.
      if (!isHazard(surfaces.at(at))) ball.restSpot = at;
    }
    if (checkCup(player)) return;
    if (isHazard(surfaces.at(at))) sinkBall(player, at);
  }

  /** The Admin lets go without choosing: the held ball stays where it is, at rest (or is simply forgotten if it has no body to return to). */
  function dropHeld(): void {
    if (!held) return;
    const player = state.players[held.id];
    const id = held.id;
    if (player && state.phase === "playing" && hasBallInPlay(player)) putDown(id, player.ball, undefined);
    else if (player) player.ball.atRest = true;
    held = null;
  }

  // ---- Nuke: siren, blast, aftermath ----

  /**
   * The Nuke in progress, if any (only one at a time). Timed by the injected
   * Clock from `advancePhase`, so it is deterministic and no client decides
   * anything. Server-only, never synced.
   *
   * - siren (until `blastAt`): fx only; no ball is touched.
   * - blast (at `blastAt`): every ball with a body is pushed outward from the
   *   impact point. A held ball is put down first. Holed-Out, disconnected and
   *   spectating balls have no body and don't move.
   * - aftermath (at `doneAt`): Wipe or Reset.
   * It is cancelled (fx `nukeAbort`) if the Hole ends first, and dropped by a new Hole.
   */
  let nuke: { x: number; y: number; aftermath: NukeAftermath; blastAt: number; doneAt: number; blasted: boolean } | null = null;

  // ---- Cup powers: Move the Cup, Cup Size, Lip-Out ----

  function cupControl(): AdminCupControl {
    return {
      teleport(x, y) {
        if (!legalCupSpot({ x, y })) return { ok: false, reason: "invalid_payload" };
        cupSlide = null;
        state.cup.x = x;
        state.cup.y = y;
        lippedOut.clear();
        poppedOut.clear();
        return { ok: true };
      },
      slide(trigger, speed) {
        cupSlide = { trigger, speed };
      },
      resize(radius) {
        state.cup.radius = radius;
      },
      armLipOut(playerId) {
        const player = state.players[playerId];
        if (!player) return { ok: false, reason: "unknown_target" };
        if (player.holedOut || player.spectating) return { ok: false, reason: "no_ball_in_play" };
        pendingLipOut.add(playerId);
        return { ok: true, name: player.name };
      },
    };
  }

  /** Whether the Cup may be centred here: inside the Hole and not inside a wall. */
  function legalCupSpot(p: Vec2): boolean {
    const { width, height, walls } = currentHole();
    return (
      p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height && !walls.some((w) => pointInPolygon(p, w)) &&
      !surfaces.edits.some((e) => e.kind === "wall" && wallTouches(e, p, state.cup.radius))
    );
  }

  /** A sliding Cup backs away from the nearest ball inside its trigger distance, steering round walls and edges. */
  function slideCup(dtMs: number): void {
    if (!cupSlide) return;
    const cup = state.cup;
    let nearest: PlayerState | null = null;
    let nearestDistance = cupSlide.trigger;
    for (const player of Object.values(state.players)) {
      if (!physics.hasBall(player.id)) continue;
      const d = Math.hypot(player.ball.x - cup.x, player.ball.y - cup.y);
      if (d <= nearestDistance) {
        nearest = player;
        nearestDistance = d;
      }
    }
    if (!nearest) return;
    const away = nearestDistance < 1e-6 ? options.rng.next() * Math.PI * 2 : Math.atan2(cup.y - nearest.ball.y, cup.x - nearest.ball.x);
    const step = (cupSlide.speed * dtMs) / 1000;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const next = { x: cup.x + Math.cos(away + turn) * step, y: cup.y + Math.sin(away + turn) * step };
      if (!legalCupSpot(next)) continue;
      cup.x = next.x;
      cup.y = next.y;
      return;
    }
  }

  /** Add `accel` px/s^2 (negative pushes away) toward the Cup to a rolling ball's velocity for one physics step. */
  function pullBallToCup(playerId: string, accel: number): void {
    const ball = state.players[playerId]?.ball;
    if (!ball || !physics.hasBall(playerId) || ball.atRest || physics.isPinned(playerId)) return;
    const dx = state.cup.x - ball.x;
    const dy = state.cup.y - ball.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const dv = (accel * PHYSICS_STEP_MS) / 1000;
    physics.addVelocity(playerId, { x: (dx / dist) * dv, y: (dy / dist) * dv });
  }

  // ---- Magnet/Repel ----

  const magnetPolarityOf = (playerId: string): MagnetPolarity =>
    magnetPolarity.get(playerId) ?? (playerId === admin.adminId ? "attract" : "repel");

  function magnetControl(): AdminMagnetControl {
    return {
      setEnabled(enabled) {
        magnetOn = enabled;
      },
      setPolarity(playerId, polarity) {
        const player = state.players[playerId];
        if (!player) return { ok: false, reason: "unknown_target" };
        magnetPolarity.set(playerId, polarity);
        return { ok: true, name: player.name };
      },
    };
  }

  /** Each physics step: rolling balls within range of the Cup curve toward it or away from it. */
  function applyMagnet(): void {
    if (!magnetOn) return;
    for (const player of Object.values(state.players)) {
      if (!physics.hasBall(player.id)) continue;
      const polarity = magnetPolarityOf(player.id);
      if (polarity === "off") continue;
      if (Math.hypot(player.ball.x - state.cup.x, player.ball.y - state.cup.y) > MAGNET_RANGE) continue;
      pullBallToCup(player.id, polarity === "attract" ? MAGNET_ACCEL : -MAGNET_ACCEL);
    }
  }

  // ---- Invert Controls ----

  function effectControl(): AdminEffectControl {
    return {
      invertControls(playerId, durationMs, hidden) {
        const player = state.players[playerId];
        if (!player) return { ok: false, reason: "unknown_target" };
        if (!player.connected || player.holedOut || player.spectating) return { ok: false, reason: "no_ball_in_play" };
        // Straight onto the Effects engine: no Shield, immunity, cap or chaos scaling.
        effects.start("invertControls", { sourceId: admin.adminId ?? playerId, targetId: playerId, durationMs, scaled: false, hidden });
        return { ok: true, name: player.name };
      },
    };
  }

  // ---- Spawn Wall ----

  function wallControl(): AdminWallControl {
    return {
      spawn(rawA, rawB, thickness, durationMs) {
        if (state.terrainEdits.length >= MAX_TERRAIN_EDITS || surfaces.pointCount + 2 > MAX_TERRAIN_POINTS) {
          return { ok: false, reason: "terrain_full" };
        }
        const { width, height } = currentHole();
        const a = { x: Math.round(clamp(rawA.x, 0, width)), y: Math.round(clamp(rawA.y, 0, height)) };
        const b = { x: Math.round(clamp(rawB.x, 0, width)), y: Math.round(clamp(rawB.y, 0, height)) };
        const radius = thickness / 2;
        // Never wall the Cup in: the wall may not touch its capture circle.
        if (distanceToSegmentSq(state.cup, a, b) < (radius + state.cup.radius) ** 2) return { ok: false, reason: "wall_blocked" };
        const wall: WallEdit = { kind: "wall", id: nextEditId++, points: [a, b], radius, expiresAt: durationMs !== undefined ? clock.now() + durationMs : 0 };
        surfaces.add(wall);
        physics.addWall(wall.id, a, b, radius);
        pushBallsClear(wall);
        return { ok: true };
      },
      clear() {
        return removeWalls((e) => e.kind === "wall");
      },
    };
  }

  /** Remove terrain edits matching `drop`, with the physics bodies of any walls among them. Returns how many walls went. */
  function removeWalls(drop: (edit: TerrainEdit) => boolean): number {
    let walls = 0;
    for (const edit of surfaces.remove(drop)) {
      if (edit.kind !== "wall") continue;
      physics.removeWall(edit.id);
      walls++;
    }
    return walls;
  }

  /** A freshly spawned wall may not sit on a ball: move each overlapped ball (not a ghost mid-flight) to the nearest legal spot beside it. */
  function pushBallsClear(wall: WallEdit): void {
    const [a, b] = wall.points;
    for (const player of Object.values(state.players)) {
      const id = player.id;
      if (!physics.hasBall(id) || physics.isGhost(id) || held?.id === id) continue;
      const ball = player.ball;
      if (!wallTouches(wall, ball, BALL_RADIUS)) continue;
      // Nearest point on the wall's centre line, and the way out from it (either side if the ball is dead centre).
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : clamp(((ball.x - a.x) * dx + (ball.y - a.y) * dy) / lengthSq, 0, 1);
      const q = { x: a.x + t * dx, y: a.y + t * dy };
      let ox = ball.x - q.x;
      let oy = ball.y - q.y;
      let length = Math.hypot(ox, oy);
      if (length < 1e-6) {
        const n = Math.hypot(dx, dy) || 1;
        ox = -dy / n;
        oy = dx / n;
        length = 1;
      }
      const reach = wall.radius + BALL_RADIUS + 1;
      let spot: Vec2 | null = null;
      for (const side of [1, -1]) {
        const candidate = { x: q.x + (side * ox * reach) / length, y: q.y + (side * oy * reach) / length };
        if (legalBallSpot(candidate) && !isHazard(surfaces.at(candidate))) {
          spot = candidate;
          break;
        }
      }
      spot ??= legalRestSpot({ x: ball.x, y: ball.y });
      physics.teleport(id, spot, { x: ball.vx, y: ball.vy });
      ball.x = spot.x;
      ball.y = spot.y;
      if (ball.atRest) ball.restSpot = { ...spot };
    }
  }

  // ---- Terrain Paint ----

  /** Fresh terrain for the current Hole: its own zones, no edits. */
  function resetTerrain(): void {
    state.terrainEdits = [];
    surfaces = createTerrain(courseSurfaces(currentHole()), state.terrainEdits);
    activeStroke = null;
  }

  function terrainControl(): AdminTerrainControl {
    /** Into the Hole, rounded to whole px (smaller patches). */
    const clampToHole = (p: Vec2): Vec2 => {
      const { width, height } = currentHole();
      return { x: Math.round(clamp(p.x, 0, width)), y: Math.round(clamp(p.y, 0, height)) };
    };
    const full = (newPoints: number) =>
      state.terrainEdits.length >= MAX_TERRAIN_EDITS || surfaces.pointCount + newPoints > MAX_TERRAIN_POINTS;

    /** Points far enough from the one before (the stroke's last, if any) to add something. */
    function spaced(points: readonly Vec2[], radius: number, after: Vec2 | undefined): Vec2[] {
      const kept: Vec2[] = [];
      let last = after;
      for (const raw of points) {
        const p = clampToHole(raw);
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < radius * STROKE_SPACING) continue;
        kept.push(p);
        last = p;
      }
      return kept;
    }

    function newStroke(base: Omit<PaintStrokeEdit, "id" | "points">, points: Vec2[]): PaintStrokeEdit {
      const stroke: PaintStrokeEdit = { ...base, id: nextEditId++, points: [] };
      stroke.points.push(...points);
      surfaces.add(stroke);
      activeStroke = stroke.id;
      return stroke;
    }

    return {
      paint(surface, radius, rawPoints, durationMs) {
        const points = spaced(rawPoints, radius, undefined).slice(0, MAX_STROKE_POINTS);
        if (full(points.length)) return { ok: false, reason: "terrain_full" };
        const expiresAt = durationMs !== undefined ? clock.now() + durationMs : 0;
        newStroke({ kind: "paint", surface, radius, expiresAt }, points);
        return { ok: true };
      },
      extend(rawPoints) {
        const found = state.terrainEdits.find((e) => e.id === activeStroke);
        if (!found || found.kind !== "paint") return { ok: false, reason: "no_stroke" };
        let stroke = found;
        const points = spaced(rawPoints, stroke.radius, stroke.points.at(-1));
        if (points.length > 0 && surfaces.pointCount + points.length > MAX_TERRAIN_POINTS) return { ok: false, reason: "terrain_full" };
        for (const p of points) {
          if (stroke.points.length >= MAX_STROKE_POINTS) {
            // A long stroke carries on as a new one starting where it ended.
            if (state.terrainEdits.length >= MAX_TERRAIN_EDITS) return { ok: false, reason: "terrain_full" };
            const { kind, surface, radius, expiresAt } = stroke;
            stroke = newStroke({ kind, surface, radius, expiresAt }, [stroke.points.at(-1)!]);
          }
          surfaces.extend(stroke, [p]);
        }
        return { ok: true };
      },
      clear() {
        activeStroke = null;
        return surfaces.remove((e) => e.kind === "paint").length;
      },
    };
  }

  /** Edits whose time is up disappear. */
  function expireTerrain(): void {
    const now = clock.now();
    removeWalls((e) => e.expiresAt > 0 && e.expiresAt <= now);
  }

  /**
   * Where a sunk ball goes back to: its Rest Spot, unless the ground there has
   * since become Water or Void (painted over), in which case the nearest dry
   * spot around it, else the Tee.
   */
  function dryReturnSpot(from: Vec2): Vec2 {
    if (!isHazard(surfaces.at(from))) return { ...from };
    return nearestDrySpot(from);
  }

  /** A ball centre that is legal (inside the Hole, outside every wall) and has no Water or Void within a ball radius. */
  function isDryLegal(p: Vec2): boolean {
    return (
      legalBallSpot(p) &&
      [p, { x: p.x + BALL_RADIUS, y: p.y }, { x: p.x - BALL_RADIUS, y: p.y }, { x: p.x, y: p.y + BALL_RADIUS }, { x: p.x, y: p.y - BALL_RADIUS }].every(
        (q) => !isHazard(surfaces.at(q)),
      )
    );
  }

  /** Where a ball that came to rest may stay: here if it is legal (not inside a wall or off the Hole), else the nearest dry legal spot. */
  function legalRestSpot(from: Vec2): Vec2 {
    if (legalBallSpot(from) && !isHazard(surfaces.at(from))) return { ...from };
    return nearestDrySpot(from);
  }

  function nearestDrySpot(from: Vec2): Vec2 {
    const dry = isDryLegal;
    const tee = currentHole().tee;
    for (const centre of [from, tee]) {
      for (let r = BALL_RADIUS * 2; r <= 1200; r += BALL_RADIUS * 2) {
        const around = Math.max(8, Math.ceil((2 * Math.PI * r) / (BALL_RADIUS * 3)));
        for (let k = 0; k < around; k++) {
          const a = (k / around) * Math.PI * 2;
          const p = { x: Math.round(centre.x + Math.cos(a) * r), y: Math.round(centre.y + Math.sin(a) * r) };
          if (dry(p)) return p;
        }
      }
    }
    return { ...tee };
  }

  function nukeControl(): AdminNukeControl {
    return {
      launch(x, y, aftermath) {
        if (nuke) return { ok: false, reason: "nuke_pending" };
        const { width, height } = currentHole();
        if (x < 0 || y < 0 || x > width || y > height) return { ok: false, reason: "invalid_payload" };
        const now = clock.now();
        nuke = { x, y, aftermath, blastAt: now + NUKE_SIREN_MS, doneAt: now + NUKE_SIREN_MS + NUKE_BLAST_MS, blasted: false };
        emit({ type: "fx", payload: { kind: "nukeSiren", x, y }, audience: everyone });
        return { ok: true };
      },
    };
  }

  function advanceNuke(): void {
    if (!nuke) return;
    const now = clock.now();
    if (!nuke.blasted && now >= nuke.blastAt) blastBalls(nuke.x, nuke.y);
    if (nuke.blasted && now >= nuke.doneAt) {
      const { aftermath } = nuke;
      nuke = null;
      dropHeld();
      if (aftermath === "reset") resetHole();
      else wipeBalls();
    }
  }

  /** Push every ball with a body away from the impact point; the nearer, the harder. */
  function blastBalls(x: number, y: number): void {
    if (!nuke) return;
    nuke.blasted = true;
    dropHeld();
    emit({ type: "fx", payload: { kind: "nukeBlast", x, y }, audience: everyone });
    for (const player of Object.values(state.players)) {
      if (!physics.hasBall(player.id)) continue;
      const ball = player.ball;
      const dx = ball.x - x;
      const dy = ball.y - y;
      const distance = Math.hypot(dx, dy);
      const angle = distance < 1 ? options.rng.next() * Math.PI * 2 : Math.atan2(dy, dx);
      const falloff = Math.max(0, 1 - distance / NUKE_BLAST_RANGE);
      const speed = NUKE_BLAST_MIN_SPEED + (NUKE_BLAST_SPEED - NUKE_BLAST_MIN_SPEED) * falloff;
      const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
      physics.setVelocity(player.id, velocity);
      ball.vx = velocity.x;
      ball.vy = velocity.y;
      ball.atRest = false;
      slowSteps.set(player.id, 0);
    }
  }

  /** Put a ball on the Tee at rest (with a fresh body if it should have one). */
  function sendToTee(player: PlayerState, taken: Vec2[]): void {
    physics.removeBall(player.id);
    forgetBall(player.id);
    const spot = teeSpot(taken);
    taken.push(spot);
    placeOnTee(player, spot);
    addBody(player);
  }

  /**
   * Wipe: every ball still on the course goes back to the Tee at rest
   * (disconnected ones too; they have no body until they return). Strokes are
   * kept, Holed-Out Players and waiting late joiners are untouched, the Hole
   * timer keeps running, and so do the obstacles.
   */
  function wipeBalls(): void {
    const taken: Vec2[] = [];
    for (const player of Object.values(state.players)) {
      if (player.holedOut || player.spectating) continue;
      sendToTee(player, taken);
    }
  }

  /**
   * Reset: everyone replays the Hole. Holed-Out Players come back, every ball
   * is on the Tee at rest, this Hole's Strokes are zeroed and the Hole timer
   * restarts. Waiting late joiners keep their scored Hole and keep spectating.
   * The world isn't rebuilt, so obstacles keep their time and the Cup stays
   * wherever it is.
   */
  function resetHole(): void {
    const taken: Vec2[] = [];
    for (const player of Object.values(state.players)) {
      if (player.spectating) continue;
      player.strokes[state.holeIndex] = 0;
      sendToTee(player, taken);
    }
    // This Hole's shots are wiped: nothing left to take back.
    lastShots.clear();
    snipers.clear();
    state.holeEndsAt = clock.now() + state.settings.holeTimerSec * 1000;
    state.phaseEndsAt = state.holeEndsAt;
  }

  function cancelNuke(): void {
    if (!nuke) return;
    emit({ type: "fx", payload: { kind: "nukeAbort", x: nuke.x, y: nuke.y }, audience: everyone });
    nuke = null;
  }

  function newPhysicsWorld(): PhysicsWorld {
    return new PhysicsWorld({
      hole: currentHole(),
      // Reads `surfaces` at call time, so it follows the current Hole.
      dampingScale: (_id, position) => SURFACE_DAMPING[surfaces.at(position)],
    });
  }

  /** A spot on or next to the Tee that none of `taken` covers. */
  function teeSpot(taken: Vec2[]): Vec2 {
    const tee = currentHole().tee;
    const free = (spot: Vec2) => taken.every((b) => Math.hypot(b.x - spot.x, b.y - spot.y) >= BALL_RADIUS * 2);
    const spots = TEE_SLOTS.map((o) => ({ x: tee.x + o.x * TEE_SPACING, y: tee.y + o.y * TEE_SPACING }));
    return spots.find(free) ?? { ...tee };
  }

  /** Balls currently on the course (not in the Cup, not a waiting late joiner's), connected or not. */
  const ballsOnCourse = () =>
    Object.values(state.players)
      .filter((p) => !p.holedOut && !p.spectating)
      .map((p) => p.ball);

  function placeOnTee(player: PlayerState, spot: Vec2): void {
    player.ball = { x: spot.x, y: spot.y, vx: 0, vy: 0, atRest: true, restSpot: { ...spot } };
    player.holedOut = false;
  }

  /** Put every Player's ball on the Tee of the (new) current Hole; only balls in play get a body. */
  function placeEveryoneOnTee(): void {
    const placed: Vec2[] = [];
    for (const player of Object.values(state.players)) {
      forgetBall(player.id);
      player.spectating = false;
      const spot = teeSpot(placed);
      placed.push(spot);
      placeOnTee(player, spot);
      addBody(player);
    }
  }

  /** Give the ball a physics body if it should have one and doesn't, at rest where its state says. */
  function addBody(player: PlayerState): void {
    if (!hasBallInPlay(player) || physics.hasBall(player.id)) return;
    physics.addBall(player.id, player.ball);
    player.ball.vx = 0;
    player.ball.vy = 0;
    player.ball.atRest = true;
    slowSteps.set(player.id, 0);
  }

  /** Take the ball out of the physics world: it stays put in state, touching nothing. */
  function removeBody(player: PlayerState): void {
    physics.removeBall(player.id);
    forgetBall(player.id);
    player.ball.vx = 0;
    player.ball.vy = 0;
    player.ball.atRest = true;
  }

  function forgetBall(id: string): void {
    slowSteps.delete(id);
    insidePads.delete(id);
    portalLocked.delete(id);
    lippedOut.delete(id);
    cupGuarded.delete(id);
    poppedOut.delete(id);
    nearPass.delete(id);
  }

  /**
   * Balls don't collide with each other inside the Cup's capture radius
   * (counting any ball that overlaps it), so nobody can be knocked out of the
   * Cup. A ball in that zone has ball-ball collisions off, and a contact needs
   * both balls to allow it. Applied before every physics step.
   */
  function guardCup(): void {
    const cup = state.cup;
    for (const player of Object.values(state.players)) {
      if (!physics.hasBall(player.id)) continue;
      const inside = Math.hypot(player.ball.x - cup.x, player.ball.y - cup.y) <= cup.radius + BALL_RADIUS;
      if (inside === cupGuarded.has(player.id)) continue;
      if (inside) cupGuarded.add(player.id);
      else cupGuarded.delete(player.id);
      physics.setCollisions(player.id, { walls: !physics.isGhost(player.id), balls: !inside });
    }
  }

  /**
   * Standing: Strokes from earlier Holes plus Strokes so far on this Hole
   * (penalties included), fewest first, with distance to the Cup breaking
   * ties. A Holed-Out Player's distance is 0, so they rank by their final
   * Strokes. Remaining ties go to whoever joined first. The Leader is first
   * in Standing among Players who haven't Holed Out. In the final results
   * (gameEnd) distance no longer counts: equal totals go to more Item Hits.
   */
  function updateStandings(): void {
    const cup = state.cup;
    // Final results: equal totals go to more Item Hits (revealed in PlayerState.itemHits at the end).
    const final = state.phase === "gameEnd";
    const ranked = Object.values(state.players)
      .map((p) => ({
        player: p,
        total: p.strokes.reduce((a, b) => a + b, 0),
        distance: final
          ? 0
          : p.holedOut
            ? 0
            : p.spectating
              ? NOT_ON_COURSE_DISTANCE
              : Math.hypot(p.ball.x - cup.x, p.ball.y - cup.y),
        hits: final ? p.itemHits : 0,
        order: joinOrder.get(p.id) ?? 0,
      }))
      .sort((a, b) => a.total - b.total || b.hits - a.hits || a.distance - b.distance || a.order - b.order);
    ranked.forEach((r, i) => (r.player.standing = i + 1));
    state.leaderId = ranked.find((r) => !r.player.holedOut && !r.player.spectating)?.player.id ?? "";
  }

  // ---- Hole flow: lobby -> countdown -> playing -> holeEnd -> ... -> gameEnd ----

  /**
   * Set up Hole `index` and begin its countdown: a fresh physics world, the
   * Cup back to the Hole's own, every ball on the Tee and nobody Holed Out.
   * Late joiners waiting for this Hole now play it. A disconnected Player's
   * ball waits on the Tee, without a body, until they come back. Everyone is
   * sent the new layout.
   */
  function startHole(index: number): void {
    state.holeIndex = index;
    held = null;
    nuke = null;
    effects.clearAll();
    const hole = currentHole();
    resetTerrain();
    physics = newPhysicsWorld();
    state.cup = { ...hole.cup };
    cupSlide = null;
    magnetOn = false;
    magnetPolarity.clear();
    pendingLipOut.clear();
    poppedOut.clear();
    lastShots.clear();
    snipers.clear();
    state.obstacleTimeMs = 0;
    placeEveryoneOnTee();
    items.setupHole(hole);
    presentThisHole.clear();
    for (const player of Object.values(state.players)) if (player.connected) presentThisHole.add(player.id);
    state.phase = "countdown";
    state.phaseEndsAt = clock.now() + COUNTDOWN_MS;
    state.holeEndsAt = 0;
    emit({ type: "hole", payload: { holeIndex: index, hole }, audience: everyone });
  }

  /** The countdown is over: shots are allowed and the Hole timer runs. */
  function startPlaying(): void {
    state.phase = "playing";
    state.holeEndsAt = clock.now() + state.settings.holeTimerSec * 1000;
    state.phaseEndsAt = state.holeEndsAt;
  }

  /**
   * Score anyone unfinished, freeze the balls and show the scoreboard.
   * Unfinished means min(Strokes + 2, stroke cap), disconnected or not. A
   * Player who was never connected while this Hole was on missed it entirely
   * and gets the stroke cap, like a late joiner (otherwise sitting out a whole
   * Hole would score a cheap Strokes + 2 = 2). Late joiners still waiting were
   * scored when they joined.
   */
  function endHole(): void {
    const par = currentHole().par;
    const cap = par + state.settings.strokeCapOverPar;
    dropHeld();
    cancelNuke();
    items.clearTraps();
    // Effects don't outlive their Hole (a Freeze thaws, a Shield pops quietly).
    effects.clearAll();
    for (const player of Object.values(state.players)) {
      if (player.holedOut || player.spectating) continue;
      if (physics.hasBall(player.id)) physics.stop(player.id);
      player.ball.vx = 0;
      player.ball.vy = 0;
      player.ball.atRest = true;
      const strokes = player.strokes[state.holeIndex] ?? 0;
      player.strokes[state.holeIndex] = presentThisHole.has(player.id)
        ? unfinishedScore(strokes, par, state.settings.strokeCapOverPar)
        : cap;
    }
    state.phase = "holeEnd";
    state.holeEndsAt = 0;
    state.phaseEndsAt = clock.now() + SCOREBOARD_MS;
    emit({ type: "feed", payload: { text: `Hole ${state.holeIndex + 1} over` }, audience: everyone });
  }

  function endGame(): void {
    // Item Hits were server-only during play; now they break ties in the final results.
    for (const player of Object.values(state.players)) player.itemHits = items.itemHits(player.id);
    state.phase = "gameEnd";
    state.phaseEndsAt = 0;
    state.holeEndsAt = 0;
    emit({ type: "feed", payload: { text: "Game over" }, audience: everyone });
  }

  /** Moves the flow on when a phase's time is up or everyone has Holed Out. */
  function advancePhase(): void {
    const now = clock.now();
    switch (state.phase) {
      case "countdown":
        if (now >= state.phaseEndsAt) startPlaying();
        break;
      case "playing": {
        // Disconnected Players and late joiners waiting for the next Hole don't hold the Hole up.
        const players = Object.values(state.players).filter((p) => p.connected && !p.spectating);
        const everyoneIn = players.length > 0 && players.every((p) => p.holedOut);
        if (everyoneIn || now >= state.holeEndsAt) endHole();
        else advanceNuke();
        break;
      }
      case "holeEnd":
        if (now < state.phaseEndsAt) break;
        if (state.holeIndex + 1 < course.holes.length) startHole(state.holeIndex + 1);
        else endGame();
        break;
      default:
        break;
    }
  }

  /** Only the room creator (or whoever took over from them) runs the lobby. */
  function checkCreator(playerId: string): IntentResult {
    if (!state.players[playerId]) return { ok: false, reason: "unknown_player" };
    if (state.phase !== "lobby") return { ok: false, reason: "wrong_phase" };
    if (playerId !== state.creatorId) return { ok: false, reason: "not_creator" };
    return { ok: true };
  }

  function start(playerId: string): IntentResult {
    const allowed = checkCreator(playerId);
    if (!allowed.ok) return allowed;
    for (const player of Object.values(state.players)) {
      player.strokes = course.holes.map(() => 0);
      player.itemHits = 0;
    }
    items.resetAll();
    startHole(0);
    return { ok: true };
  }

  /**
   * Lobby settings, room creator only. For now just the Course; ticket 24 adds
   * the chaos level here. A new Course resets the lobby to its first Hole.
   */
  function configure(playerId: string, courseId: string | undefined): IntentResult {
    const allowed = checkCreator(playerId);
    if (!allowed.ok) return allowed;
    if (courseId === undefined) return { ok: true };
    const next = typeof courseId === "string" ? catalogue[courseId] : undefined;
    if (!next) return { ok: false, reason: "unknown_course" };
    if (next === course) return { ok: true };
    course = next;
    state.courseId = course.id;
    state.pars = course.holes.map((h) => h.par);
    state.holeIndex = 0;
    const hole = currentHole();
    resetTerrain();
    physics = newPhysicsWorld();
    state.cup = { ...hole.cup };
    cupSlide = null;
    magnetOn = false;
    magnetPolarity.clear();
    pendingLipOut.clear();
    poppedOut.clear();
    lastShots.clear();
    snipers.clear();
    effects.clearAll();
    state.obstacleTimeMs = 0;
    placeEveryoneOnTee();
    items.setupHole(hole);
    for (const player of Object.values(state.players)) player.strokes = course.holes.map(() => 0);
    emit({ type: "hole", payload: { holeIndex: 0, hole }, audience: everyone });
    emit({ type: "feed", payload: { text: `Course: ${course.name}` }, audience: everyone });
    return { ok: true };
  }

  /** Players who hold a seat: everyone except those who left mid-game for good. */
  const seatsTaken = () => Object.keys(state.players).filter((id) => !gone.has(id)).length;

  /** The one-shot messages a (re)joining Player needs to draw the room. */
  function sendRoomTo(playerId: string): void {
    emit({ type: "time", payload: { now: clock.now() }, audience: toPlayer(playerId) });
    emit({ type: "courses", payload: { courses: courseList }, audience: toPlayer(playerId) });
    emit({ type: "hole", payload: { holeIndex: state.holeIndex, hole: currentHole() }, audience: toPlayer(playerId) });
    // Their own item slot (kept through a disconnect), to them alone.
    items.sendSlot(playerId);
  }

  /**
   * A new Player (the Admin too: they join exactly like everyone else, and
   * every event about the join is the same). In the lobby, or during the 3-2-1 before a Hole (nothing
   * has been played yet), they go straight onto the Tee. Once a Hole is being
   * played or is over, they're a late joiner: they spectate until the next
   * Hole starts, and every Hole up to and including the current one is scored
   * at its stroke cap (Par + strokeCapOverPar) right away, so Standing counts
   * it. Joining after the last Hole means watching the final results.
   */
  function join(playerId: string, name: string, color: string, asAdmin: boolean): IntentResult {
    if (state.players[playerId]) return { ok: false, reason: "already_joined" };
    if (seatsTaken() >= MAX_PLAYERS) return { ok: false, reason: "room_full" };
    if (asAdmin && admin.adminId !== null) return { ok: false, reason: "admin_taken" };
    // From here on the Admin is an ordinary Player in every respect except admin.isAdmin().
    if (asAdmin) admin.claim(playerId);

    const late = state.phase === "playing" || state.phase === "holeEnd" || state.phase === "gameEnd";
    const spot = late ? { ...currentHole().tee } : teeSpot(ballsOnCourse());
    const cap = state.settings.strokeCapOverPar;
    const missedThrough = state.phase === "gameEnd" ? course.holes.length - 1 : state.holeIndex;
    const player: PlayerState = {
      id: playerId,
      name: cleanName(name, joinCount),
      color: cleanColor(color, joinCount),
      connected: true,
      spectating: late,
      ball: { x: spot.x, y: spot.y, vx: 0, vy: 0, atRest: true, restSpot: { ...spot } },
      strokes: course.holes.map((h, i) => (late && i <= missedThrough ? h.par + cap : 0)),
      holedOut: false,
      standing: 0,
      effects: [],
      immuneUntil: 0,
      itemHits: 0,
    };
    joinOrder.set(playerId, joinCount);
    joinCount++;
    state.players[playerId] = player;
    // The room creator is the first to join.
    if (!state.creatorId) state.creatorId = playerId;
    addBody(player);
    if (state.phase === "countdown") presentThisHole.add(playerId);
    updateStandings();
    sendRoomTo(playerId);
    const note = !late ? "" : state.phase === "gameEnd" ? " to watch" : ", playing from the next Hole";
    emit({ type: "feed", payload: { text: `${player.name} joined${note}` }, audience: everyone });
    return { ok: true };
  }

  /**
   * The connection dropped. The Player stays, with their ball frozen where it
   * is: out of the physics world (no collisions, nothing moves it) and not
   * targetable. Everything else about them is kept for when they come back.
   */
  function disconnect(playerId: string): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (!player.connected) return { ok: false, reason: "not_connected" };
    // Whoever vanishes mid-grab, the held ball is let go: the Admin dropping it, or its owner leaving it frozen.
    if (admin.isAdmin(playerId) || held?.id === playerId) dropHeld();
    player.connected = false;
    if (physics.hasBall(playerId)) removeBody(player);
    updateStandings();
    emit({ type: "feed", payload: { text: `${player.name} disconnected` }, audience: everyone });
    return { ok: true };
  }

  /**
   * The same Player is back: same ball (at rest where it was frozen, or on
   * the Tee if a new Hole started meanwhile), same Strokes, and every other
   * per-Player record the simulation keeps, so the held Item (ticket 14)
   * survives too as long as it lives on the Player.
   */
  function reconnect(playerId: string): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (gone.has(playerId)) return { ok: false, reason: "left_game" };
    if (player.connected) return { ok: false, reason: "already_connected" };
    player.connected = true;
    addBody(player);
    if (state.phase === "countdown" || state.phase === "playing") presentThisHole.add(playerId);
    updateStandings();
    sendRoomTo(playerId);
    emit({ type: "feed", payload: { text: `${player.name} is back` }, audience: everyone });
    return { ok: true };
  }

  /**
   * Gone for good. In the lobby the Player is removed. Mid-game they stay
   * disconnected (ball frozen, scores kept, the unfinished-Hole rule at Hole
   * end) but give up their seat and can't reconnect.
   */
  function leave(playerId: string): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (gone.has(playerId)) return { ok: false, reason: "left_game" };
    if (admin.isAdmin(playerId) || held?.id === playerId) dropHeld();
    if (state.phase === "lobby") {
      delete state.players[playerId];
      joinOrder.delete(playerId);
      physics.removeBall(playerId);
      forgetBall(playerId);
      items.forget(playerId);
      effects.forget(playerId);
      lastShots.delete(playerId);
    } else {
      player.connected = false;
      if (physics.hasBall(playerId)) removeBody(player);
      gone.add(playerId);
    }
    // An Admin who is gone for good frees the role for someone else with the secret.
    if (admin.isAdmin(playerId)) items.setGodMode(playerId, false, "stealth");
    aims.delete(playerId);
    admin.release(playerId);
    emit({ type: "feed", payload: { text: `${player.name} left` }, audience: everyone });
    if (state.creatorId === playerId) {
      // The longest-present Player still in the game takes over running the lobby.
      const next = Object.keys(state.players)
        .filter((id) => id !== playerId && !gone.has(id))
        .sort((a, b) => joinOrder.get(a)! - joinOrder.get(b)!)[0];
      state.creatorId = next ?? "";
      if (next) emit({ type: "feed", payload: { text: `${state.players[next]!.name} now runs the lobby` }, audience: everyone });
    }
    updateStandings();
    return { ok: true };
  }

  /** Remember where a Player is aiming, for the Admin's x-ray. Nobody else ever sees it. */
  function aim(playerId: string, angle: unknown, power: unknown, active: unknown): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (active === false) {
      aims.delete(playerId);
      return { ok: true };
    }
    if (typeof angle !== "number" || typeof power !== "number" || !Number.isFinite(angle) || !Number.isFinite(power)) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (state.phase !== "playing" || !player.connected || player.spectating || player.holedOut) {
      return { ok: false, reason: "wrong_phase" };
    }
    aims.set(playerId, { angle, power: clamp(power, 0, 1), at: clock.now() });
    return { ok: true };
  }

  /** The x-ray: every Player's held Item, Effects (with sources) and aim, to the Admin's connection only. */
  function emitXray(): void {
    const adminId = admin.adminId;
    if (adminId === null || !state.players[adminId]?.connected) return;
    const now = clock.now();
    emit({
      type: "xray",
      payload: {
        at: now,
        players: Object.values(state.players).map((p) => {
          const a = aims.get(p.id);
          return {
            id: p.id,
            item: items.held(p.id),
            effects: effects.on(p.id).map((e) => ({
              kind: e.kind,
              endsAt: e.endsAt,
              sourceId: e.sourceId,
              visible: e.visible,
            })),
            aim: a && now - a.at <= XRAY_AIM_STALE_MS ? { angle: a.angle, power: a.power } : null,
          };
        }),
      },
      audience: toAdmin,
    });
  }

  function shoot(playerId: string, angle: number, power: number): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (state.phase !== "playing") return { ok: false, reason: "wrong_phase" };
    if (!player.connected) return { ok: false, reason: "not_connected" };
    if (player.spectating) return { ok: false, reason: "spectating" };
    if (player.holedOut) return { ok: false, reason: "holed_out" };
    // Effects that stop shooting (Freeze).
    const blocked = effects.shotBlocker(playerId);
    if (blocked) return { ok: false, reason: blocked };
    // A ball held by the Admin reads as moving.
    if (held?.id === playerId || !player.ball.atRest) return { ok: false, reason: "ball_moving" };

    aims.delete(playerId);
    lastShots.set(playerId, { from: { x: player.ball.x, y: player.ball.y }, penalties: 0 });
    const from = surfaces.at(player.ball);
    const speed = clamp(power, 0, 1) * MAX_SHOT_SPEED * shotPowerFactor(from);
    // Invert Controls: the shot goes opposite to the drag, whatever the client showed (server-side, so Stealth works).
    const aimed = effects.find(playerId, "invertControls") ? angle + Math.PI : angle;
    const velocity = { x: Math.cos(aimed) * speed, y: Math.sin(aimed) * speed };
    physics.setVelocity(playerId, velocity);
    player.ball.vx = velocity.x;
    player.ball.vy = velocity.y;
    player.ball.atRest = false;
    slowSteps.set(playerId, 0);
    player.strokes[state.holeIndex] = (player.strokes[state.holeIndex] ?? 0) + 1;
    // Cup Magnet and Ghost Ball armed earlier start working on this shot.
    effects.shot(playerId);
    emit({
      type: "fx",
      payload: { kind: "putt", x: player.ball.x, y: player.ball.y, intensity: clamp(power, 0, 1) },
      audience: everyone,
    });
    return { ok: true };
  }

  /** Float an emote over the sender's ball. Validated and limited to one per second per Player. */
  function emote(playerId: string, kind: unknown): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (typeof kind !== "string" || !(EMOTE_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (!player.connected) return { ok: false, reason: "not_connected" };
    const now = clock.now();
    const last = lastEmoteAt.get(playerId);
    if (last !== undefined && now - last < EMOTE_GAP_MS) return { ok: false, reason: "rate_limited" };
    lastEmoteAt.set(playerId, now);
    emit({ type: "emote", payload: { playerId, kind: kind as EmoteKind }, audience: everyone });
    return { ok: true };
  }

  /**
   * Near-miss: a ball that skims past the Cup without ever reaching its edge.
   * Judged when it leaves the zone or stops in it; a lip-out or a drop is
   * already its own fx.
   */
  function trackNearMiss(player: PlayerState): void {
    const ball = player.ball;
    const cup = state.cup;
    const d = Math.hypot(ball.x - cup.x, ball.y - cup.y);
    const pass = nearPass.get(player.id);
    const inZone = d <= cup.radius + NEAR_MISS_MARGIN;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (inZone && (pass || !ball.atRest)) {
      const next = pass ?? { min: d, fast: false };
      next.min = Math.min(next.min, d);
      if (speed >= NEAR_MISS_MIN_SPEED) next.fast = true;
      nearPass.set(player.id, next);
      if (!ball.atRest) return;
    }
    if (!pass) return;
    nearPass.delete(player.id);
    if (pass.fast && pass.min > cup.radius) {
      emit({ type: "fx", payload: { kind: "nearMiss", x: cup.x, y: cup.y, targetId: player.id }, audience: everyone });
    }
  }

  /** Wall clinks from this step's contacts: loud enough, and not more than one per ball per moment. */
  function emitWallHits(): void {
    for (const hit of physics.takeWallHits()) {
      if (hit.speed < WALL_HIT_MIN_SPEED) continue;
      const last = lastWallHitAt.get(hit.id);
      if (last !== undefined && elapsedMs - last < WALL_HIT_GAP_MS) continue;
      lastWallHitAt.set(hit.id, elapsedMs);
      emit({
        type: "fx",
        payload: { kind: "wallHit", x: hit.x, y: hit.y, intensity: clamp(hit.speed / 700, 0.1, 1) },
        audience: everyone,
      });
    }
  }

  /** One mash click: Effects that react to it (Freeze: break out sooner). Only while playing. */
  function mash(playerId: string): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (state.phase !== "playing") return { ok: false, reason: "wrong_phase" };
    return effects.mash(playerId) ? { ok: true } : { ok: false, reason: "no_effect" };
  }

  /**
   * Water or Void: +1 Stroke and back to the Rest Spot, at rest. If the Rest
   * Spot itself is now under painted Water or Void, the ball goes to the
   * nearest dry spot instead, which becomes its Rest Spot (otherwise it would
   * sink again and again).
   */
  function sinkBall(player: PlayerState, at: Vec2): void {
    const ball = player.ball;
    const kind = surfaces.at(at);
    nearPass.delete(player.id);
    emit({ type: "fx", payload: { kind: kind === "void" ? "void" : "splash", x: at.x, y: at.y }, audience: everyone });
    player.strokes[state.holeIndex] = (player.strokes[state.holeIndex] ?? 0) + 1;
    const shot = lastShots.get(player.id);
    if (shot) shot.penalties++;
    ball.restSpot = dryReturnSpot(ball.restSpot);
    physics.teleport(player.id, ball.restSpot);
    ball.x = ball.restSpot.x;
    ball.y = ball.restSpot.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.atRest = true;
    slowSteps.set(player.id, 0);
    insidePads.delete(player.id);
    portalLocked.delete(player.id);
    effects.rested(player.id);
    const sniper = snipers.get(player.id);
    snipers.delete(player.id);
    const sniped = sniper !== undefined && clock.now() <= sniper.until;
    emit({
      type: "feed",
      payload: {
        text: sniped
          ? `${sniper.name} sniped ${player.name} into the ${kind === "void" ? "void" : "lake"} (+1)`
          : `${player.name} ${kind === "void" ? "fell into the void" : "landed in the water"} (+1)`,
      },
      audience: everyone,
    });
  }

  /** Boost Pads push once per entry; Teleporters move the ball once until it leaves them. */
  function applyPadsAndPortals(id: string, ball: PlayerState["ball"]): void {
    const hole = currentHole();
    const inside = insidePads.get(id) ?? new Set<number>();
    insidePads.set(id, inside);
    hole.boostPads.forEach((pad, i) => {
      const now = pointInPolygon(ball, pad.polygon);
      if (now && !inside.has(i)) {
        const push = BOOST_IMPULSE * pad.strength;
        physics.addVelocity(id, { x: Math.cos(pad.angle) * push, y: Math.sin(pad.angle) * push });
        const m = physics.motion(id);
        ball.vx = m.vx;
        ball.vy = m.vy;
        emit({ type: "fx", payload: { kind: "boost", x: ball.x, y: ball.y }, audience: everyone });
      }
      if (now) inside.add(i);
      else inside.delete(i);
    });

    let touching: { from: Vec2; to: Vec2 } | null = null;
    for (const pair of hole.teleporters) {
      if (Math.hypot(ball.x - pair.a.x, ball.y - pair.a.y) <= pair.radius) touching = { from: pair.a, to: pair.b };
      else if (Math.hypot(ball.x - pair.b.x, ball.y - pair.b.y) <= pair.radius) touching = { from: pair.b, to: pair.a };
      if (touching) break;
    }
    if (!touching) {
      portalLocked.delete(id);
    } else if (!portalLocked.has(id)) {
      const m = physics.motion(id);
      emit({ type: "fx", payload: { kind: "teleport", x: touching.from.x, y: touching.from.y }, audience: everyone });
      physics.teleport(id, touching.to, { x: m.vx, y: m.vy });
      ball.x = touching.to.x;
      ball.y = touching.to.y;
      portalLocked.add(id);
      emit({ type: "fx", payload: { kind: "teleport", x: touching.to.x, y: touching.to.y }, audience: everyone });
    }
  }

  /**
   * The Cup: a ball inside the capture radius drops in when it's slower than
   * CUP_CAPTURE_SPEED, and lips out (once per pass, rolling on) when faster.
   * Returns true if the ball Holed Out.
   */
  function checkCup(player: PlayerState): boolean {
    const ball = player.ball;
    const cup = state.cup;
    if (Math.hypot(ball.x - cup.x, ball.y - cup.y) > cup.radius) {
      lippedOut.delete(player.id);
      poppedOut.delete(player.id);
      return false;
    }
    if (poppedOut.has(player.id)) return false;
    if (Math.hypot(ball.vx, ball.vy) < CUP_CAPTURE_SPEED) {
      if (pendingLipOut.delete(player.id)) {
        popOut(player);
        return false;
      }
      holeOut(player);
      return true;
    }
    if (!lippedOut.has(player.id)) {
      lippedOut.add(player.id);
      emit({ type: "fx", payload: { kind: "lipOut", x: cup.x, y: cup.y }, audience: everyone });
    }
    return false;
  }

  /**
   * A forced Lip-Out: the ball that would have dropped in is kicked on and
   * rolls out of the Cup, with the same `lipOut` fx a natural lip-out sends.
   */
  function popOut(player: PlayerState): void {
    const ball = player.ball;
    const cup = state.cup;
    // Like a natural lip-out the ball keeps going the way it was rolling; a ball with no heading is pushed out of the centre.
    const dx = ball.x - cup.x;
    const dy = ball.y - cup.y;
    const angle =
      Math.hypot(ball.vx, ball.vy) > 1
        ? Math.atan2(ball.vy, ball.vx)
        : Math.hypot(dx, dy) > 1e-6
          ? Math.atan2(dy, dx)
          : options.rng.next() * Math.PI * 2;
    const speed = CUP_CAPTURE_SPEED * 1.4;
    const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    physics.setVelocity(player.id, velocity);
    ball.vx = velocity.x;
    ball.vy = velocity.y;
    ball.atRest = false;
    slowSteps.set(player.id, 0);
    poppedOut.add(player.id);
    lippedOut.add(player.id);
    emit({ type: "fx", payload: { kind: "lipOut", x: cup.x, y: cup.y }, audience: everyone });
  }

  /** The ball drops in: it leaves the physics world and the Player spectates. */
  function holeOut(player: PlayerState): void {
    const cup = state.cup;
    physics.removeBall(player.id);
    forgetBall(player.id);
    player.holedOut = true;
    player.ball.x = cup.x;
    player.ball.y = cup.y;
    player.ball.vx = 0;
    player.ball.vy = 0;
    player.ball.atRest = true;
    effects.rested(player.id);
    emit({ type: "fx", payload: { kind: "holeOut", x: cup.x, y: cup.y }, audience: everyone });
    const strokes = player.strokes[state.holeIndex] ?? 0;
    emit({
      type: "feed",
      payload: { text: `${player.name} holed out in ${strokes} (${parLabel(strokes, currentHole().par)})` },
      audience: everyone,
    });
  }

  /** One fixed 60 Hz step: move every ball, then apply the Cup, hazards and the rest rule. */
  function physicsStep(): void {
    slideCup(PHYSICS_STEP_MS);
    guardCup();
    // Where each ball in play starts this step, so Item Boxes catch a ball that passes through one between steps.
    const startedAt = new Map<string, Vec2>();
    for (const [id, player] of Object.entries(state.players)) {
      if (physics.hasBall(id)) startedAt.set(id, { x: player.ball.x, y: player.ball.y });
    }
    // Effects act before the world moves (a Frozen ball is pinned before anything can hit it).
    effects.step();
    applyMagnet();
    physics.step();
    elapsedMs += PHYSICS_STEP_MS;
    emitWallHits();
    state.obstacleTimeMs = physics.obstacleTimeMs;

    for (const [id, player] of Object.entries(state.players)) {
      if (!physics.hasBall(id)) continue;
      const ball = player.ball;
      const motion = physics.motion(id);
      ball.x = motion.x;
      ball.y = motion.y;
      ball.vx = motion.vx;
      ball.vy = motion.vy;

      // Item Boxes are sensors: passing through one never changes the ball's path.
      items.rollThrough(player, startedAt.get(id) ?? motion, motion);
      // Banana Mines are sensors too: touching one spins the ball off (via the Item Hit path for opponents).
      items.triggerTraps(player, startedAt.get(id) ?? motion, motion);
      // A pinned (Frozen) ball is a block of ice: it can't drop into the Cup or ride pads and Teleporters.
      const pinned = physics.isPinned(id);
      if (!ball.atRest && !pinned && checkCup(player)) continue;
      if (!pinned) trackNearMiss(player);
      // Resting balls too: Terrain Paint can put Water or Void under a ball that isn't moving.
      // It sinks like any other (the return spot is always dry, so it can't sink again where it lands).
      if (isHazard(surfaces.at(ball))) {
        sinkBall(player, motion);
        continue;
      }
      if (!ball.atRest && !pinned) applyPadsAndPortals(id, ball);
      const speed = Math.hypot(ball.vx, ball.vy);

      if (ball.atRest) {
        // Something knocked a resting ball (another ball, later an Item): it is moving again.
        if (speed >= REST_SPEED) {
          ball.atRest = false;
          slowSteps.set(id, 0);
        }
        continue;
      }
      if (speed >= REST_SPEED) {
        slowSteps.set(id, 0);
        continue;
      }
      const slow = (slowSteps.get(id) ?? 0) + 1;
      slowSteps.set(id, slow);
      if (slow >= REST_STEPS) {
        physics.stop(id);
        ball.vx = 0;
        ball.vy = 0;
        ball.atRest = true;
        ball.restSpot = { x: ball.x, y: ball.y };
        // Ghost Ball / Cup Magnet end here (a ghost resting inside a wall is moved out first).
        effects.rested(id);
      }
    }
  }

  return {
    handleIntent(playerId, intent) {
      switch (intent.type) {
        case "join":
          return join(playerId, intent.name, intent.color, intent.admin === true);
        case "leave":
          return leave(playerId);
        case "disconnect":
          return disconnect(playerId);
        case "reconnect":
          return reconnect(playerId);
        case "start":
          return start(playerId);
        case "configure":
          return configure(playerId, intent.courseId);
        case "shoot":
          return shoot(playerId, intent.angle, intent.power);
        case "useItem":
          return items.use(playerId, intent);
        case "aim":
          return aim(playerId, intent.angle, intent.power, intent.active);
        case "mash":
          return mash(playerId);
        case "emote":
          return emote(playerId, intent.kind);
        case "admin":
          return admin.use(playerId, intent);
        default:
          return { ok: false, reason: "invalid_payload" };
      }
    },
    step(dtMs) {
      if (!(dtMs > 0)) return;
      // Physics only ever advances in whole fixed steps; leftovers carry over.
      // Balls only move while a Hole is being played.
      pendingMs += dtMs;
      let steps = 0;
      while (pendingMs >= PHYSICS_STEP_MS - 1e-6 && steps < MAX_STEPS_PER_CALL) {
        if (state.phase === "playing") physicsStep();
        pendingMs -= PHYSICS_STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_CALL) pendingMs = 0;
      if (state.phase === "playing") {
        expireTerrain();
        items.respawnBoxes();
        items.expireTraps();
        effects.expire();
      }
      items.expireActive();
      xrayAccumMs += dtMs;
      if (xrayAccumMs >= XRAY_INTERVAL_MS) {
        xrayAccumMs = 0;
        if (state.phase !== "lobby") emitXray();
      }
      advancePhase();
      updateStandings();
    },
    getState() {
      return state;
    },
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
    getAdminId() {
      return admin.adminId;
    },
    getAdminLog() {
      return admin.log;
    },
    getItemLog() {
      return items.log;
    },
    getHeldItem(playerId) {
      return items.held(playerId);
    },
    getEffectLog() {
      return effects.log;
    },
  };
}

/** "par", "+2", "-1"... */
function parLabel(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff === 0) return "par";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanName(name: unknown, index: number): string {
  const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
  return trimmed || `Player ${index + 1}`;
}

function cleanColor(color: unknown, index: number): string {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
}
