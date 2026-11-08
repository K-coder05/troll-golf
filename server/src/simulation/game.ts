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

export function createGame(options: CreateGameOptions): Game {
  // options.rng and options.clock are not used yet; every later roll and
  // timestamp must come from them so tests stay deterministic.
  const { course } = options;
  if (course.holes.length === 0) throw new Error(`Course "${course.id}" has no Holes`);

  const state: RoomState = {
    code: options.code,
    phase: "lobby",
    courseId: course.id,
    holeIndex: 0,
    holeEndsAt: 0,
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

  // Ticket 04 passes a surface lookup as dampingScale; ticket 05 rebuilds the world per Hole.
  const physics = new PhysicsWorld({ hole: currentHole() });
  // Consecutive physics steps each moving ball has spent under REST_SPEED.
  const slowSteps = new Map<string, number>();

  const emit = (event: GameEvent) => events.push(event);

  /** A free spot on or next to the Tee. */
  function teeSpot(): Vec2 {
    const tee = currentHole().tee;
    const balls = Object.values(state.players).map((p) => p.ball);
    const free = (spot: Vec2) => balls.every((b) => Math.hypot(b.x - spot.x, b.y - spot.y) >= BALL_RADIUS * 2);
    const spots = TEE_SLOTS.map((o) => ({ x: tee.x + o.x * TEE_SPACING, y: tee.y + o.y * TEE_SPACING }));
    return spots.find(free) ?? tee;
  }

  function join(playerId: string, name: string, color: string): IntentResult {
    if (state.players[playerId]) return { ok: false, reason: "already_joined" };
    if (Object.keys(state.players).length >= MAX_PLAYERS) return { ok: false, reason: "room_full" };

    const spot = teeSpot();
    const player: PlayerState = {
      id: playerId,
      name: cleanName(name, joinCount),
      color: cleanColor(color, joinCount),
      connected: true,
      ball: { x: spot.x, y: spot.y, vx: 0, vy: 0, atRest: true, restSpot: { ...spot } },
      strokes: course.holes.map(() => 0),
    };
    joinCount++;
    state.players[playerId] = player;
    physics.addBall(playerId, spot);
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
    slowSteps.delete(playerId);
    emit({ type: "feed", payload: { text: `${player.name} left` }, audience: everyone });
    return { ok: true };
  }

  function shoot(playerId: string, angle: number, power: number): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0) {
      return { ok: false, reason: "invalid_payload" };
    }
    // Ticket 05 adds the phase check; Freeze (15) and Ball Grab (10) add theirs here.
    if (!player.ball.atRest) return { ok: false, reason: "ball_moving" };

    const speed = clamp(power, 0, 1) * MAX_SHOT_SPEED;
    const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    physics.setVelocity(playerId, velocity);
    player.ball.vx = velocity.x;
    player.ball.vy = velocity.y;
    player.ball.atRest = false;
    slowSteps.set(playerId, 0);
    player.strokes[state.holeIndex] = (player.strokes[state.holeIndex] ?? 0) + 1;
    return { ok: true };
  }

  /** One fixed 60 Hz step: move every ball, then apply the rest rule. */
  function physicsStep(): void {
    physics.step();
    elapsedMs += PHYSICS_STEP_MS;

    for (const [id, player] of Object.entries(state.players)) {
      const ball = player.ball;
      const motion = physics.motion(id);
      ball.x = motion.x;
      ball.y = motion.y;
      ball.vx = motion.vx;
      ball.vy = motion.vy;
      const speed = Math.hypot(motion.vx, motion.vy);

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
        case "shoot":
          return shoot(playerId, intent.angle, intent.power);
        default:
          return { ok: false, reason: "invalid_payload" };
      }
    },
    step(dtMs) {
      if (!(dtMs > 0)) return;
      // Physics only ever advances in whole fixed steps; leftovers carry over.
      pendingMs += dtMs;
      let steps = 0;
      while (pendingMs >= PHYSICS_STEP_MS - 1e-6 && steps < MAX_STEPS_PER_CALL) {
        physicsStep();
        pendingMs -= PHYSICS_STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_CALL) pendingMs = 0;
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
