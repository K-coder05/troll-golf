import {
  slidingWallCentre,
  windmillAngle,
  type CourseData,
  type HoleData,
  type Polygon,
  type SlidingWallData,
  type WindmillData,
} from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { sampleCourse } from "../../src/courses";
import { COUNTDOWN_MS } from "../../src/simulation";
import { PHYSICS_STEP_MS, PhysicsWorld } from "../../src/simulation/physics";
import { pointInPolygon } from "../../src/simulation/surfaces";
import { FRAME_MS, TestGame } from "../harness";

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

function hole(extra: Partial<HoleData> = {}): HoleData {
  return {
    id: "t",
    name: "T",
    par: 3,
    width: 1000,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: 950, y: 100, radius: 12 },
    walls: [],
    surfaces: [],
    boostPads: [],
    teleporters: [],
    itemBoxes: [],
    windmills: [],
    slidingWalls: [],
    ...extra,
  };
}
const course = (h: HoleData): CourseData => ({ id: "t", name: "T", holes: [h] });

const windmill = (extra: Partial<WindmillData> = {}): WindmillData => ({
  x: 500,
  y: 300,
  length: 200,
  thickness: 10,
  angularSpeed: Math.PI / 2,
  phase: 0,
  ...extra,
});
const slider = (extra: Partial<SlidingWallData> = {}): SlidingWallData => ({
  width: 20,
  height: 200,
  start: { x: 300, y: 300 },
  end: { x: 700, y: 300 },
  period: 4,
  phase: 0,
  ...extra,
});

describe("obstacle motion", () => {
  it("a Windmill turns at its angular speed and a Sliding Wall follows its path with its period", () => {
    const world = new PhysicsWorld({
      hole: hole({ windmills: [windmill({ phase: 0.5 })], slidingWalls: [slider({ phase: 0.25 })] }),
    });
    const stepsFor = (sec: number) => Math.round((sec * 1000) / PHYSICS_STEP_MS);
    const run = (steps: number) => {
      for (let i = 0; i < steps; i++) world.step();
    };

    expect(world.obstaclePoses().windmills[0]!.angle).toBeCloseTo(0.5, 6);
    expect(world.obstaclePoses().slidingWalls[0]!.x).toBeCloseTo(500, 3); // a quarter in: halfway
    run(stepsFor(1)); // quarter turn
    expect(world.obstaclePoses().windmills[0]!.angle).toBeCloseTo(0.5 + Math.PI / 2, 4);
    expect(world.obstaclePoses().slidingWalls[0]!.x).toBeCloseTo(700, 3); // half a period: far end
    run(stepsFor(2)); // 3 s: phase 0.25 + 0.75 = 1.0 -> back at the start
    expect(world.obstaclePoses().slidingWalls[0]!.x).toBeCloseTo(300, 3);
    expect(world.obstacleTimeMs).toBeCloseTo(3000, 3);
  });

  it("obstacle time is 0 during the countdown, runs while playing and the pose matches the shared formula", () => {
    const h = hole({ windmills: [windmill()], slidingWalls: [slider()] });
    const t = new TestGame({ course: course(h) });
    t.join("maya");
    t.send("maya", { type: "start" });
    t.advance(COUNTDOWN_MS - 200);
    expect(t.state.phase).toBe("countdown");
    expect(t.state.obstacleTimeMs).toBe(0);
    t.advanceUntilPhase("playing", 1000);
    t.advance(1000);
    expect(t.state.obstacleTimeMs).toBeGreaterThan(950);
    expect(t.state.obstacleTimeMs).toBeLessThan(1050);
    const sec = t.state.obstacleTimeMs / 1000;
    expect(windmillAngle(h.windmills[0]!, sec)).toBeCloseTo((Math.PI / 2) * sec, 6);
    expect(slidingWallCentre(h.slidingWalls[0]!, 2).x).toBeCloseTo(700, 6);
  });

  it("restarts at 0 on the next Hole", () => {
    const h = hole({ windmills: [windmill()] });
    const t = new TestGame({ course: { id: "t", name: "T", holes: [h, h] }, settings: { holeTimerSec: 2 } });
    t.join("maya");
    t.startPlaying();
    t.advanceUntilPhase("holeEnd");
    expect(t.state.obstacleTimeMs).toBeGreaterThan(1900);
    t.advanceUntilPhase("countdown");
    expect(t.state.obstacleTimeMs).toBe(0);
  });
});

describe("balls and moving obstacles", () => {
  it("a Sliding Wall deflects a ball and gives it its motion", () => {
    // Sweeps right from x=40 and passes through the ball resting on the Tee (100, 300).
    const sw = slider({ start: { x: 40, y: 300 }, end: { x: 440, y: 300 }, period: 4 });
    const t = new TestGame({ course: course(hole({ slidingWalls: [sw] })) });
    t.join("maya");
    t.startPlaying();
    let fastest = 0;
    for (let i = 0; i < 120; i++) {
      t.advance(FRAME_MS);
      fastest = Math.max(fastest, t.ball("maya").vx);
    }
    const b = t.ball("maya");
    // Shoved along by the wall alone: no Stroke, and it ends up ahead of the wall's face.
    expect(t.state.players.maya!.strokes[0]).toBe(0);
    expect(b.x).toBeGreaterThan(150);
    expect(fastest).toBeGreaterThan(100);
    const wall = slidingWallCentre(sw, t.state.obstacleTimeMs / 1000);
    expect(b.x).toBeGreaterThan(wall.x + sw.width / 2 - 1);
  });

  it("a Windmill blade knocks a resting ball away", () => {
    // Pivot at the Tee's right; the blade is horizontal at t=0 and turns clockwise.
    const t = new TestGame({ course: course(hole({ windmills: [windmill({ x: 100, y: 300, length: 200, phase: -0.5 })] })) });
    t.join("maya");
    t.startPlaying();
    let moved = false;
    let maxSpeed = 0;
    for (let i = 0; i < 180; i++) {
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      if (!b.atRest) moved = true;
      maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy));
    }
    expect(moved).toBe(true);
    expect(maxSpeed).toBeGreaterThan(50);
    expect(t.state.players.maya!.strokes[0]).toBe(0);
  });

  it("a shot bounces off a Windmill blade instead of passing through", () => {
    const t = new TestGame({ course: course(hole({ windmills: [windmill({ angularSpeed: 0, phase: Math.PI / 2 })] })) });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.8);
    t.advanceUntilRest("maya");
    // The vertical blade at x=500 stops the ball on its left.
    expect(t.ball("maya").x).toBeLessThan(500);
  });

  it("a ball pinned between a Sliding Wall and a static wall is never pushed through", () => {
    const solid = rect(600, 0, 40, 600);
    const sw = slider({ start: { x: 300, y: 300 }, end: { x: 640, y: 300 }, period: 3, height: 300 });
    const t = new TestGame({ course: course(hole({ walls: [solid], slidingWalls: [sw] })) });
    t.join("maya");
    t.startPlaying();
    // Walk the ball up to the static wall.
    t.shoot("maya", 0, 0.5);
    t.advanceUntilRest("maya");
    expect(t.ball("maya").x).toBeLessThan(600);
    for (let i = 0; i < 60 * 20; i++) {
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      expect(b.x).toBeLessThan(600);
      expect(pointInPolygon(b, solid)).toBe(false);
    }
  });

  it("a ball squeezed against the Hole's edge stays inside", () => {
    const sw = slider({ start: { x: 700, y: 300 }, end: { x: 1000, y: 300 }, period: 2, width: 60, height: 300 });
    const t = new TestGame({ course: course(hole({ slidingWalls: [sw] })) });
    t.join("maya");
    t.startPlaying();
    t.shoot("maya", 0, 0.7);
    for (let i = 0; i < 60 * 20; i++) {
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(1000);
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(600);
    }
  });

  it("fast shots at a thin, fast Sliding Wall never end up inside it", () => {
    const sw = slider({ width: 4, height: 400, start: { x: 300, y: 300 }, end: { x: 700, y: 300 }, period: 1 });
    const t = new TestGame({ course: course(hole({ slidingWalls: [sw] })) });
    t.join("maya");
    t.startPlaying();
    let shots = 0;
    for (let i = 0; i < 60 * 40; i++) {
      // Fire again whenever the ball rests, alternating directions, at full power.
      if (t.ball("maya").atRest) t.shoot("maya", shots++ % 2 === 0 ? 0 : Math.PI, 1);
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      const c = slidingWallCentre(sw, t.state.obstacleTimeMs / 1000);
      expect(Math.abs(b.x - c.x) < sw.width / 2 && Math.abs(b.y - c.y) < sw.height / 2).toBe(false);
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(1000);
    }
    expect(shots).toBeGreaterThan(3);
  });

  it("is deterministic", () => {
    const run = () => {
      const t = new TestGame({ course: course(hole({ windmills: [windmill({ x: 400, phase: 1 })], slidingWalls: [slider()] })) });
      t.join("maya");
      t.startPlaying();
      t.shoot("maya", 0.05, 0.9);
      t.advance(5000);
      return { ...t.ball("maya") };
    };
    expect(run()).toEqual(run());
  });
});

describe("obstacles in a Hole converted from Tiled", () => {
  const dogleg = sampleCourse.holes[1]!;

  it("the sample Dogleg has a Windmill and a Sliding Wall", () => {
    expect(dogleg.windmills).toHaveLength(1);
    expect(dogleg.windmills[0]!.angularSpeed).toBeCloseTo(Math.PI / 3, 6);
    expect(dogleg.slidingWalls).toHaveLength(1);
    expect(dogleg.slidingWalls[0]).toMatchObject({ width: 14, height: 120, period: 4, phase: 0 });
    expect(dogleg.slidingWalls[0]!.end.x - dogleg.slidingWalls[0]!.start.x).toBe(170);
  });

  it("plays: balls bounce off them and stay inside the Hole", () => {
    const t = new TestGame({ course: sampleCourse });
    t.join("maya");
    t.startPlaying();
    t.advanceUntilPhase("countdown", 200_000); // Hole 1 times out; no shots there
    t.advanceUntilPhase("playing");
    expect(t.state.holeIndex).toBe(1);
    // Straight up the left corridor into the Windmill, then along the top into the Sliding Wall.
    t.shoot("maya", -Math.PI / 2, 0.6);
    for (let i = 0; i < 60 * 8; i++) {
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      for (const w of dogleg.walls) expect(pointInPolygon(b, w)).toBe(false);
    }
  });
});
