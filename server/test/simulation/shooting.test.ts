import { BALL_RADIUS, REST_SPEED, type CourseData, type HoleData, type Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { FRAME_MS, TestGame } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A hand-written Hole in the course data shape: a long walled box, plus optional inner walls. */
function walledHole(width: number, height: number, extraWalls: Polygon[] = []): CourseData {
  const hole: HoleData = {
    id: "test",
    name: "Test",
    par: 3,
    width,
    height,
    tee: { x: 100, y: height / 2 },
    cup: { x: width - 100, y: height / 2, radius: 12 },
    walls: [rect(0, 0, width, T), rect(0, height - T, width, T), rect(0, 0, T, height), rect(width - T, 0, T, height), ...extraWalls],
    surfaces: [],
    boostPads: [],
    teleporters: [],
    itemBoxes: [],
    windmills: [],
    slidingWalls: [],
  };
  return { id: "test", name: "Test", holes: [hole] };
}

/** Long enough that no test shot reaches the far wall. */
const longHole = walledHole(3000, 600);

function newGame(course = longHole): TestGame {
  const t = new TestGame({ course });
  t.join("maya", "Maya");
  return t;
}

describe("shooting a ball", () => {
  it("Maya's ball starts at rest on the Tee with no Strokes", () => {
    const t = newGame();
    expect(t.ball("maya")).toEqual({ x: 100, y: 300, vx: 0, vy: 0, atRest: true, restSpot: { x: 100, y: 300 } });
    expect(t.state.players.maya!.strokes).toEqual([0]);
  });

  it("a shot moves the ball in the shot direction and it comes to rest", () => {
    const t = newGame();
    expect(t.shoot("maya", 0, 0.5)).toEqual({ ok: true });
    t.advance(100);
    const moving = t.ball("maya");
    expect(moving.atRest).toBe(false);
    expect(moving.x).toBeGreaterThan(130);
    expect(moving.y).toBeCloseTo(300, 3);
    expect(moving.vx).toBeGreaterThan(0);

    t.advanceUntilRest("maya");
    const rested = t.ball("maya");
    expect(rested.atRest).toBe(true);
    expect([rested.vx, rested.vy]).toEqual([0, 0]);
    expect(rested.x).toBeGreaterThan(300);
    expect(rested.y).toBeCloseTo(300, 3);
  });

  it("the angle is the direction of travel, with y pointing down", () => {
    const t = new TestGame({ course: walledHole(1200, 1200) });
    t.join("maya");
    t.shoot("maya", Math.PI / 2, 0.3); // straight down the screen
    t.advanceUntilRest("maya");
    expect(t.ball("maya").x).toBeCloseTo(100, 3);
    expect(t.ball("maya").y).toBeGreaterThan(700);

    t.shoot("maya", (-3 * Math.PI) / 4, 0.2); // up and to the left
    const before = { ...t.ball("maya") };
    t.advance(200);
    expect(t.ball("maya").x).toBeLessThan(before.x);
    expect(t.ball("maya").y).toBeLessThan(before.y);
  });

  it("more power goes further, and power is capped at 1", () => {
    const distance = (power: number) => {
      const t = newGame();
      t.shoot("maya", 0, power);
      t.advanceUntilRest("maya");
      return t.ball("maya").x - 100;
    };
    const quarter = distance(0.25);
    const half = distance(0.5);
    const full = distance(1);
    expect(quarter).toBeGreaterThan(50);
    expect(half).toBeGreaterThan(quarter * 1.5);
    expect(full).toBeGreaterThan(half * 1.5);
    expect(distance(5)).toBeCloseTo(full, 6);
  });

  it("a shot sent while the ball is moving is rejected, and one at rest is accepted", () => {
    const t = newGame();
    t.shoot("maya", 0, 0.6);
    t.advance(250);
    const before = { ...t.ball("maya") };

    expect(t.shoot("maya", Math.PI, 1)).toEqual({ ok: false, reason: "ball_moving" });
    expect(t.state.players.maya!.strokes).toEqual([1]);
    t.advance(FRAME_MS);
    expect(t.ball("maya").x).toBeGreaterThan(before.x); // still rolling the original way

    t.advanceUntilRest("maya");
    expect(t.shoot("maya", Math.PI, 0.2)).toEqual({ ok: true });
  });

  it("each shot adds 1 Stroke", () => {
    const t = newGame();
    for (let shot = 1; shot <= 3; shot++) {
      t.shoot("maya", shot % 2 ? 0 : Math.PI, 0.3);
      expect(t.state.players.maya!.strokes).toEqual([shot]);
      t.advanceUntilRest("maya");
    }
    // Rejected shots cost nothing.
    t.shoot("maya", 0, 0.5);
    t.shoot("maya", 0, 0.5);
    expect(t.state.players.maya!.strokes).toEqual([4]);
  });

  it("the Rest Spot updates whenever the ball comes to rest, and not while it rolls", () => {
    const t = newGame();
    t.shoot("maya", 0, 0.4);
    t.advance(300);
    expect(t.ball("maya").restSpot).toEqual({ x: 100, y: 300 });

    t.advanceUntilRest("maya");
    const first = structuredClone(t.ball("maya"));
    expect(first.restSpot).toEqual({ x: first.x, y: first.y });
    expect(first.restSpot.x).toBeGreaterThan(200);

    t.shoot("maya", Math.PI / 2, 0.2);
    t.advance(200);
    expect(t.ball("maya").restSpot).toEqual(first.restSpot);
    t.advanceUntilRest("maya");
    const second = t.ball("maya");
    expect(second.restSpot).toEqual({ x: second.x, y: second.y });
    expect(second.restSpot.y).toBeGreaterThan(first.restSpot.y);
  });

  it("a ball is at rest only after staying under the rest speed for 300 ms", () => {
    const t = newGame();
    t.shoot("maya", 0, 0.3);
    let slowFor = 0;
    while (!t.ball("maya").atRest) {
      t.advance(FRAME_MS);
      const { vx, vy, atRest } = t.ball("maya");
      if (atRest) break;
      slowFor = Math.hypot(vx, vy) < REST_SPEED ? slowFor + FRAME_MS : 0;
    }
    // At rest on the 18th slow frame (300 ms at 60 Hz), not before.
    expect(slowFor).toBeGreaterThan(300 - 2 * FRAME_MS);
    expect(slowFor).toBeLessThan(300);
  });

  it("rejects nonsense shots and shots from strangers", () => {
    const t = newGame();
    expect(t.shoot("maya", Number.NaN, 0.5)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.shoot("maya", 0, Number.POSITIVE_INFINITY)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.shoot("maya", 0, 0)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.shoot("maya", 0, -1)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.shoot("ghost", 0, 0.5)).toEqual({ ok: false, reason: "unknown_player" });
    expect(t.ball("maya").atRest).toBe(true);
    expect(t.state.players.maya!.strokes).toEqual([0]);
  });
});

describe("walls", () => {
  const box = walledHole(600, 400);

  it("a ball shot at a wall bounces off and stays inside the Hole", () => {
    const t = new TestGame({ course: box });
    t.join("maya");
    t.shoot("maya", 0, 1); // straight at the right wall
    let bounced = false;
    let maxX = 0;
    while (!t.ball("maya").atRest) {
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      maxX = Math.max(maxX, b.x);
      if (b.vx < 0) bounced = true;
      expect(b.x).toBeGreaterThanOrEqual(T + BALL_RADIUS - 1);
      expect(b.x).toBeLessThanOrEqual(600 - T - BALL_RADIUS + 1);
      expect(b.y).toBeGreaterThanOrEqual(T + BALL_RADIUS - 1);
      expect(b.y).toBeLessThanOrEqual(400 - T - BALL_RADIUS + 1);
    }
    expect(bounced).toBe(true);
    expect(maxX).toBeGreaterThan(600 - T - BALL_RADIUS - 2);
  });

  it("an angled shot banks off a wall like a mirror", () => {
    const t = new TestGame({ course: box });
    t.join("maya");
    t.shoot("maya", -Math.PI / 4, 0.6); // up-right, into the top wall
    let hitTop = false;
    while (!hitTop) {
      t.advance(FRAME_MS);
      if (t.ball("maya").vy > 0) hitTop = true;
    }
    const b = t.ball("maya");
    expect(b.vx).toBeGreaterThan(0); // still heading right
    expect(b.vy).toBeGreaterThan(0); // now heading down
    expect(Math.abs(b.vy)).toBeLessThanOrEqual(Math.abs(b.vx) + 1e-6); // lost some bounce, never gained
  });

  it("a full-power shot can't pass through a thin inner wall", () => {
    const thin = walledHole(1200, 400, [rect(300, 100, 4, 200)]);
    const t = new TestGame({ course: thin });
    t.join("maya");
    t.shoot("maya", 0, 1);
    let maxX = 0;
    while (!t.ball("maya").atRest) {
      t.advance(FRAME_MS);
      maxX = Math.max(maxX, t.ball("maya").x);
    }
    expect(maxX).toBeLessThanOrEqual(300 - BALL_RADIUS + 1);
  });

  it("the Hole's edge holds the ball even where the author drew no wall", () => {
    const open: CourseData = { ...longHole, holes: [{ ...longHole.holes[0]!, width: 500, walls: [] }] };
    const t = new TestGame({ course: open });
    t.join("maya");
    t.shoot("maya", 0, 1);
    while (!t.ball("maya").atRest) {
      t.advance(FRAME_MS);
      expect(t.ball("maya").x).toBeLessThanOrEqual(500 - BALL_RADIUS + 1);
    }
  });

  it("the placeholder Hole's centre block bounces a straight shot back", () => {
    const t = new TestGame();
    t.join("maya");
    t.shoot("maya", 0, 1);
    let maxX = 0;
    let bounced = false;
    while (!t.ball("maya").atRest) {
      t.advance(FRAME_MS);
      maxX = Math.max(maxX, t.ball("maya").x);
      if (t.ball("maya").vx < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(maxX).toBeLessThanOrEqual(440 - BALL_RADIUS + 1);
    expect(t.ball("maya").x).toBeLessThan(440);
  });
});

describe("the physics clock", () => {
  it("runs in fixed 60 Hz steps, so uneven step sizes give the same result", () => {
    const run = (chunks: number[]) => {
      const t = newGame();
      t.shoot("maya", 0.3, 0.8);
      for (let i = 0; i < 120; i++) t.game.step(chunks[i % chunks.length]!);
      return { ...t.ball("maya") };
    };
    const totalPerCycle = (chunks: number[]) => chunks.reduce((a, b) => a + b, 0);
    const even = [FRAME_MS, FRAME_MS, FRAME_MS];
    const uneven = [5, 20, 1000 / 20 - 25];
    expect(totalPerCycle(uneven)).toBeCloseTo(totalPerCycle(even), 9);
    const a = run(even);
    const b = run(uneven);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it("the same shots give the same ball path every time", () => {
    const play = () => {
      const t = new TestGame({ course: walledHole(600, 400) });
      t.join("maya");
      t.join("ben");
      t.shoot("maya", 0.7, 1);
      t.shoot("ben", -2.1, 0.9);
      t.advance(2500);
      return [t.ball("maya"), t.ball("ben")].map((b) => ({ ...b }));
    };
    expect(play()).toEqual(play());
  });
});
