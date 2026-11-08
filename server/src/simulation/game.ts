import {
  BALL_RADIUS,
  MAX_PLAYERS,
  REST_DURATION_MS,
  REST_SPEED,
  type CourseData,
  type GameSettings,
  type PlayerState,
  type RoomState,
  type Vec2,
} from "@troll-golf/shared";
import type { Clock } from "./clock";
import { everyone, toPlayer, type GameEvent } from "./events";
import type { Intent, IntentResult } from "./intents";
import { PHYSICS_STEP_MS, PhysicsWorld } from "./physics";
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
  course: CourseData;
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
}

/**
 * The score of a Player who hasn't Holed Out when the Hole ends:
 * min(Strokes + 2, stroke cap), with the stroke cap at Par + strokeCapOverPar.
 */
export function unfinishedScore(strokes: number, par: number, strokeCapOverPar: number): number {
  return Math.min(strokes + UNFINISHED_PENALTY, par + strokeCapOverPar);
}

export function createGame(options: CreateGameOptions): Game {
  // options.rng is not used yet; every later roll must come from it so tests stay deterministic.
  const { course, clock } = options;
  if (course.holes.length === 0) throw new Error(`Course "${course.id}" has no Holes`);

  const firstHole = course.holes[0]!;
  const state: RoomState = {
    code: options.code,
    phase: "lobby",
    courseId: course.id,
    holeIndex: 0,
    holeEndsAt: 0,
    phaseEndsAt: 0,
    pars: course.holes.map((h) => h.par),
    cup: { ...firstHole.cup },
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    players: {},
  };
  let events: GameEvent[] = [];
  let joinCount = 0;
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

  const emit = (event: GameEvent) => events.push(event);

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

  /** Balls currently on the course (not in the Cup). */
  const ballsInPlay = () =>
    Object.values(state.players)
      .filter((p) => !p.holedOut)
      .map((p) => p.ball);

  function placeOnTee(player: PlayerState, spot: Vec2): void {
    player.ball = { x: spot.x, y: spot.y, vx: 0, vy: 0, atRest: true, restSpot: { ...spot } };
    player.holedOut = false;
  }

  function forgetBall(id: string): void {
    slowSteps.delete(id);
    insidePads.delete(id);
    portalLocked.delete(id);
    lippedOut.delete(id);
  }

  // ---- Hole flow: lobby -> countdown -> playing -> holeEnd -> ... -> gameEnd ----

  /**
   * Set up Hole `index` and begin its countdown: a fresh physics world, the
   * Cup back to the Hole's own, every ball on the Tee and nobody Holed Out.
   * Everyone is sent the new layout.
   */
  function startHole(index: number): void {
    state.holeIndex = index;
    const hole = currentHole();
    surfaces = courseSurfaces(hole);
    physics = newPhysicsWorld();
    state.cup = { ...hole.cup };
    const placed: Vec2[] = [];
    for (const player of Object.values(state.players)) {
      forgetBall(player.id);
      const spot = teeSpot(placed);
      placed.push(spot);
      placeOnTee(player, spot);
      physics.addBall(player.id, spot);
    }
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

  /** Score anyone unfinished, freeze the balls and show the scoreboard. */
  function endHole(): void {
    const par = currentHole().par;
    for (const player of Object.values(state.players)) {
      if (player.holedOut) continue;
      physics.stop(player.id);
      player.ball.vx = 0;
      player.ball.vy = 0;
      player.ball.atRest = true;
      const strokes = player.strokes[state.holeIndex] ?? 0;
      player.strokes[state.holeIndex] = unfinishedScore(strokes, par, state.settings.strokeCapOverPar);
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
        const players = Object.values(state.players);
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

  function start(playerId: string): IntentResult {
    if (!state.players[playerId]) return { ok: false, reason: "unknown_player" };
    if (state.phase !== "lobby") return { ok: false, reason: "wrong_phase" };
    startHole(0);
    return { ok: true };
  }

  function join(playerId: string, name: string, color: string): IntentResult {
    if (state.players[playerId]) return { ok: false, reason: "already_joined" };
    if (Object.keys(state.players).length >= MAX_PLAYERS) return { ok: false, reason: "room_full" };

    // Joining mid-game puts the ball on the current Hole's Tee for now.
    // Ticket 08 makes late joiners wait for the next Hole, scored at the stroke cap.
    const spot = teeSpot(ballsInPlay());
    const player: PlayerState = {
      id: playerId,
      name: cleanName(name, joinCount),
      color: cleanColor(color, joinCount),
      connected: true,
      ball: { x: spot.x, y: spot.y, vx: 0, vy: 0, atRest: true, restSpot: { ...spot } },
      strokes: course.holes.map(() => 0),
      holedOut: false,
    };
    joinCount++;
    state.players[playerId] = player;
    physics.addBall(playerId, spot);
    emit({ type: "time", payload: { now: clock.now() }, audience: toPlayer(playerId) });
    emit({ type: "hole", payload: { holeIndex: state.holeIndex, hole: currentHole() }, audience: toPlayer(playerId) });
    emit({ type: "feed", payload: { text: `${player.name} joined` }, audience: everyone });
    return { ok: true };
  }

  function leave(playerId: string): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    // Lobby-only behaviour for now. Ticket 08 keeps the ball on the course
    // (connected = false) when someone drops mid-game.
    delete state.players[playerId];
    physics.removeBall(playerId);
    forgetBall(playerId);
    emit({ type: "feed", payload: { text: `${player.name} left` }, audience: everyone });
    return { ok: true };
  }

  function shoot(playerId: string, angle: number, power: number): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (state.phase !== "playing") return { ok: false, reason: "wrong_phase" };
    if (player.holedOut) return { ok: false, reason: "holed_out" };
    // Freeze (15) and Ball Grab (10) add their checks here.
    if (!player.ball.atRest) return { ok: false, reason: "ball_moving" };

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
    physics.step();
    elapsedMs += PHYSICS_STEP_MS;

    for (const [id, player] of Object.entries(state.players)) {
      if (player.holedOut) continue;
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
          return join(playerId, intent.name, intent.color);
        case "leave":
          return leave(playerId);
        case "start":
          return start(playerId);
        case "shoot":
          return shoot(playerId, intent.angle, intent.power);
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
    },
    getState() {
      return state;
    },
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
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
