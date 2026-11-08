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
