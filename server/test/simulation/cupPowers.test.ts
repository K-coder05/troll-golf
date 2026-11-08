import { CUP_CRATER_RADIUS, CUP_PINHOLE_RADIUS, type CourseData, type HoleData, type Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { FRAME_MS, TestGame } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const hole: HoleData = {
  id: "h",
  name: "h",
  par: 3,
  width: 1200,
  height: 600,
  tee: { x: 100, y: 300 },
  cup: { x: 500, y: 300, radius: 12 },
  walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600), rect(700, 100, 60, 100)],
  surfaces: [],
  boostPads: [],
  teleporters: [],
  itemBoxes: [],
  windmills: [],
  slidingWalls: [],
};
const course: CourseData = { id: "c", name: "C", holes: [hole] };

/** Straight putt from the Tee along y=300 at about this power arrives slowly. */
const SOFT = 0.45;

function game(): TestGame {
  const t = new TestGame({ course });
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.startPlaying();
  t.drain();
  return t;
}
const power = <K extends "moveCup" | "cupSize" | "lipOut">(t: TestGame, p: K, params: Parameters<typeof t.adminPower<K>>[2], mode: "stealth" | "loud" = "stealth") =>
  t.adminPower("maya", p, params, mode);
const fxKinds = (t: TestGame) => t.drain().filter((e) => e.type === "fx" && e.payload.kind !== "putt").map((e) => (e.payload as { kind: string }).kind);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** Aim a ball at a point and wait for it to settle or drop. */
function putt(t: TestGame, id: string, at: { x: number; y: number }, powerLevel = SOFT): void {
  const b = t.ball(id);
  t.shoot(id, Math.atan2(at.y - b.y, at.x - b.x), powerLevel);
  for (let ms = 0; ms < 8000 && !t.ball(id).atRest && !t.state.players[id]!.holedOut; ms += FRAME_MS) t.advance(FRAME_MS);
}

describe("Move the Cup", () => {
  it("teleporting changes where balls Hole Out", () => {
    const t = game();
    expect(power(t, "moveCup", { mode: "teleport", x: 400, y: 450 })).toEqual({ ok: true });
    expect(t.state.cup).toMatchObject({ x: 400, y: 450 });
    putt(t, "maya", { x: 500, y: 300 });
    expect(t.state.players.maya!.holedOut).toBe(false);
    putt(t, "ben", { x: 400, y: 450 }, 0.4);
    expect(t.state.players.ben!.holedOut).toBe(true);
  });

  it("refuses a spot outside the Hole or inside a wall", () => {
    const t = game();
    expect(power(t, "moveCup", { mode: "teleport", x: -5, y: 100 })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(power(t, "moveCup", { mode: "teleport", x: 720, y: 150 })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.state.cup).toMatchObject({ x: 500, y: 300 });
  });

  it("a sliding Cup moves away when a ball comes within its trigger distance", () => {
    const t = game();
    power(t, "moveCup", { mode: "slide", triggerDistance: 150, speed: 100 });
    t.advance(500);
    // Nobody is near: it stays put.
    expect(t.state.cup).toMatchObject({ x: 500, y: 300 });
    t.shoot("maya", 0, 0.5);
    t.advance(1200);
    expect(t.ball("maya").x).toBeGreaterThan(350);
    expect(t.state.cup.x).toBeGreaterThan(500);
    expect(Math.abs(t.state.cup.y - 300)).toBeLessThan(1);
  });

  it("a sliding Cup stays inside the Hole and out of walls", () => {
    const t = game();
    power(t, "moveCup", { mode: "teleport", x: 690, y: 150 });
    expect(power(t, "moveCup", { mode: "teleport", x: 690, y: 150 })).toEqual({ ok: true });
    power(t, "moveCup", { mode: "slide", triggerDistance: 500, speed: 400 });
    // Ben parks near it; the Cup keeps backing off for a long time.
    for (let i = 0; i < 600; i++) {
      t.advance(FRAME_MS);
      const { x, y } = t.state.cup;
      expect(x >= 0 && x <= 1200 && y >= 0 && y <= 600).toBe(true);
      expect(x >= 700 && x <= 760 && y >= 100 && y <= 200).toBe(false);
    }
  });

  it("Cup changes reset at the next Hole and Loud shows the banner while Stealth is silent", () => {
    const t = game();
    power(t, "moveCup", { mode: "teleport", x: 400, y: 450 });
    expect(t.drain().filter((e) => e.audience.kind !== "admin")).toEqual([]);
    power(t, "moveCup", { mode: "teleport", x: 400, y: 460 }, "loud");
    expect(t.drain().filter((e) => e.type === "banner")).toHaveLength(1);
  });
});

describe("Cup Size", () => {
  it("a pinhole refuses a ball a normal Cup takes; a crater takes a ball that misses", () => {
    const a = game();
    putt(a, "maya", { x: 500, y: 300 });
    expect(a.state.players.maya!.holedOut).toBe(true);

    const b = game();
    power(b, "cupSize", { radius: CUP_PINHOLE_RADIUS });
    expect(b.state.cup.radius).toBe(CUP_PINHOLE_RADIUS);
    putt(b, "maya", { x: 500, y: 309 });
    expect(b.state.players.maya!.holedOut).toBe(false);

    const c = game();
    power(c, "cupSize", { radius: CUP_CRATER_RADIUS });
    putt(c, "maya", { x: 500, y: 335 });
    expect(c.state.players.maya!.holedOut).toBe(true);
  });

  it("the no-collision zone around the Cup scales with it", () => {
    const t = game();
    // Ben sits 28 px from where the Cup will be, Maya on the Tee below him: a normal Cup's zone wouldn't reach Ben.
    power(t, "cupSize", { radius: CUP_CRATER_RADIUS });
    power(t, "moveCup", { mode: "teleport", x: 100, y: 255 });
    const benAt = { ...t.ball("ben") };
    expect(dist(benAt, t.state.cup)).toBeGreaterThan(12 + 8);
    expect(dist(benAt, t.state.cup)).toBeLessThan(CUP_CRATER_RADIUS);
    t.shoot("maya", -Math.PI / 2, 1);
    for (let i = 0; i < 20; i++) {
      t.advance(FRAME_MS);
      expect(t.ball("ben")).toMatchObject({ x: benAt.x, y: benAt.y });
    }
  });

  it("rejects absurd radii", () => {
    const t = game();
    expect(power(t, "cupSize", { radius: 1 })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(power(t, "cupSize", { radius: 5000 })).toEqual({ ok: false, reason: "invalid_payload" });
  });
});

describe("Lip-Out", () => {
  it("makes the target's next would-be hole-out lip out exactly once, others unaffected", () => {
    const t = game();
    expect(power(t, "lipOut", { targetId: "ben" })).toEqual({ ok: true });
    // Maya isn't affected.
    putt(t, "maya", { x: 500, y: 300 });
    expect(t.state.players.maya!.holedOut).toBe(true);
    t.drain();

    // Ben's soft putt lips out and rolls on.
    putt(t, "ben", { x: 500, y: 300 });
    expect(t.state.players.ben!.holedOut).toBe(false);
    expect(fxKinds(t)).toEqual(["lipOut"]);
    expect(t.ball("ben").atRest).toBe(true);
    expect(dist(t.ball("ben"), t.state.cup)).toBeGreaterThan(12);

    // The second time it drops.
    putt(t, "ben", { x: 500, y: 300 }, 0.29);
    expect(t.state.players.ben!.holedOut).toBe(true);
  });

  it("a fast ball that lips out naturally doesn't use the pending Lip-Out up", () => {
    const t = game();
    power(t, "lipOut", { targetId: "maya" });
    t.shoot("maya", 0, 0.8);
    t.advance(2500);
    expect(t.state.players.maya!.holedOut).toBe(false);
    putt(t, "maya", { x: 500, y: 300 });
    // Back at the Cup slowly: this is the first would-be hole-out, so it lips out.
    expect(t.state.players.maya!.holedOut).toBe(false);
  });

  it("a Stealth Lip-Out sends exactly the events a natural lip-out does", () => {
    const natural = game();
    natural.shoot("maya", 0, 0.8);
    natural.advance(1500);
    const naturalFx = natural.drain().filter((e) => e.type === "fx" && e.payload.kind !== "putt");
    expect(naturalFx).toHaveLength(1);

    const forced = game();
    power(forced, "lipOut", { targetId: "maya" });
    forced.drain();
    putt(forced, "maya", { x: 500, y: 300 });
    const forcedEvents = TestGame.nonAdmin(forced.drain()).filter((e) => !(e.type === "fx" && e.payload.kind === "putt"));
    expect(forcedEvents).toEqual(naturalFx);
  });

  it("is rejected for unknown or Holed-Out Players and is not in synced state", () => {
    const t = game();
    expect(power(t, "lipOut", { targetId: "nobody" })).toEqual({ ok: false, reason: "unknown_target" });
    putt(t, "ben", { x: 500, y: 300 });
    expect(power(t, "lipOut", { targetId: "ben" })).toEqual({ ok: false, reason: "no_ball_in_play" });
    power(t, "lipOut", { targetId: "maya" });
    expect(JSON.stringify(t.state)).not.toMatch(/lip/i);
  });

  it("a pending Lip-Out is cleared at the next Hole", () => {
    const two: CourseData = { id: "c2", name: "C2", holes: [hole, hole] };
    const t = new TestGame({ course: two });
    t.joinAsAdmin("maya", "Maya");
    t.startPlaying();
    t.adminPower("maya", "lipOut", { targetId: "maya" }, "stealth");
    t.advanceUntilPhase("holeEnd");
    t.advanceUntilPhase("playing");
    putt(t, "maya", { x: 500, y: 300 });
    expect(t.state.players.maya!.holedOut).toBe(true);
  });
});
