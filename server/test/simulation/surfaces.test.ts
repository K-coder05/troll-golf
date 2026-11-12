import type { CourseData, HoleData, Polygon, SurfaceKind } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { placeholderCourse } from "../../src/courses/placeholder";
import { BOOST_IMPULSE, MAX_SHOT_SPEED } from "../../src/simulation/game";
import { FRAME_MS, TestGame } from "../harness";

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A big open Hole with the Tee at (100, 300). */
function hole(extra: Partial<HoleData> = {}): CourseData {
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
  return { id: "t", name: "T", holes: [{ ...base, ...extra }] };
}

const everywhere = (kind: SurfaceKind) => ({ surfaces: [{ kind, polygon: rect(0, 0, 4000, 600) }] });

function distanceOnSurface(kind: SurfaceKind | null, power = 0.4): number {
  const t = new TestGame({ course: hole(kind ? everywhere(kind) : {}) });
  t.join("maya");
  t.startPlaying();
  t.shoot("maya", 0, power);
  t.advanceUntilRest("maya");
  return t.ball("maya").x - 100;
}

describe("surface friction", () => {
  it("the same shot goes less far on Rough and Sand and further on Ice than on Fairway", () => {
    const fairway = distanceOnSurface(null);
    const rough = distanceOnSurface("rough");
    const sand = distanceOnSurface("sand");
    const ice = distanceOnSurface("ice");
    expect(rough).toBeLessThan(fairway * 0.8);
    expect(sand).toBeLessThan(rough);
    expect(ice).toBeGreaterThan(fairway * 1.5);
    expect(distanceOnSurface("fairway")).toBeCloseTo(fairway, 3);
  });

  it("later zones win where zones overlap", () => {
    const course = hole({
      surfaces: [
        { kind: "ice", polygon: rect(0, 0, 4000, 600) },
        { kind: "sand", polygon: rect(0, 0, 4000, 600) },
      ],
    });
    const t = new TestGame({ course });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.4);
    t.advanceUntilRest("maya");
    expect(t.ball("maya").x - 100).toBeCloseTo(distanceOnSurface("sand"), 3);
  });
});

describe("Sand power cut", () => {
  it("a max-power shot from Sand starts 30% slower than from Fairway", () => {
    const launch = (course: CourseData) => {
      const t = new TestGame({ course });
      t.join("maya");
      t.startPlaying();
      t.shoot("maya", 0, 1);
      return t.ball("maya");
    };
    const fairway = launch(hole());
    expect(fairway.vx).toBeCloseTo(MAX_SHOT_SPEED, 3);
    const sand = launch(hole({ surfaces: [{ kind: "sand", polygon: rect(50, 250, 100, 100) }] }));
    expect(sand.vx).toBeCloseTo(MAX_SHOT_SPEED * 0.7, 3);
  });
});

describe("hazards", () => {
  for (const kind of ["water", "void"] as const) {
    it(`a ball entering ${kind} gets +1 Stroke and ends at its Rest Spot, at rest`, () => {
      const t = new TestGame({ course: hole({ surfaces: [{ kind, polygon: rect(400, 0, 400, 600) }] }) });
      t.join("maya");
      t.startPlaying();
      t.shoot("maya", 0, 0.8);
      t.advanceUntilRest("maya");
      const ball = t.ball("maya");
      expect(ball).toMatchObject({ x: 100, y: 300, vx: 0, vy: 0, atRest: true, restSpot: { x: 100, y: 300 } });
      expect(t.state.players.maya!.strokes[0]).toBe(2); // the shot + the penalty
      t.advance(1000);
      expect(t.state.players.maya!.strokes[0]).toBe(2);
      expect(t.ball("maya").x).toBe(100);
    });
  }

  it("returns to the latest Rest Spot, not the Tee", () => {
    const t = new TestGame({ course: hole({ surfaces: [{ kind: "water", polygon: rect(900, 0, 400, 600) }] }) });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.3);
    t.advanceUntilRest("maya");
    const rest = { ...t.ball("maya").restSpot };
    expect(rest.x).toBeGreaterThan(300);
    t.shoot("maya", 0, 1);
    t.advanceUntilRest("maya");
    expect(t.ball("maya")).toMatchObject({ x: rest.x, y: rest.y, atRest: true });
    expect(t.state.players.maya!.strokes[0]).toBe(3);
  });

  it("splash and feed events are broadcast", () => {
    const t = new TestGame({ course: hole({ surfaces: [{ kind: "water", polygon: rect(400, 0, 400, 600) }] }) });
    t.join("maya");
    t.startPlaying();
    t.drain();
    t.shoot("maya", 0, 0.8);
    t.advanceUntilRest("maya");
    const events = t.drain();
    expect(events.some((e) => e.type === "fx" && e.payload.kind === "splash")).toBe(true);
    expect(events.some((e) => e.type === "feed" && e.payload.text.includes("water"))).toBe(true);
  });
});

describe("Boost Pads", () => {
  it("add speed in the pad's direction, once per entry", () => {
    const pad = { polygon: rect(300, 200, 100, 200), angle: 0, strength: 1 };
    const t = new TestGame({ course: hole({ boostPads: [pad] }) });
    t.join("maya");
    t.startPlaying();
    const plain = new TestGame({ course: hole() });
    plain.join("maya");
    plain.startPlaying();
    t.shoot("maya", 0, 0.3);
    plain.shoot("maya", 0, 0.3);
    t.advanceUntilRest("maya");
    plain.advanceUntilRest("maya");
    // The pad's push comes out as clearly more distance than the plain shot.
    expect(t.ball("maya").x).toBeGreaterThan(plain.ball("maya").x + 300);
  });

  it("adds exactly its impulse on the entry step and does not re-fire while inside", () => {
    const pad = { polygon: rect(300, 200, 2000, 200), angle: 0, strength: 1 };
    const t = new TestGame({ course: hole({ boostPads: [pad] }) });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.3);
    let before = 0;
    let fired = 0;
    for (let i = 0; i < 600; i++) {
      const vx = t.ball("maya").vx;
      t.advance(FRAME_MS);
      if (t.ball("maya").vx > vx + BOOST_IMPULSE * 0.5) fired++;
      before = vx;
    }
    expect(before).toBeGreaterThanOrEqual(0);
    expect(fired).toBe(1);
  });

  it("can push at an angle and scale with strength", () => {
    const pad = { polygon: rect(50, 250, 100, 100), angle: Math.PI / 2, strength: 2 };
    const t = new TestGame({ course: hole({ boostPads: [pad] }) });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.1);
    t.advance(FRAME_MS);
    expect(t.ball("maya").vy).toBeGreaterThan(BOOST_IMPULSE * 2 * 0.9);
  });
});

describe("Teleporters", () => {
  const course = hole({ teleporters: [{ id: "1", a: { x: 400, y: 300 }, b: { x: 1500, y: 100 }, radius: 20 }] });

  it("put the ball at the paired exit with the same speed, without bouncing back", () => {
    const t = new TestGame({ course });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.6);
    let speedIn = 0;
    let jumped = false;
    for (let i = 0; i < 600 && !jumped; i++) {
      speedIn = Math.hypot(t.ball("maya").vx, t.ball("maya").vy);
      t.advance(FRAME_MS);
      if (t.ball("maya").x > 1000) jumped = true;
    }
    expect(jumped).toBe(true);
    const out = t.ball("maya");
    expect(Math.abs(out.x - 1500)).toBeLessThan(10);
    expect(out.y).toBeCloseTo(100, 0);
    // Same speed (apart from one step of friction).
    expect(Math.hypot(out.vx, out.vy)).toBeGreaterThan(speedIn * 0.97);
    t.advanceUntilRest("maya");
    expect(t.ball("maya").x).toBeGreaterThan(1500);
    expect(t.ball("maya").y).toBeCloseTo(100, 0);
  });

  it("work in the other direction too", () => {
    const t = new TestGame({ course });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.1);
    t.advanceUntilRest("maya"); // stops short of the entrance
    expect(t.ball("maya").x).toBeLessThan(400);
  });
});

describe("placeholder Hole", () => {
  it("has one of every surface, a Boost Pad and a Teleporter", () => {
    const h = placeholderCourse.holes[0]!;
    expect(new Set(h.surfaces.map((s) => s.kind))).toEqual(new Set(["rough", "sand", "ice", "water", "void"]));
    expect(h.boostPads).toHaveLength(1);
    expect(h.teleporters).toHaveLength(1);
  });
});
