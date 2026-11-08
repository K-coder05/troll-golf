import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS, type JoinOptions } from "@troll-golf/shared";
import { courses, defaultCourse } from "../courses";
import { createGame, mathRandomRng, systemClock, type Game, type GameEvent } from "../simulation";
import { claimRoomCode, releaseRoomCode } from "./roomCodes";
import { recipientsFor } from "./routeEvents";
import { RoomStateSchema } from "./schema";
import { syncState } from "./syncState";

const STEP_MS = 1000 / 60;
const PATCH_MS = 1000 / 20;
/**
 * How long a dropped Player's seat is kept for them to reconnect. In the lobby
 * a short grace period covers a page reload; mid-game it covers about a whole
 * 9-Hole game, so a Player who comes back late still gets their own ball and
 * scores. Once it runs out they have left (onLeave).
 */
export const RECONNECT_WINDOW_SEC = { lobby: 30, game: 20 * 60 } as const;

/**
 * Thin Colyseus adapter around the Game simulation. It translates network
 * messages into intents, runs the 60 Hz loop, mirrors state into the schema
 * and routes drained events by audience. No game rules live here.
 *
 * The room id is the 4-letter room code, so `joinById(code)` is "join by code".
 */
export class GolfRoom extends Room<{ state: RoomStateSchema }> {
  override maxClients = MAX_PLAYERS;
  private game!: Game;

  override onCreate(): void {
    const code = claimRoomCode();
    this.roomId = code;
    this.game = createGame({ course: defaultCourse, courses, code, rng: mathRandomRng, clock: systemClock });
    this.state = new RoomStateSchema();
    syncState(this.state, this.game.getState());

    this.onMessage("shoot", (client, message: unknown) => {
      const { angle, power } = (message ?? {}) as { angle?: unknown; power?: unknown };
      this.game.handleIntent(client.sessionId, { type: "shoot", angle: Number(angle), power: Number(power) });
    });
    // Lobby: the simulation checks that only the room creator may do these.
    this.onMessage("configure", (client, message: unknown) => {
      const { courseId } = (message ?? {}) as { courseId?: unknown };
      this.game.handleIntent(client.sessionId, {
        type: "configure",
        courseId: courseId === undefined ? undefined : String(courseId),
      });
      this.flush();
    });
    this.onMessage("start", (client) => {
      this.game.handleIntent(client.sessionId, { type: "start" });
      this.flush();
    });

    this.setPatchRate(PATCH_MS);
    this.setSimulationInterval((dtMs) => this.tick(dtMs), STEP_MS);
  }

  override onJoin(client: Client, options?: Partial<JoinOptions>): void {
    // Admin authentication (options.adminSecret vs an env var) arrives in ticket 09.
    const result = this.game.handleIntent(client.sessionId, {
      type: "join",
      name: String(options?.name ?? ""),
      color: String(options?.color ?? ""),
    });
    if (!result.ok) throw new Error(`Join refused: ${result.reason}`);
    this.flush();
  }

  /**
   * The connection dropped without a goodbye (Wi-Fi blip, page reload). The
   * Player stays, disconnected, and Colyseus keeps their seat so the client
   * can come back with its reconnection token (same session id, so the same
   * Player). See RECONNECT_WINDOW_SEC. If the window runs out, Colyseus calls
   * onLeave.
   */
  override onDrop(client: Client): void {
    this.game.handleIntent(client.sessionId, { type: "disconnect" });
    this.flush();
    const seconds = this.game.getState().phase === "lobby" ? RECONNECT_WINDOW_SEC.lobby : RECONNECT_WINDOW_SEC.game;
    // Rejection (window over) is handled by Colyseus, which then calls onLeave.
    this.allowReconnection(client, seconds).catch(() => undefined);
  }

  override onReconnect(client: Client): void {
    this.game.handleIntent(client.sessionId, { type: "reconnect" });
    this.flush();
  }

  /** A consented leave, or a drop whose reconnection window ran out: gone for good. */
  override onLeave(client: Client): void {
    this.game.handleIntent(client.sessionId, { type: "leave" });
    this.flush();
  }

  override onDispose(): void {
    releaseRoomCode(this.roomId);
  }

  private tick(dtMs: number): void {
    this.game.step(dtMs);
    this.flush();
  }

  /** Mirror state into the schema and deliver pending events. */
  private flush(): void {
    syncState(this.state, this.game.getState());
    for (const event of this.game.drainEvents()) this.deliver(event);
  }

  private deliver(event: GameEvent): void {
    const targets = recipientsFor(event, {
      all: this.clients,
      // Player ids are Colyseus session ids. A reconnecting client keeps its session id, so its Player.
      forPlayer: (playerId) => this.clients.find((c) => c.sessionId === playerId),
      // No Admin until ticket 09, so admin-only events are dropped.
      admin: () => undefined,
    });
    for (const client of targets) client.send(event.type, event.payload);
  }
}
