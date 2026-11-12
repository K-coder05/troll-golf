import { GOLF_GODS_BANNER, PAINT_MAX_POINTS_PER_MESSAGE, type CourseData, type HoleData, type PaintSurface, type Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { RoomStateSchema } from "../../src/room/schema";
import { syncState } from "../../src/room/syncState";
import { MAX_SHOT_SPEED, MAX_STROKE_POINTS, MAX_TERRAIN_EDITS } from "../../src/simulation/game";
import { TestGame } from "../harness";

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A long open Hole with the Tee at (100, 300); `holes` copies of it. */
function course(extra: Partial<HoleData> = {}, holes = 1): CourseData {
  const base: HoleData = {
    id: "t",
    name: "T",
    par: 3,
    width: 4000,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: 3900, y: 300, radius: 12 },
    walls: [],
    surfaces: [],
    boostPads: [],
    teleporters: [],
    itemBoxes: [],
    windmills: [],
    slidingWalls: [],
  };
  return { id: "t", name: "T", holes: Array.from({ length: holes }, (_, i) => ({ ...base, id: `t${i}`, ...extra })) };
}

/** Maya (the Admin) alone, or with Ben, playing Hole 1. */
function game(options: { ben?: boolean; course?: CourseData } = {}): TestGame {
  const t = new TestGame({ course: options.course ?? course() });
  t.joinAsAdmin("maya", "Maya");
  if (options.ben) t.join("ben", "Ben");
  t.startPlaying();
  t.drain();
  return t;
}

/** A straight stroke from a to b. */
const stroke = (surface: PaintSurface, a: [number, number], b: [number, number], radius = 40) => ({
  action: "stroke" as const,
  surface,
  radius,
  points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }],
});

const paint = (t: TestGame, params: Parameters<typeof t.adminPower<"terrainPaint">>[2], mode: "stealth" | "loud" = "stealth") =>
  t.adminPower("maya", "terrainPaint", params, mode);

function shotDistance(t: TestGame, id: string, power: number): number {
  const from = t.ball(id).x;
  t.shoot(id, 0, power);
  t.advanceUntilRest(id);
  return t.ball(id).x - from;
}

describe("Terrain Paint: hazards", () => {
  for (const surface of ["water", "void"] as const) {
    it(`a ${surface} stroke across a ball's path makes the ball take the ${surface} penalty`, () => {
      const t = game({ ben: true });
      const rest = { ...t.ball("ben").restSpot };
      expect(paint(t, stroke(surface, [600, 0], [600, 600]))).toEqual({ ok: true });
      t.shoot("ben", 0, 0.6);
      t.advanceUntilRest("ben");
      expect(t.ball("ben")).toMatchObject({ x: rest.x, y: rest.y, atRest: true });
      expect(t.state.players.ben!.strokes[0]).toBe(2); // the shot + the penalty
      const fx = t.drain().filter((e) => e.type === "fx").map((e) => e.payload.kind);
      expect(fx).toContain(surface === "void" ? "void" : "splash");
    });
  }

  it("without the stroke the same shot rolls on past it", () => {
    const t = game({ ben: true });
    t.shoot("ben", 0, 0.6);
    t.advanceUntilRest("ben");
    expect(t.ball("ben").x).toBeGreaterThan(650);
    expect(t.state.players.ben!.strokes[0]).toBe(1);
  });

  it("a ball at rest that gets Water painted under it sinks once and comes out on the nearest dry ground", () => {
    const t = game({ ben: true });
    t.shoot("ben", 0, 0.3);
    t.advanceUntilRest("ben");
    const resting = { ...t.ball("ben") };
    t.drain();
    paint(t, { action: "stroke", surface: "water", radius: 50, points: [{ x: resting.x, y: resting.y }] });
    t.advance(100);
    const ball = t.ball("ben");
    expect(t.state.players.ben!.strokes[0]).toBe(2);
    expect(ball.atRest).toBe(true);
    // Out of the painted disc, close to it, and that is the new Rest Spot.
    const away = Math.hypot(ball.x - resting.x, ball.y - resting.y);
    expect(away).toBeGreaterThan(50);
    expect(away).toBeLessThan(90);
    expect(ball.restSpot).toEqual({ x: ball.x, y: ball.y });
    expect(t.drain().filter((e) => e.type === "fx").map((e) => e.payload.kind)).toEqual(["splash"]);
    // It doesn't keep sinking.
    t.advance(2000);
    expect(t.state.players.ben!.strokes[0]).toBe(2);
    // And it can be played from there.
    expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
  });

  it("a ball whose Rest Spot was painted over returns to the nearest dry spot, not into the Water", () => {
    const t = game({ ben: true });
    // Water over Ben's Tee spot and in front of it; he is already resting there, so he sinks at once.
    paint(t, stroke("water", [100, 280], [700, 280], 30));
    t.advance(100);
    const ball = t.ball("ben");
    expect(t.state.players.ben!.strokes[0]).toBe(1);
    expect(Math.abs(ball.y - 280)).toBeGreaterThan(30);
    t.advance(1000);
    expect(t.state.players.ben!.strokes[0]).toBe(1);
  });
});

describe("Terrain Paint: surfaces", () => {
  it("painted Ice and Sand damp a ball exactly like the course's own Ice and Sand", () => {
    for (const surface of ["ice", "sand"] as const) {
      const painted = game();
      paint(painted, stroke(surface, [0, 300], [4000, 300], 80));
      const zoned = game({ course: course({ surfaces: [{ kind: surface, polygon: rect(0, 220, 4000, 160) }] }) });
      const plain = game();
      const d = shotDistance(painted, "maya", 0.4);
      expect(d).toBeCloseTo(shotDistance(zoned, "maya", 0.4), 3);
      if (surface === "ice") expect(d).toBeGreaterThan(shotDistance(plain, "maya", 0.4) * 1.5);
      else expect(d).toBeLessThan(shotDistance(plain, "maya", 0.4) * 0.5);
    }
  });

  it("painted Sand cuts shot power", () => {
    const t = game();
    paint(t, { action: "stroke", surface: "sand", radius: 30, points: [{ x: 100, y: 300 }] });
    t.shoot("maya", 0, 1);
    expect(t.ball("maya").vx).toBeCloseTo(MAX_SHOT_SPEED * 0.7, 3);
  });

  it("painted terrain overrides the course's own surface where they overlap", () => {
    // A course lake right across the Hole; an Ice bridge painted over it.
    const t = game({ course: course({ surfaces: [{ kind: "water", polygon: rect(400, 0, 400, 600) }] }) });
    paint(t, stroke("ice", [350, 300], [850, 300], 40));
    t.shoot("maya", 0, 0.5);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.strokes[0]).toBe(1);
    expect(t.ball("maya").x).toBeGreaterThan(800);
  });

  it("later strokes win over earlier ones", () => {
    const t = game();
    paint(t, stroke("water", [500, 300], [700, 300]));
    paint(t, stroke("ice", [450, 300], [750, 300]));
    t.shoot("maya", 0, 0.5);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.strokes[0]).toBe(1);
    const at = t.ball("maya").x;
    // Water painted on top of the Ice, in front of the ball, now sinks it.
    paint(t, stroke("water", [at + 100, 0], [at + 100, 600], 30));
    t.shoot("maya", 0, 0.5);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.strokes[0]).toBe(3);
    expect(t.ball("maya").x).toBeCloseTo(at, 3);
  });
});

describe("Terrain Paint: synced state", () => {
  it("edits are in synced state, in order, with no word of who painted them", () => {
    const t = game();
    paint(t, stroke("water", [600, 0], [600, 600]));
    paint(t, { action: "stroke", surface: "sand", radius: 20, points: [{ x: 300, y: 100 }] }, "loud");
    expect(t.state.terrainEdits).toEqual([
      { kind: "paint", id: 1, surface: "water", radius: 40, points: [{ x: 600, y: 0 }, { x: 600, y: 600 }], expiresAt: 0 },
      { kind: "paint", id: 2, surface: "sand", radius: 20, points: [{ x: 300, y: 100 }], expiresAt: 0 },
    ]);
    expect(JSON.stringify(t.state.terrainEdits)).not.toMatch(/maya|admin/i);
  });

  it("dragging the brush grows the current stroke; points outside the Hole are clamped to its edge", () => {
    const t = game();
    paint(t, { action: "stroke", surface: "ice", radius: 20, points: [{ x: 100, y: 100 }] });
    expect(paint(t, { action: "extend", points: [{ x: 101, y: 100 }, { x: 150, y: 100 }, { x: 150, y: -50 }] })).toEqual({ ok: true });
    // (101, 100) is too close to (100, 100) to add anything and is dropped.
    expect(t.state.terrainEdits[0]!.points).toEqual([{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 0 }]);
  });

  it("a client syncing incrementally while the Admin paints ends up with the same terrain as one joining afresh", () => {
    const t = game();
    const live = new RoomStateSchema();
    syncState(live, t.state);
    paint(t, { action: "stroke", surface: "water", radius: 30, points: [{ x: 500, y: 100 }] });
    syncState(live, t.state);
    for (let i = 1; i <= 80; i++) {
      paint(t, { action: "extend", points: [{ x: 500 + i * 20, y: 100 + (i % 2) * 10 }] });
      syncState(live, t.state);
    }
    paint(t, stroke("void", [100, 500], [900, 500]), "loud");
    syncState(live, t.state);
    // The long stroke carried on as a second one.
    expect(t.state.terrainEdits.map((e) => (e.kind === "paint" ? e.surface : e.kind))).toEqual(["water", "water", "void"]);

    const fresh = new RoomStateSchema();
    syncState(fresh, t.state);
    expect(live.toJSON()).toEqual(fresh.toJSON());
    expect((fresh.toJSON() as { terrainEdits: unknown }).terrainEdits).toEqual(t.state.terrainEdits);

    // A clear empties both.
    paint(t, { action: "clear" });
    syncState(live, t.state);
    expect((live.toJSON() as { terrainEdits: unknown[] }).terrainEdits).toEqual([]);
  });
});

describe("Terrain Paint: lifetime and limits", () => {
  it("edits reset when a new Hole starts", () => {
    const t = game({ ben: true, course: course({}, 2) });
    paint(t, stroke("water", [600, 0], [600, 600]));
    expect(t.state.terrainEdits).toHaveLength(1);
    t.advanceUntilPhase("holeEnd");
    t.advanceUntilPhase("countdown");
    expect(t.state.holeIndex).toBe(1);
    expect(t.state.terrainEdits).toEqual([]);
    t.advanceUntilPhase("playing");
    t.shoot("ben", 0, 0.6);
    t.advanceUntilRest("ben");
    expect(t.state.players.ben!.strokes[1]).toBe(1);
    expect(t.ball("ben").x).toBeGreaterThan(650);
    // And there is no stroke left to carry on.
    expect(paint(t, { action: "extend", points: [{ x: 10, y: 10 }] })).toEqual({ ok: false, reason: "no_stroke" });
  });

  it("a timed stroke fades after its duration", () => {
    const t = game({ ben: true });
    paint(t, { ...stroke("water", [600, 0], [600, 600]), durationSec: 2 });
    t.advance(1900);
    expect(t.state.terrainEdits).toHaveLength(1);
    t.advance(200);
    expect(t.state.terrainEdits).toEqual([]);
    t.shoot("ben", 0, 0.6);
    t.advanceUntilRest("ben");
    expect(t.state.players.ben!.strokes[0]).toBe(1);
  });

  it("clear removes every painted stroke", () => {
    const t = game({ ben: true });
    paint(t, stroke("water", [600, 0], [600, 600]));
    paint(t, stroke("void", [800, 0], [800, 600]));
    expect(paint(t, { action: "clear" })).toEqual({ ok: true });
    expect(t.state.terrainEdits).toEqual([]);
    expect(paint(t, { action: "extend", points: [{ x: 10, y: 10 }] })).toEqual({ ok: false, reason: "no_stroke" });
    t.shoot("ben", 0, 0.6);
    t.advanceUntilRest("ben");
    expect(t.state.players.ben!.strokes[0]).toBe(1);
  });

  it("caps the edits a Hole can hold, so synced state stays small", () => {
    const t = game();
    for (let i = 0; i < MAX_TERRAIN_EDITS; i++) {
      expect(paint(t, { action: "stroke", surface: "sand", radius: 10, points: [{ x: 200 + i * 30, y: 50 }] })).toEqual({ ok: true });
    }
    expect(paint(t, { action: "stroke", surface: "sand", radius: 10, points: [{ x: 10, y: 10 }] })).toEqual({ ok: false, reason: "terrain_full" });
    expect(t.state.terrainEdits).toHaveLength(MAX_TERRAIN_EDITS);
    // The last stroke can still grow up to its own cap, but not carry on as a new one.
    const points = Array.from({ length: MAX_STROKE_POINTS }, (_, i) => ({ x: 100 + i * 20, y: 400 }));
    for (let i = 0; i < points.length; i += PAINT_MAX_POINTS_PER_MESSAGE) {
      paint(t, { action: "extend", points: points.slice(i, i + PAINT_MAX_POINTS_PER_MESSAGE) });
    }
    expect(t.state.terrainEdits.at(-1)!.points).toHaveLength(MAX_STROKE_POINTS);
    expect(paint(t, { action: "extend", points: [{ x: 3000, y: 500 }] })).toEqual({ ok: false, reason: "terrain_full" });
  });

  it("rejects bad brushes and painting outside play, to the Admin only", () => {
    const t = game();
    const bad = [
      { action: "stroke", surface: "fairway", radius: 20, points: [{ x: 1, y: 1 }] },
      { action: "stroke", surface: "water", radius: 2, points: [{ x: 1, y: 1 }] },
      { action: "stroke", surface: "water", radius: 500, points: [{ x: 1, y: 1 }] },
      { action: "stroke", surface: "water", radius: 20, points: [] },
      { action: "stroke", surface: "water", radius: 20, points: [{ x: Number.NaN, y: 1 }] },
      { action: "stroke", surface: "water", radius: 20, points: [{ x: 1, y: 1 }], durationSec: -1 },
      { action: "extend", points: Array.from({ length: PAINT_MAX_POINTS_PER_MESSAGE + 1 }, () => ({ x: 1, y: 1 })) },
      { action: "erase" },
    ];
    for (const params of bad) {
      expect(t.send("maya", { type: "admin", power: "terrainPaint", mode: "stealth", params })).toEqual({ ok: false, reason: "invalid_payload" });
    }
    expect(TestGame.nonAdmin(t.drain())).toEqual([]);
    expect(t.state.terrainEdits).toEqual([]);

    // Ben isn't the Admin: nothing happens and nothing is said.
    t.join("ben");
    t.drain();
    expect(t.adminPower("ben", "terrainPaint", stroke("water", [600, 0], [600, 600]))).toEqual({ ok: false, reason: "not_admin" });
    expect(t.drain()).toEqual([]);

    t.advanceUntilPhase("holeEnd");
    expect(paint(t, stroke("water", [600, 0], [600, 600]))).toEqual({ ok: false, reason: "wrong_phase" });
  });
});

describe("Terrain Paint: Stealth and Loud", () => {
  it("Stealth paint sends nothing to anyone but the Admin; Loud paint shows the Golf Gods banner", () => {
    const t = game({ ben: true });
    paint(t, stroke("water", [600, 0], [600, 600]), "stealth");
    t.advance(200);
    let events = t.drain();
    expect(TestGame.nonAdmin(events)).toEqual([]);
    expect(events.filter((e) => e.type === "adminResult")).toHaveLength(1);

    paint(t, stroke("ice", [900, 0], [900, 600]), "loud");
    t.advance(200);
    events = TestGame.nonAdmin(t.drain());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "banner", audience: { kind: "everyone" }, payload: { text: GOLF_GODS_BANNER } });
    expect(JSON.stringify(events)).not.toMatch(/Maya|maya/);

    // Dragging the brush on is part of the same use: no banner, no log entry, no confirmation.
    const logged = t.game.getAdminLog().length;
    expect(paint(t, { action: "extend", points: [{ x: 900, y: 50 }, { x: 950, y: 100 }] }, "loud")).toEqual({ ok: true });
    expect(t.drain()).toEqual([]);
    expect(t.game.getAdminLog()).toHaveLength(logged);
    expect(t.game.getAdminLog().at(-1)).toMatchObject({ power: "terrainPaint", mode: "loud" });
  });
});
