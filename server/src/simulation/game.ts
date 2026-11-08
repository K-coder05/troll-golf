import {
  MAX_PLAYERS,
  type CourseData,
  type GameSettings,
  type PlayerState,
  type RoomState,
} from "@troll-golf/shared";
import type { Clock } from "./clock";
import { everyone, type GameEvent } from "./events";
import type { Intent, IntentResult } from "./intents";
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
  // options.rng and options.clock are unused in M0; every later roll and
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
  // Simulation time in ms, advanced only by step(). Physics will run on this.
  let elapsedMs = 0;

  const currentHole = () => course.holes[state.holeIndex]!;

  const emit = (event: GameEvent) => events.push(event);

  function join(playerId: string, name: string, color: string): IntentResult {
    if (state.players[playerId]) return { ok: false, reason: "already_joined" };
    if (Object.keys(state.players).length >= MAX_PLAYERS) return { ok: false, reason: "room_full" };

    const player: PlayerState = {
      id: playerId,
      name: cleanName(name, joinCount),
      color: cleanColor(color, joinCount),
      connected: true,
      cursor: { x: 0, y: 0, active: false },
    };
    joinCount++;
    state.players[playerId] = player;
    emit({ type: "feed", payload: { text: `${player.name} joined` }, audience: everyone });
    return { ok: true };
  }

  function leave(playerId: string): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    // Lobby-only behaviour for now. Ticket 08 keeps the ball on the course
    // (connected = false) when someone drops mid-game.
    delete state.players[playerId];
    emit({ type: "feed", payload: { text: `${player.name} left` }, audience: everyone });
    return { ok: true };
  }

  function moveCursor(playerId: string, x: number, y: number): IntentResult {
    const player = state.players[playerId];
    if (!player) return { ok: false, reason: "unknown_player" };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: "invalid_payload" };
    const hole = currentHole();
    player.cursor.x = clamp(x, 0, hole.width);
    player.cursor.y = clamp(y, 0, hole.height);
    player.cursor.active = true;
    return { ok: true };
  }

  return {
    handleIntent(playerId, intent) {
      switch (intent.type) {
        case "join":
          return join(playerId, intent.name, intent.color);
        case "leave":
          return leave(playerId);
        case "cursor":
          return moveCursor(playerId, intent.x, intent.y);
        default:
          return { ok: false, reason: "invalid_payload" };
      }
    },
    step(dtMs) {
      if (!(dtMs > 0)) return;
      elapsedMs += dtMs;
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
