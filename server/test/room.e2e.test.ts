/**
 * Smoke test of the real server over WebSockets with the real client SDK.
 * The spec leaves the adapter to playtests; this only proves the wiring:
 * room codes, joining by code, the 8-Player cap and a shot reaching everyone.
 */
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { isValidRoomCode, ROOM_NAME, type RoomState } from "@troll-golf/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "../src/app";

const PORT = 25670 + Math.floor(Math.random() * 1000);
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  server = createGameServer();
  await server.listen(PORT);
});

afterAll(async () => {
  await Promise.all(rooms.map((r) => r.leave().catch(() => undefined)));
  await server.gracefullyShutdown(false);
});

const newClient = () => new Client(`http://localhost:${PORT}`);
const track = <R extends Room>(room: R) => (rooms.push(room), room);

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const playersOf = (room: Room) => {
  const state = room.state as unknown as { players: Map<string, RoomState["players"][string]> };
  return state.players;
};

describe("GolfRoom over the network", () => {
  it("creates a room with a 4-letter code and a second client joins it by code", async () => {
    const maya = track(await newClient().create(ROOM_NAME, { name: "Maya", color: "#ff3366" }));
    expect(isValidRoomCode(maya.roomId)).toBe(true);
    maya.onMessage("hole", () => undefined);
    const mayaFeed: string[] = [];
    maya.onMessage("feed", (m: { text: string }) => mayaFeed.push(m.text));

    const ben = track(await newClient().joinById(maya.roomId, { name: "Ben", color: "#3366ff" }));
    ben.onMessage("hole", () => undefined);
    expect(ben.roomId).toBe(maya.roomId);

    await waitFor(() => playersOf(maya).size === 2 && playersOf(ben).size === 2);
    expect((ben.state as unknown as RoomState).code).toBe(maya.roomId);
    // An everyone-audience event from the simulation reached Maya's connection.
    await waitFor(() => mayaFeed.includes("Ben joined"));

    // Maya shoots; Ben's copy of the state sees her ball leave the Tee and count a Stroke.
    const mayaBall = () => playersOf(ben).get(maya.sessionId)?.ball;
    const startX = mayaBall()!.x;
    maya.send("shoot", { angle: Math.PI / 2, power: 0.5 });
    await waitFor(() => mayaBall()!.atRest === false);
    await waitFor(() => mayaBall()!.atRest === true, 5000);
    expect(mayaBall()!.x).toBeCloseTo(startX, 0);
    expect(mayaBall()!.y).not.toBeCloseTo(320, 0);
    expect(playersOf(ben).get(maya.sessionId)?.strokes[0]).toBe(1);
  }, 10_000);

  it("refuses a join with a wrong code", async () => {
    await expect(newClient().joinById("ZZZZ", { name: "Lost", color: "#000000" })).rejects.toThrow();
  });

  it("refuses a 9th join", async () => {
    const host = track(await newClient().create(ROOM_NAME, { name: "P1", color: "#111111" }));
    for (let i = 2; i <= 8; i++) {
      track(await newClient().joinById(host.roomId, { name: `P${i}`, color: "#222222" }));
    }
    await waitFor(() => playersOf(host).size === 8);
    await expect(newClient().joinById(host.roomId, { name: "P9", color: "#333333" })).rejects.toThrow();
  });
});
