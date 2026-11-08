import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS, type JoinOptions } from "@troll-golf/shared";
import { isAdminSecret } from "../admin/auth";
import { adminBundlePath, issueAdminBundleToken } from "../admin/bundle";
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
  /** How many Admin Power log entries have been written to the server log. */
  private adminLogWritten = 0;
  /** How many Item log entries have been written to the server log. */
  private itemLogWritten = 0;

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
    // Items: the simulation checks the slot and validates the target or point.
    this.onMessage("useItem", (client, message: unknown) => {
      const { targetId, point } = (message ?? {}) as { targetId?: unknown; point?: unknown };
      this.game.handleIntent(client.sessionId, { type: "useItem", targetId, point });
      this.flush();
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
    // Admin Powers: the simulation checks that the sender is the Admin and validates everything.
    this.onMessage("admin", (client, message: unknown) => {
      const { power, mode, params } = (message ?? {}) as { power?: unknown; mode?: unknown; params?: unknown };
      this.game.handleIntent(client.sessionId, { type: "admin", power: String(power), mode: String(mode), params });
      this.flush();
    });

    this.setPatchRate(PATCH_MS);
    this.setSimulationInterval((dtMs) => this.tick(dtMs), STEP_MS);
  }

  override onJoin(client: Client, options?: Partial<JoinOptions>): void {
    // Admin authentication: the right secret makes this session the Admin; a
    // wrong one joins as an ordinary Player, with no sign that it was tried.
    const admin = isAdminSecret(options?.adminSecret);
    const result = this.game.handleIntent(client.sessionId, {
      type: "join",
      name: String(options?.name ?? ""),
      color: String(options?.color ?? ""),
      admin,
    });
    if (!result.ok) throw new Error(`Join refused: ${result.reason}`);
    this.flush();
    if (admin) this.sendAdminBundle(client);
  }

  /** Only the Admin's session learns where the admin bundle is, with a one-time token. */
  private sendAdminBundle(client: Client): void {
    if (this.game.getAdminId() !== client.sessionId) return;
    client.send("adminBundle", { path: adminBundlePath(issueAdminBundleToken()) });
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
    // Same session, so still the Admin. A reloaded page needs the bundle again (the client loads it once per page).
    this.sendAdminBundle(client);
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

  /** Mirror state into the schema, deliver pending events and write new Admin Power and Item log entries to the server log. */
  private flush(): void {
    syncState(this.state, this.game.getState());
    for (const event of this.game.drainEvents()) this.deliver(event);
    const log = this.game.getAdminLog();
    while (this.adminLogWritten < log.length) {
      console.info(`[admin-log] room=${this.roomId} ${JSON.stringify(log[this.adminLogWritten++])}`);
    }
    const itemLog = this.game.getItemLog();
    while (this.itemLogWritten < itemLog.length) {
      console.info(`[item-log] room=${this.roomId} ${JSON.stringify(itemLog[this.itemLogWritten++])}`);
    }
  }

  private deliver(event: GameEvent): void {
    const targets = recipientsFor(event, {
      all: this.clients,
      // Player ids are Colyseus session ids. A reconnecting client keeps its session id, so its Player.
      forPlayer: (playerId) => this.clients.find((c) => c.sessionId === playerId),
      // Admin-only events go to the Admin's connection or nowhere.
      admin: () => {
        const adminId = this.game.getAdminId();
        return adminId === null ? undefined : this.clients.find((c) => c.sessionId === adminId);
      },
    });
    for (const client of targets) client.send(event.type, event.payload);
  }
}
