import { Client, type Room } from "@colyseus/sdk";
import { normalizeRoomCode, ROOM_NAME, type JoinOptions } from "@troll-golf/shared";

/**
 * In production the server serves this page, so it lives at the same origin.
 * Under `vite` dev (port 5173) the game server runs separately on 2567.
 */
function serverUrl(): string {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (override) return override;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

const client = new Client(serverUrl());

export function createRoom(options: JoinOptions): Promise<Room> {
  return client.create(ROOM_NAME, options);
}

/** The room id is the room code, so joining by code is joining by id. */
export function joinRoom(code: string, options: JoinOptions): Promise<Room> {
  return client.joinById(normalizeRoomCode(code), options);
}

// ---- Coming back after a page reload ----
// A dropped connection is retried by the SDK on its own. A reload loses the
// Room object, so the reconnection token is kept in sessionStorage (per tab)
// and handed back to the server, which still holds this Player's seat.

const TOKEN_KEY = "troll-golf:reconnect";

interface SavedSeat {
  code: string;
  token: string;
}

/** Remember how to get back into this room (call on join and after every reconnect). */
export function rememberSeat(room: Room): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ code: room.roomId, token: room.reconnectionToken } satisfies SavedSeat));
  } catch {
    // Storage blocked: a reload just means joining again.
  }
}

export function forgetSeat(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Rejoin room `code` as the same Player, if this tab was in it. Resolves null if that isn't possible. */
export async function rejoinRoom(code: string): Promise<Room | null> {
  let saved: SavedSeat | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null") as SavedSeat | null;
  } catch {
    return null;
  }
  if (!saved?.token || saved.code !== code) return null;
  try {
    return await client.reconnect(saved.token);
  } catch {
    forgetSeat();
    return null;
  }
}
