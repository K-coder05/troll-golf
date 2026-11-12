import { GOLF_GODS_BANNER, type CourseData, type HoleData } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { RoomStateSchema } from "../../src/room/schema";
import { syncState } from "../../src/room/syncState";
import { TestGame } from "../harness";

/**
 * Magnet/Repel, Spawn Wall and Invert Controls. An open Hole 2000 x 600: Tee
 * (100, 300) (Maya on it, Ben one slot up at y 280), Cup at (500, 150).
 */
function course(holes = 1, cup = { x: 500, y: 150, radius: 12 }): CourseData {
  const base: HoleData = {
    id: "t",
    name: "T",
    par: 3,
    width: 2000,
    height: 600,
    tee: { x: 100, y: 300 },
    cup,
    walls: [],
    surfaces: [],
    boostPads: [],
    teleporters: [],
    itemBoxes: [],
    windmills: [],
    slidingWalls: [],
  };
  return { id: "t", name: "T", holes: Array.from({ length: holes }, (_, i) => ({ ...base, id: `t${i}` })) };
}

function game(c: CourseData = course()): TestGame {
  const t = new TestGame({ course: c });
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.startPlaying();
  t.drain();
  return t;
}

/** How far (px, y) the player's ball has drifted 600 ms after a straight shot along +x. */
function drift(t: TestGame, id: "maya" | "ben"): number {
  const y0 = t.ball(id).y;
  expect(t.shoot(id, 0, 0.6)).toEqual({ ok: true });
  t.advance(600);
  return t.ball(id).y - y0;
}

const magnet = (t: TestGame, enabled: boolean, mode: "stealth" | "loud" = "stealth") =>
  t.adminPower("maya", "magnet", { action: "toggle", enabled }, mode);

describe("Magnet/Repel", () => {
  it("is off until switched on: shots roll dead straight", () => {
    const t = game();
    expect(Math.abs(drift(t, "maya"))).toBeLessThan(0.01);
  });

  it("curves the Admin's ball toward the Cup and others' away from it", () => {
    const a = game();
    expect(magnet(a, true)).toEqual({ ok: true });
    expect(drift(a, "maya")).toBeLessThan(-10); // the Cup is up (smaller y)
    const b = game();
    magnet(b, true);
    expect(drift(b, "ben")).toBeGreaterThan(10);
  });

  it("turning it off stops the force", () => {
    const t = game();
    magnet(t, true);
    magnet(t, false);
    expect(Math.abs(drift(t, "maya"))).toBeLessThan(0.01);
  });

  it("can be set per Player: attract, repel or off", () => {
    const a = game();
    magnet(a, true);
    expect(a.adminPower("maya", "magnet", { action: "set", targetId: "ben", polarity: "attract" })).toEqual({ ok: true });
    expect(drift(a, "ben")).toBeLessThan(-10);
    const b = game();
    magnet(b, true);
    b.adminPower("maya", "magnet", { action: "set", targetId: "maya", polarity: "repel" });
    expect(drift(b, "maya")).toBeGreaterThan(10);
    const c = game();
    magnet(c, true);
    c.adminPower("maya", "magnet", { action: "set", targetId: "ben", polarity: "off" });
    expect(Math.abs(drift(c, "ben"))).toBeLessThan(0.01);
    expect(c.adminPower("maya", "magnet", { action: "set", targetId: "nobody", polarity: "off" })).toEqual({ ok: false, reason: "unknown_target" });
  });

  it("is forgotten at the next Hole", () => {
    const t = game(course(2));
    magnet(t, true);
    t.adminPower("maya", "magnet", { action: "set", targetId: "ben", polarity: "attract" });
    t.advanceUntilPhase("holeEnd");
    t.advanceUntilPhase("countdown");
    t.advanceUntilPhase("playing");
    expect(Math.abs(drift(t, "maya"))).toBeLessThan(0.01);
  });

  it("Stealth emits nothing to anyone but the Admin; Loud shows the banner", () => {
    const t = game();
    magnet(t, true, "stealth");
    expect(TestGame.nonAdmin(t.drain())).toEqual([]);
    magnet(t, false, "loud");
    const banners = TestGame.nonAdmin(t.drain()).filter((e) => e.type === "banner");
    expect(banners).toHaveLength(1);
    expect(banners[0]!.payload).toMatchObject({ text: GOLF_GODS_BANNER });
  });

  it("is refused for anyone but the Admin", () => {
    const t = game();
    expect(t.adminPower("ben", "magnet", { action: "toggle", enabled: true })).toEqual({ ok: false, reason: "not_admin" });
  });
});

const wall = (x0: number, y0: number, x1: number, y1: number, extra: { thickness?: number; durationSec?: number } = {}) =>
  ({ action: "spawn" as const, a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, ...extra });

describe("Spawn Wall", () => {
  it("deflects a ball that would have rolled through", () => {
    const free = game();
    free.shoot("ben", 0, 1);
    free.advanceUntilRest("ben");
    expect(free.ball("ben").x).toBeGreaterThan(900);

    const t = game();
    expect(t.adminPower("maya", "spawnWall", wall(700, 0, 700, 600))).toEqual({ ok: true });
    t.shoot("ben", 0, 1);
    t.advanceUntilRest("ben");
    expect(t.ball("ben").x).toBeLessThan(700);
  });

  it("is a terrain edit in synced state, so a client that joins later sees it", () => {
    const t = game();
    t.adminPower("maya", "spawnWall", wall(700, 100, 700, 500, { thickness: 20 }));
    const edit = t.state.terrainEdits[0]!;
    expect(edit).toMatchObject({ kind: "wall", radius: 10, expiresAt: 0, points: [{ x: 700, y: 100 }, { x: 700, y: 500 }] });
    const fresh = new RoomStateSchema();
    syncState(fresh, t.state);
    expect(fresh.terrainEdits).toHaveLength(1);
    expect(fresh.terrainEdits[0]).toMatchObject({ kind: "wall", radius: 10, surface: "" });
    expect(fresh.terrainEdits[0]!.points).toHaveLength(2);
  });

  it("a timed wall disappears after N seconds and balls roll through again", () => {
    const t = game();
    t.adminPower("maya", "spawnWall", wall(700, 0, 700, 600, { durationSec: 2 }));
    t.advance(1900);
    expect(t.state.terrainEdits).toHaveLength(1);
    t.advance(300);
    expect(t.state.terrainEdits).toHaveLength(0);
    t.shoot("ben", 0, 1);
    t.advanceUntilRest("ben");
    expect(t.ball("ben").x).toBeGreaterThan(900);
  });

  it("walls reset at the next Hole", () => {
    const t = game(course(2));
    t.adminPower("maya", "spawnWall", wall(700, 0, 700, 600));
    t.advanceUntilPhase("holeEnd");
    t.advanceUntilPhase("countdown");
    expect(t.state.terrainEdits).toHaveLength(0);
    t.advanceUntilPhase("playing");
    t.shoot("ben", 0, 1);
    t.advanceUntilRest("ben");
    expect(t.ball("ben").x).toBeGreaterThan(900);
  });

  it("moves a ball it would overlap clear of it", () => {
    const t = game();
    const before = { ...t.ball("ben") };
    expect(t.adminPower("maya", "spawnWall", wall(60, before.y, 140, before.y, { thickness: 20 }))).toEqual({ ok: true });
    const ball = t.ball("ben");
    expect(Math.abs(ball.y - before.y)).toBeGreaterThanOrEqual(10 + 8);
    expect(ball.atRest).toBe(true);
    expect(ball.restSpot).toEqual({ x: ball.x, y: ball.y });
  });

  it("refuses a wall on the Cup, a wall too short, and a thin wall's bad numbers", () => {
    const t = game();
    expect(t.adminPower("maya", "spawnWall", wall(500, 100, 500, 200))).toEqual({ ok: false, reason: "wall_blocked" });
    expect(t.adminPower("maya", "spawnWall", wall(500, 300, 505, 300))).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.adminPower("maya", "spawnWall", wall(500, 300, 600, 300, { thickness: 1 }))).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.state.terrainEdits).toHaveLength(0);
  });

  it("shares the terrain budget and Clear removes only walls", () => {
    const t = game();
    t.adminPower("maya", "terrainPaint", { action: "stroke", surface: "sand", radius: 20, points: [{ x: 1500, y: 300 }] });
    t.adminPower("maya", "spawnWall", wall(700, 0, 700, 600));
    expect(t.state.terrainEdits.map((e) => e.kind)).toEqual(["paint", "wall"]);
    t.adminPower("maya", "terrainPaint", { action: "clear" });
    expect(t.state.terrainEdits.map((e) => e.kind)).toEqual(["wall"]);
    t.adminPower("maya", "terrainPaint", { action: "stroke", surface: "sand", radius: 20, points: [{ x: 1500, y: 300 }] });
    expect(t.adminPower("maya", "spawnWall", { action: "clear" })).toEqual({ ok: true });
    expect(t.state.terrainEdits.map((e) => e.kind)).toEqual(["paint"]);
  });

  it("a Ghost Ball passes through a spawned wall like any other wall", () => {
    const t = game();
    t.adminPower("maya", "spawnWall", wall(700, 0, 700, 600));
    t.adminPower("maya", "giveItem", { targetId: "ben", item: "ghostBall" });
    expect(t.send("ben", { type: "useItem" })).toEqual({ ok: true });
    t.shoot("ben", 0, 1);
    t.advanceUntilRest("ben");
    expect(t.ball("ben").x).toBeGreaterThan(900);
  });

  it("Stealth emits nothing to non-Admins; Loud shows the banner", () => {
    const t = game();
    t.adminPower("maya", "spawnWall", wall(700, 0, 700, 600));
    expect(TestGame.nonAdmin(t.drain())).toEqual([]);
    t.adminPower("maya", "spawnWall", wall(900, 0, 900, 600), "loud");
    expect(TestGame.nonAdmin(t.drain()).filter((e) => e.type === "banner")).toHaveLength(1);
  });
});

describe("Invert Controls", () => {
  const invert = (t: TestGame, targetId: string, mode: "stealth" | "loud" = "stealth", durationSec?: number) =>
    t.adminPower("maya", "invertControls", { targetId, ...(durationSec !== undefined ? { durationSec } : {}) }, mode);

  it("fires the target's shot opposite to their drag; others are unaffected", () => {
    const t = game();
    expect(invert(t, "ben")).toEqual({ ok: true });
    t.shoot("ben", 0, 0.5);
    expect(t.ball("ben").vx).toBeLessThan(0);
    expect(Math.abs(t.ball("ben").vy)).toBeLessThan(1e-6);
    t.shoot("maya", 0, 0.5);
    expect(t.ball("maya").vx).toBeGreaterThan(0);
  });

  it("works on the Admin too, and ignores Shields and immunity", () => {
    const t = game();
    t.adminPower("maya", "giveItem", { targetId: "ben", item: "shield" });
    t.send("ben", { type: "useItem" });
    expect(invert(t, "ben")).toEqual({ ok: true });
    expect(invert(t, "maya")).toEqual({ ok: true });
    t.shoot("ben", Math.PI / 2, 0.5);
    expect(t.ball("ben").vy).toBeLessThan(0);
    t.shoot("maya", 0, 0.5);
    expect(t.ball("maya").vx).toBeLessThan(0);
  });

  it("wears off after its duration (default 20 s, or the one given)", () => {
    const t = game();
    invert(t, "ben", "stealth", 2);
    t.advance(2100);
    t.shoot("ben", 0, 0.5);
    expect(t.ball("ben").vx).toBeGreaterThan(0);

    const d = game();
    invert(d, "ben");
    d.advance(19_000);
    d.shoot("ben", 0, 0.5);
    expect(d.ball("ben").vx).toBeLessThan(0);
  });

  it("Stealth is server-only: no event or state change anyone but the Admin can see", () => {
    const t = game();
    invert(t, "ben", "stealth");
    expect(TestGame.nonAdmin(t.drain())).toEqual([]);
    expect(t.state.players.ben!.effects).toEqual([]);
    expect(JSON.stringify(t.state)).not.toContain("invert");
    // The Admin's x-ray does know.
    t.advance(300);
    const xray = t.drain().find((e) => e.type === "xray");
    expect(xray?.audience.kind).toBe("admin");
    const ben = (xray!.payload as { players: { id: string; effects: { kind: string; visible: boolean }[] }[] }).players.find((p) => p.id === "ben");
    expect(ben!.effects).toEqual([expect.objectContaining({ kind: "invertControls", visible: false })]);
  });

  it("Loud shows a badge on the ball and the Golf Gods banner", () => {
    const t = game();
    invert(t, "ben", "loud");
    const events = TestGame.nonAdmin(t.drain());
    expect(events.filter((e) => e.type === "banner")).toHaveLength(1);
    expect(t.state.players.ben!.effects.map((e) => e.kind)).toEqual(["invertControls"]);
  });

  it("is refused for an unknown target, a Holed-Out ball and a non-Admin", () => {
    const t = game();
    expect(invert(t, "nobody")).toEqual({ ok: false, reason: "unknown_target" });
    expect(t.adminPower("ben", "invertControls", { targetId: "maya" })).toEqual({ ok: false, reason: "not_admin" });
    expect(t.adminPower("maya", "invertControls", { targetId: "ben", durationSec: 0 })).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("is cleared when the Hole ends", () => {
    const t = game(course(2));
    invert(t, "ben", "loud", 120);
    t.advanceUntilPhase("holeEnd");
    expect(t.state.players.ben!.effects).toEqual([]);
    t.advanceUntilPhase("playing");
    t.shoot("ben", 0, 0.5);
    expect(t.ball("ben").vx).toBeGreaterThan(0);
  });
});
