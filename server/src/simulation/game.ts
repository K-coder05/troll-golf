import {
  BALL_RADIUS,
  MAX_PLAYERS,
  MAX_THROW_SPEED,
  REST_DURATION_MS,
  REST_SPEED,
  type AdminMode,
  type CourseData,
  type CourseSummary,
  type GameSettings,
  type PlayerState,
  type RoomState,
  type Vec2,
} from "@troll-golf/shared";
import { createAdminPowers, type AdminBallControl, type AdminLogEntry } from "./admin";
import type { Clock } from "./clock";
import { everyone, toPlayer, type GameEvent } from "./events";
import type { Intent, IntentResult } from "./intents";
import { PHYSICS_STEP_MS, PhysicsWorld } from "./physics";
import { ADMIN_POWERS } from "./powers";
import type { Rng } from "./random";
import { courseSurfaces, isHazard, pointInPolygon, shotPowerFactor, SURFACE_DAMPING } from "./surfaces";

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
}

/**
 * The score of a Player who hasn't Holed Out when the Hole ends:
 * min(Strokes + 2, stroke cap), with the stroke cap at Par + strokeCapOverPar.
 */
export function unfinishedScore(strokes: number, par: number, strokeCapOverPar: number): number {
  return Math.min(strokes + UNFINISHED_PENALTY, par + strokeCapOverPar);
}

/**
 * Whether Items (ticket 15) may target this Player right now. A Player who
 * has Holed Out, is disconnected, or is a late joiner waiting for the next
 * Hole has no ball in play and can't be hit. Ticket 15 adds the 3 s immunity
 * window and the disabling-Effect cap on top of this.
 */
export function isTargetable(player: Readonly<PlayerState>): boolean {
  return player.connected && !player.holedOut && !player.spectating;
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
  // options.rng is not used yet; every later roll must come from it so tests stay deterministic.
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

  // The physics world and surface lookup of the current Hole, rebuilt by startHole().
  let surfaces = courseSurfaces(currentHole());
  let physics = newPhysicsWorld();
  // Boost Pads / Teleporters a ball is currently inside, so each fires once per entry.
  const insidePads = new Map<string, Set<number>>();
  const portalLocked = new Set<string>();
  // Consecutive physics steps each moving ball has spent under REST_SPEED.
  const slowSteps = new Map<string, number>();
  // Balls inside the Cup's capture radius that already lipped out, so each pass lips out once.
  const lippedOut = new Set<string>();
  // Balls in the Cup's no-collision zone, where other balls pass through them.
  const cupGuarded = new Set<string>();
  // Players who left mid-game for good. They stay in state (their scores
  // count) but can't reconnect and don't take up a seat.
  const gone = new Set<string>();
  // Players connected at some point while the current Hole was set up or
  // played. Anyone else missed the whole Hole and is scored at its stroke cap.
  const presentThisHole = new Set<string>();

  const emit = (event: GameEvent) => events.push(event);
  // The secret Admin and the Admin Power pipeline. Server-only: nothing in here reaches RoomState.
  const admin = createAdminPowers({
    registry: ADMIN_POWERS,
    clock,
    state,
    emit,
    updateStandings: () => updateStandings(),
    balls: ballControl(),
  });

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
      !walls.some((w) => pointInPolygon(p, w))
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
      physics.setCollisions(player.id, { walls: true, balls: !inside });
    }
  }

  /**
   * Standing: Strokes from earlier Holes plus Strokes so far on this Hole
   * (penalties included), fewest first, with distance to the Cup breaking
   * ties. A Holed-Out Player's distance is 0, so they rank by their final
   * Strokes. Remaining ties go to whoever joined first. The Leader is first
   * in Standing among Players who haven't Holed Out.
   */
  function updateStandings(): void {
    const cup = state.cup;
    const ranked = Object.values(state.players)
      .map((p) => ({
        player: p,
        total: p.strokes.reduce((a, b) => a + b, 0),
        distance: p.holedOut
          ? 0
          : p.spectating
            ? NOT_ON_COURSE_DISTANCE
            : Math.hypot(p.ball.x - cup.x, p.ball.y - cup.y),
        order: joinOrder.get(p.id) ?? 0,
      }))
      .sort((a, b) => a.total - b.total || a.distance - b.distance || a.order - b.order);
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
    const hole = currentHole();
    surfaces = courseSurfaces(hole);
    physics = newPhysicsWorld();
    state.cup = { ...hole.cup };
    state.obstacleTimeMs = 0;
    placeEveryoneOnTee();
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
    for (const player of Object.values(state.players)) player.strokes = course.holes.map(() => 0);
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
    surfaces = courseSurfaces(hole);
    physics = newPhysicsWorld();
    state.cup = { ...hole.cup };
    state.obstacleTimeMs = 0;
    placeEveryoneOnTee();
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
    } else {
      player.connected = false;
      if (physics.hasBall(playerId)) removeBody(player);
      gone.add(playerId);
    }
    // An Admin who is gone for good frees the role for someone else with the secret.
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
    // Freeze (15) adds its check here. A ball held by the Admin reads as moving.
    if (held?.id === playerId || !player.ball.atRest) return { ok: false, reason: "ball_moving" };

    const from = surfaces.at(player.ball);
    const speed = clamp(power, 0, 1) * MAX_SHOT_SPEED * shotPowerFactor(from);
    const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    physics.setVelocity(playerId, velocity);
    player.ball.vx = velocity.x;
    player.ball.vy = velocity.y;
    player.ball.atRest = false;
    slowSteps.set(playerId, 0);
    player.strokes[state.holeIndex] = (player.strokes[state.holeIndex] ?? 0) + 1;
    return { ok: true };
  }

  /** Water or Void: +1 Stroke and back to the Rest Spot, at rest. */
  function sinkBall(player: PlayerState, at: Vec2): void {
    const ball = player.ball;
    const kind = surfaces.at(at);
    emit({ type: "fx", payload: { kind: kind === "void" ? "void" : "splash", x: at.x, y: at.y }, audience: everyone });
    player.strokes[state.holeIndex] = (player.strokes[state.holeIndex] ?? 0) + 1;
    physics.teleport(player.id, ball.restSpot);
    ball.x = ball.restSpot.x;
    ball.y = ball.restSpot.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.atRest = true;
    slowSteps.set(player.id, 0);
    insidePads.delete(player.id);
    portalLocked.delete(player.id);
    emit({
      type: "feed",
      payload: { text: `${player.name} ${kind === "void" ? "fell into the void" : "landed in the water"} (+1)` },
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
      return false;
    }
    if (Math.hypot(ball.vx, ball.vy) < CUP_CAPTURE_SPEED) {
      holeOut(player);
      return true;
    }
    if (!lippedOut.has(player.id)) {
      lippedOut.add(player.id);
      emit({ type: "fx", payload: { kind: "lipOut", x: cup.x, y: cup.y }, audience: everyone });
    }
    return false;
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
    guardCup();
    physics.step();
    elapsedMs += PHYSICS_STEP_MS;
    state.obstacleTimeMs = physics.obstacleTimeMs;

    for (const [id, player] of Object.entries(state.players)) {
      if (!physics.hasBall(id)) continue;
      const ball = player.ball;
      const motion = physics.motion(id);
      ball.x = motion.x;
      ball.y = motion.y;
      ball.vx = motion.vx;
      ball.vy = motion.vy;

      if (!ball.atRest) {
        if (checkCup(player)) continue;
        if (isHazard(surfaces.at(ball))) {
          sinkBall(player, motion);
          continue;
        }
        applyPadsAndPortals(id, ball);
      }
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
