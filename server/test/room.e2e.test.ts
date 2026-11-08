/**
 * Smoke test of the real server over WebSockets with the real client SDK.
 * The spec leaves the adapter to playtests; this only proves the wiring:
 * room codes, joining by code, the lobby (only the room creator configures and
 * starts), the 8-Player cap, a shot reaching everyone, and a dropped Player
 * reconnecting as themselves.
 */
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { isValidRoomCode, ROOM_NAME, type RoomState } from "@troll-golf/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "../src/app";

let server: Server;
/** Base URL of the test server, on whatever free port the OS gave it. */
let baseUrl = "";
const rooms: Room[] = [];

const ADMIN_SECRET = "golf-gods-e2e";

/** Rejects if `promise` takes longer than `ms`, so setup and teardown fail loudly instead of hanging. */
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took over ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  server = createGameServer();
  // Port 0: the OS picks a free port. A fixed or random port can clash with
  // another test run or dev server on the machine; Colyseus's listen() then
  // never settles (the EADDRINUSE error is only logged), or the clients end up
  // talking to the other process ("fetch failed" once it goes away).
  // 127.0.0.1 rather than "localhost" so client and server agree on IPv4.
  await within(server.listen(0, "127.0.0.1"), 5000, "server.listen");
  const http = (server.transport as unknown as { server: import("node:http").Server }).server;
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
  // Idle HTTP keep-alive sockets must outlive the gaps between requests, or a
  // request can race the server closing the socket it reuses ("fetch failed").
  http.keepAliveTimeout = 60_000;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await within(Promise.all(rooms.map((r) => r.leave().catch(() => undefined))), 5000, "leaving rooms").catch(() => undefined);
  await within(server.gracefullyShutdown(false), 5000, "server shutdown");
});

const newClient = () => new Client(baseUrl);
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
  return state?.players ?? new Map();
};

/** Joined rooms get these one-shot messages; register them so the SDK doesn't warn. */
function listen(room: Room, feed: string[] = []): Room {
  room.onMessage("hole", () => undefined);
  room.onMessage("time", () => undefined);
  room.onMessage("courses", () => undefined);
  room.onMessage("fx", () => undefined);
  room.onMessage("banner", () => undefined);
  room.onMessage("feed", (m: { text: string }) => feed.push(m.text));
  return room;
}

const stateOf = (room: Room) => (room.state ?? {}) as unknown as RoomState;

describe("GolfRoom over the network", () => {
  it("creates a room with a 4-letter code; friends join its lobby; only the room creator configures and starts", async () => {
    const mayaFeed: string[] = [];
    let mayaCourses: { id: string }[] = [];
    const maya = track(await newClient().create(ROOM_NAME, { name: "Maya", color: "#ff3366" }));
    listen(maya, mayaFeed);
    maya.onMessage("courses", (m: { courses: { id: string }[] }) => (mayaCourses = m.courses));
    expect(isValidRoomCode(maya.roomId)).toBe(true);

    const ben = listen(track(await newClient().joinById(maya.roomId, { name: "Ben", color: "#3366ff" })));
    const jay = listen(track(await newClient().joinById(maya.roomId, { name: "Jay", color: "#33cc66" })));
    expect(ben.roomId).toBe(maya.roomId);

    await waitFor(() => [maya, ben, jay].every((r) => playersOf(r).size === 3));
    expect(stateOf(ben).code).toBe(maya.roomId);
    // Everyone waits in the lobby; the room creator runs it. Rooms play the sample Course by default.
    expect(stateOf(ben).phase).toBe("lobby");
    expect(stateOf(jay).creatorId).toBe(maya.sessionId);
    expect(stateOf(ben).courseId).toBe("sample");
    // An everyone-audience event from the simulation reached Maya's connection.
    await waitFor(() => mayaFeed.includes("Ben joined") && mayaFeed.includes("Jay joined"));
    // The Courses she can pick were sent when she joined.
    await waitFor(() => mayaCourses.length > 0);
    expect(mayaCourses.map((c) => c.id)).toContain("placeholder");

    // Ben isn't the room creator: his Course change and start are ignored.
    ben.send("configure", { courseId: "placeholder" });
    ben.send("start", {});
    await new Promise((r) => setTimeout(r, 200));
    expect(stateOf(jay).phase).toBe("lobby");
    expect(stateOf(jay).courseId).toBe("sample");

    // Maya picks the Course and starts: everyone goes to the 3-2-1, then plays.
    maya.send("configure", { courseId: "placeholder" });
    await waitFor(() => stateOf(jay).courseId === "placeholder");
    maya.send("start", {});
    const phase = () => stateOf(ben).phase;
    await waitFor(() => phase() === "countdown");
    await waitFor(() => phase() === "playing", 4000);

    // Maya shoots; Ben's copy of the state sees her ball leave the Tee and count a Stroke.
    const mayaBall = () => playersOf(ben).get(maya.sessionId)?.ball;
    const start = { x: mayaBall()!.x, y: mayaBall()!.y };
    maya.send("shoot", { angle: Math.PI / 2, power: 0.3 });
    await waitFor(() => mayaBall()!.atRest === false);
    await waitFor(() => mayaBall()!.atRest === true, 5000);
    expect(mayaBall()!.x).toBeCloseTo(start.x, 0);
    expect(mayaBall()!.y).not.toBeCloseTo(start.y, 0);
    expect(playersOf(ben).get(maya.sessionId)?.strokes[0]).toBe(1);
    // Standing is synced: Maya has a Stroke, the others none.
    expect(playersOf(jay).get(maya.sessionId)?.standing).toBe(3);
  }, 15_000);

  it("hands the lobby to the next Player when the room creator leaves", async () => {
    const maya = listen(track(await newClient().create(ROOM_NAME, { name: "Maya", color: "#ff3366" })));
    const ben = listen(track(await newClient().joinById(maya.roomId, { name: "Ben", color: "#3366ff" })));
    await waitFor(() => playersOf(ben).size === 2);
    expect(stateOf(ben).creatorId).toBe(maya.sessionId);

    await maya.leave();
    await waitFor(() => stateOf(ben).creatorId === ben.sessionId);
    ben.send("start", {});
    await waitFor(() => stateOf(ben).phase === "countdown");
  });

  it("a dropped Player is shown disconnected, then reconnects as the same Player with their Strokes", async () => {
    const maya = listen(track(await newClient().create(ROOM_NAME, { name: "Maya", color: "#ff3366" })));
    const ben = listen(track(await newClient().joinById(maya.roomId, { name: "Ben", color: "#3366ff" })));
    await waitFor(() => playersOf(maya).size === 2);
    maya.send("configure", { courseId: "placeholder" });
    await waitFor(() => stateOf(ben).courseId === "placeholder");
    maya.send("start", {});
    await waitFor(() => stateOf(ben).phase === "playing", 5000);

    const benSeenByMaya = () => playersOf(maya).get(ben.sessionId);
    ben.send("shoot", { angle: -Math.PI / 2, power: 0.2 });
    await waitFor(() => benSeenByMaya()?.strokes[0] === 1 && benSeenByMaya()!.ball.atRest, 5000);
    const sessionId = ben.sessionId;

    // A Wi-Fi blip: the socket closes without a goodbye; the SDK reconnects on its own.
    ben.reconnection.minUptime = 0;
    void ben.leave(false);
    await waitFor(() => benSeenByMaya()?.connected === false);
    await waitFor(() => benSeenByMaya()?.connected === true, 5000);
    expect(ben.sessionId).toBe(sessionId);
    expect(benSeenByMaya()?.strokes[0]).toBe(1);

    // A page reload: a brand-new client comes back with the stored reconnection token.
    ben.reconnection.enabled = false;
    const token = ben.reconnectionToken;
    void ben.leave(false);
    await waitFor(() => benSeenByMaya()?.connected === false);
    const back = listen(track(await newClient().reconnect(token)));
    expect(back.sessionId).toBe(sessionId);
    await waitFor(() => benSeenByMaya()?.connected === true);
    await waitFor(() => playersOf(back).get(sessionId)?.strokes[0] === 1);
    expect(stateOf(back).phase).toBe("playing");
    // And plays on: a second shot counts on top of the first.
    await waitFor(() => playersOf(back).get(sessionId)?.ball.atRest === true);
    back.send("shoot", { angle: 0, power: 0.2 });
    await waitFor(() => benSeenByMaya()?.strokes[0] === 2, 3000);
  }, 20_000);

  it("refuses a join with a wrong code", async () => {
    await expect(newClient().joinById("ZZZZ", { name: "Lost", color: "#000000" })).rejects.toThrow();
  });

  it("refuses a 9th join", async () => {
    const host = listen(track(await newClient().create(ROOM_NAME, { name: "P1", color: "#111111" })));
    for (let i = 2; i <= 8; i++) {
      listen(track(await newClient().joinById(host.roomId, { name: `P${i}`, color: "#222222" })));
    }
    await waitFor(() => playersOf(host).size === 8);
    await expect(newClient().joinById(host.roomId, { name: "P9", color: "#333333" })).rejects.toThrow();
  });

  it("authenticates the Admin by secret, serves the admin bundle only to them, and runs Admin Powers", async () => {
    const mayaBundle: string[] = [];
    const mayaResults: unknown[] = [];
    const maya = listen(track(await newClient().create(ROOM_NAME, { name: "Maya", color: "#ff3366", adminSecret: ADMIN_SECRET })));
    maya.onMessage("adminBundle", (m: { path: string }) => mayaBundle.push(m.path));
    maya.onMessage("adminResult", (m: unknown) => mayaResults.push(m));

    // A wrong secret joins as an ordinary Player.
    const benOther: string[] = [];
    const benBanners: { text: string; detail?: string }[] = [];
    const ben = listen(track(await newClient().joinById(maya.roomId, { name: "Ben", color: "#3366ff", adminSecret: "guess" })));
    ben.onMessage("banner", (m: { text: string; detail?: string }) => benBanners.push(m));
    for (const type of ["adminBundle", "adminResult"]) ben.onMessage(type, () => benOther.push(type));
    // A second Admin in the same room is refused.
    await expect(
      newClient().joinById(maya.roomId, { name: "Zed", color: "#000000", adminSecret: ADMIN_SECRET }),
    ).rejects.toThrow(/admin_taken/);

    await waitFor(() => mayaBundle.length === 1);
    const url = `${baseUrl}${mayaBundle[0]}`;
    const bundle = await fetch(url);
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get("content-type")).toMatch(/javascript/);
    const source = await bundle.text();
    expect(source).toContain("Scoreboard Edit");
    // One-time: the same link doesn't work twice, and made-up ones never do.
    expect((await fetch(url)).status).toBe(404);
    expect((await fetch(`${baseUrl}/admin-bundle/${"0".repeat(48)}.js`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/admin.js`)).status).toBe(404);

    maya.send("configure", { courseId: "placeholder" });
    await waitFor(() => stateOf(ben).courseId === "placeholder");
    maya.send("start", {});
    await waitFor(() => stateOf(ben).phase === "playing", 5000);

    // Ben's admin intent is rejected; Maya's goes through.
    ben.send("admin", { power: "scoreboardEdit", mode: "loud", params: { targetId: maya.sessionId, delta: 5 } });
    maya.send("admin", { power: "scoreboardEdit", mode: "loud", params: { targetId: ben.sessionId, delta: 2 } });
    await waitFor(() => playersOf(ben).get(ben.sessionId)?.strokes[0] === 2);
    await waitFor(() => benBanners.length === 1 && mayaResults.length === 1);
    expect(benBanners[0]).toEqual({ text: "👑 The Golf Gods have spoken", detail: "Ben: +2 Strokes" });
    expect(playersOf(ben).get(maya.sessionId)?.strokes[0]).toBe(0);
    expect(mayaResults[0]).toMatchObject({ ok: true, power: "scoreboardEdit", mode: "loud" });
    // Terrain Paint: the stroke is synced terrain; a client joining afterwards replays the same list.
    maya.send("admin", {
      power: "terrainPaint",
      mode: "stealth",
      params: { action: "stroke", surface: "water", radius: 30, points: [{ x: 600, y: 100 }] },
    });
    maya.send("admin", { power: "terrainPaint", mode: "stealth", params: { action: "extend", points: [{ x: 700, y: 100 }] } });
    const edits = (room: Room) => JSON.parse(JSON.stringify(stateOf(room).terrainEdits ?? [])) as unknown[];
    const painted = [{ id: 1, kind: "paint", surface: "water", radius: 30, expiresAt: 0, points: [{ x: 600, y: 100 }, { x: 700, y: 100 }] }];
    await waitFor(() => JSON.stringify(edits(ben)) === JSON.stringify(painted));
    const late = listen(track(await newClient().joinById(maya.roomId, { name: "Jay", color: "#33cc66" })));
    await waitFor(() => edits(late).length === 1);
    expect(edits(late)).toEqual(edits(ben));
    expect(benBanners).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 100));
    expect(benOther).toEqual([]);
  }, 20_000);
});
