import type { AdminMode, AdminPowerId, AdminPowerParams, CourseData, GameSettings } from "@troll-golf/shared";
import { placeholderCourse } from "../src/courses/placeholder";
import {
  COUNTDOWN_MS,
  createGame,
  createSeededRng,
  ManualClock,
  type CreateGameOptions,
  type Game,
  type GameEvent,
  type Intent,
  type IntentResult,
} from "../src/simulation";

export const FRAME_MS = 1000 / 60;

export interface TestGameOptions {
  course?: CourseData;
  /** Other Courses the room creator may pick in the lobby. */
  courses?: Record<string, CourseData>;
  settings?: Partial<GameSettings>;
  seed?: number;
  code?: string;
  /** Item data and handlers other than the defaults. */
  items?: CreateGameOptions["items"];
}

/**
 * Drives a Game the way a test scenario reads: Players join, send intents and
 * time passes. Everything goes through the simulation's public interface.
 */
export class TestGame {
  readonly game: Game;
  readonly clock = new ManualClock(1_000_000);

  constructor(options: TestGameOptions = {}) {
    this.game = createGame({
      course: options.course ?? placeholderCourse,
      courses: options.courses,
      code: options.code ?? "TEST",
      settings: options.settings,
      rng: createSeededRng(options.seed ?? 1),
      clock: this.clock,
      items: options.items,
    });
  }

  get state() {
    return this.game.getState();
  }

  send(playerId: string, intent: Intent): IntentResult {
    return this.game.handleIntent(playerId, intent);
  }

  join(playerId: string, name = playerId, color = "#ffffff"): IntentResult {
    return this.send(playerId, { type: "join", name, color });
  }

  /** Join with the admin secret already checked by the adapter. */
  joinAsAdmin(playerId: string, name = playerId, color = "#ffffff"): IntentResult {
    return this.send(playerId, { type: "join", name, color, admin: true });
  }

  /** Use an Admin Power from `playerId`'s session (Stealth unless told otherwise). */
  adminPower<K extends AdminPowerId>(
    playerId: string,
    power: K,
    params: AdminPowerParams[K],
    mode: AdminMode = "stealth",
  ): IntentResult {
    return this.send(playerId, { type: "admin", power, mode, params });
  }

  /** Start the game from the lobby (as the first Player, the room creator) and wait out the 3-2-1, so shots are allowed. */
  startPlaying(): void {
    const first = Object.keys(this.state.players)[0];
    if (!first) throw new Error("Nobody has joined");
    const result = this.send(first, { type: "start" });
    if (!result.ok) throw new Error(`Start refused: ${result.reason}`);
    // Frame times don't add up to exactly 3000 ms in floating point; allow one extra frame.
    this.advanceUntilPhase("playing", COUNTDOWN_MS + FRAME_MS);
  }

  /** Advance frame by frame until the phase changes to `phase`. Returns the ms it took. */
  advanceUntilPhase(phase: string, maxMs = 200_000): number {
    let elapsed = 0;
    while (this.state.phase !== phase) {
      if (elapsed >= maxMs) throw new Error(`Still ${this.state.phase} after ${maxMs} ms, expected ${phase}`);
      this.advance(FRAME_MS);
      elapsed += FRAME_MS;
    }
    return elapsed;
  }

  shoot(playerId: string, angle: number, power: number): IntentResult {
    return this.send(playerId, { type: "shoot", angle, power });
  }

  ball(playerId: string) {
    const player = this.state.players[playerId];
    if (!player) throw new Error(`No player ${playerId}`);
    return player.ball;
  }

  /** Advance frame by frame until the Player's ball is at rest. Returns the ms it took. */
  advanceUntilRest(playerId: string, maxMs = 15_000): number {
    let elapsed = 0;
    while (!this.ball(playerId).atRest) {
      if (elapsed >= maxMs) throw new Error(`${playerId}'s ball still moving after ${maxMs} ms`);
      this.advance(FRAME_MS);
      elapsed += FRAME_MS;
    }
    return elapsed;
  }

  /** Advance time in 60 Hz frames, moving the clock and stepping the simulation together. */
  advance(ms: number): void {
    let remaining = ms;
    while (remaining > 0) {
      const dt = Math.min(FRAME_MS, remaining);
      this.clock.advance(dt);
      this.game.step(dt);
      remaining -= dt;
    }
  }

  drain(): GameEvent[] {
    return this.game.drainEvents();
  }

  /** Drained events that may reach anyone but the Admin (everyone + addressed to a Player). */
  static nonAdmin(events: GameEvent[]): GameEvent[] {
    return events.filter((e) => e.audience.kind !== "admin");
  }

  /** Drained events a given Player's screen would receive (everyone + addressed to them). */
  static seenBy(events: GameEvent[], playerId: string): GameEvent[] {
    return events.filter(
      (e) =>
        e.audience.kind === "everyone" || (e.audience.kind === "player" && e.audience.playerId === playerId),
    );
  }
}
