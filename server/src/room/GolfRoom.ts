import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS, type JoinOptions } from "@troll-golf/shared";
import { placeholderCourse } from "../courses/placeholder";
import { createGame, mathRandomRng, systemClock, type Game, type GameEvent } from "../simulation";
import { claimRoomCode, releaseRoomCode } from "./roomCodes";
import { recipientsFor } from "./routeEvents";
import { RoomStateSchema } from "./schema";
import { syncState } from "./syncState";

const STEP_MS = 1000 / 60;
const PATCH_MS = 1000 / 20;

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
    this.game = createGame({ course: placeholderCourse, code, rng: mathRandomRng, clock: systemClock });
    this.state = new RoomStateSchema();
    syncState(this.state, this.game.getState());

    this.onMessage("cursor", (client, message: unknown) => {
      const { x, y } = (message ?? {}) as { x?: unknown; y?: unknown };
      this.game.handleIntent(client.sessionId, { type: "cursor", x: Number(x), y: Number(y) });
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
      // Player ids are Colyseus session ids for now; ticket 08 (reconnects) may map them.
      forPlayer: (playerId) => this.clients.find((c) => c.sessionId === playerId),
      // No Admin until ticket 09, so admin-only events are dropped.
      admin: () => undefined,
    });
    for (const client of targets) client.send(event.type, event.payload);
  }
}
