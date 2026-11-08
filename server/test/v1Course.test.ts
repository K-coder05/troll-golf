import { readFileSync } from "node:fs";
import { BALL_RADIUS, convertCourse, ITEM_TUNING, type HoleData, type SurfaceKind, type TiledMap } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { courses, defaultCourse, v1Course } from "../src/courses";
import { createSeededRng } from "../src/simulation";
import { pointInPolygon } from "../src/simulation/surfaces";
import { courseSurfaces } from "../src/simulation/surfaces";
import { play, solveHole, type Shot } from "./courseSolver";
import { TestGame } from "./harness";

const SOURCES = [
  "01-opener",
  "02-dogleg",
  "03-sand-traps",
  "04-lagoon",
  "05-ice-rink",
  "06-boost-lane",
  "07-windmill-works",
  "08-warp-zone",
  "09-chaos-finale",
];

/**
 * Best known robust solutions found by the solver (angle in degrees, power),
 * replayed here because the full search is slow. Pars are these stroke counts
 * (+1 on Holes where the best line is a one-in-a-few-tries precision shot).
 */
const SOLUTIONS: [number, number][][] = [
  [[0, 0.6]],
  [[217.5, 1], [22.5, 0.3]],
  [[30, 1], [97.5, 0.8]],
  [[37.5, 0.6], [292.5, 0.8], [322.5, 0.45]],
  [[150, 0.45], [7.5, 0.45]],
  [[0, 0.8], [37.5, 0.45]],
  [[37.5, 1], [67.5, 0.8]],
  [[345, 1], [202.5, 0.8]],
  [[-27.427, 0.8], [352.5, 0.6], [60, 0.8], [15, 0.8]],
];
const toShots = (s: [number, number][]): Shot[] => s.map(([d, power]) => ({ angle: (d * Math.PI) / 180, power }));

const insideWall = (hole: HoleData, p: { x: number; y: number }) => hole.walls.some((w) => pointInPolygon(p, w));

describe("the 9-Hole v1 Course", () => {
  it("is exactly what the course converter makes from the Tiled maps in the repo", () => {
    const sources = SOURCES.map((name) => ({
      name,
      map: JSON.parse(readFileSync(new URL(`../src/courses/v1/${name}.tmj`, import.meta.url), "utf8")) as TiledMap,
    }));
    // If this fails, re-run `npm run convert-v1-course`.
    expect(v1Course).toEqual(convertCourse({ id: "v1", name: "Troll Golf v1" }, sources));
  });

  it("is the default Course, with the sample and the Practice Box still selectable", () => {
    expect(defaultCourse).toBe(v1Course);
    expect(Object.keys(courses)).toEqual(expect.arrayContaining(["v1", "sample"]));
    expect(Object.keys(courses).length).toBeGreaterThanOrEqual(3);
    expect(v1Course.holes).toHaveLength(9);
  });

  it("shows every surface, hazard, Boost Pad, Teleporter, windmill and sliding wall somewhere", () => {
    const kinds = new Set<SurfaceKind>(["fairway"]);
    for (const h of v1Course.holes) for (const z of h.surfaces) kinds.add(z.kind);
    for (const k of ["fairway", "rough", "sand", "ice", "water", "void"] as const) expect(kinds.has(k)).toBe(true);
    const some = (f: (h: HoleData) => number) => v1Course.holes.some((h) => f(h) > 0);
    expect(some((h) => h.boostPads.length)).toBe(true);
    expect(some((h) => h.teleporters.length)).toBe(true);
    expect(some((h) => h.windmills.length)).toBe(true);
    expect(some((h) => h.slidingWalls.length)).toBe(true);
  });

  it("has more Item Boxes at Unhinged than Normal, and more at Normal than Chill, on every Hole", () => {
    const boxes = (level: "chill" | "normal" | "unhinged", holeIndex: number) => {
      const t = new TestGame({ course: v1Course, settings: { chaosLevel: level }, items: { tuning: ITEM_TUNING } });
      t.join("maya");
      t.startPlaying();
      for (let i = 0; i < holeIndex; i++) {
        t.advanceUntilPhase("holeEnd", 300_000);
        t.advanceUntilPhase("playing", 300_000);
      }
      return t.state.itemBoxes.length;
    };
    for (let i = 0; i < 9; i++) {
      const n = v1Course.holes[i]!.itemBoxes.length;
      const [chill, normal, unhinged] = [boxes("chill", i), boxes("normal", i), boxes("unhinged", i)];
      expect(unhinged, `Hole ${i + 1}`).toBe(n);
      expect(normal, `Hole ${i + 1}`).toBeLessThan(unhinged);
      expect(chill, `Hole ${i + 1}`).toBeLessThan(normal);
    }
  }, 300_000);

  describe.each(v1Course.holes.map((h, i) => [i + 1, h] as const))("Hole %i", (index, hole) => {
    it("has a Par and 3-6 Item Box spawn points away from the Tee-to-Cup line", () => {
      expect(hole.par).toBeGreaterThanOrEqual(2);
      expect(hole.itemBoxes.length).toBeGreaterThanOrEqual(3);
      expect(hole.itemBoxes.length).toBeLessThanOrEqual(6);
      const { tee, cup } = hole;
      const len = Math.hypot(cup.x - tee.x, cup.y - tee.y);
      for (const b of hole.itemBoxes) {
        const off = Math.abs((cup.x - tee.x) * (tee.y - b.y) - (tee.x - b.x) * (cup.y - tee.y)) / len;
        expect(off, `box ${b.x},${b.y}`).toBeGreaterThan(40);
        expect(insideWall(hole, b)).toBe(false);
        expect(courseSurfaces(hole).at(b)).not.toMatch(/void/);
      }
    });

    it("has the Tee and Cup inside the Hole, off walls and hazards", () => {
      const surfaces = courseSurfaces(hole);
      for (const p of [hole.tee, hole.cup]) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(hole.width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(hole.height);
        expect(insideWall(hole, p)).toBe(false);
        expect(["water", "void"]).not.toContain(surfaces.at(p));
      }
      // A ball sitting on the Tee clears every wall by its radius.
      for (const d of [[BALL_RADIUS, 0], [-BALL_RADIUS, 0], [0, BALL_RADIUS], [0, -BALL_RADIUS]] as const) {
        expect(insideWall(hole, { x: hole.tee.x + d[0], y: hole.tee.y + d[1] })).toBe(false);
      }
    });

    it("can be Holed Out within Par + 2 Strokes (recorded line replays, and a search from the Tee agrees on short Holes)", () => {
      const r = play(hole, toShots(SOLUTIONS[index - 1]!));
      expect(r.holedOut).toBe(true);
      expect(r.strokes).toBeLessThanOrEqual(hole.par + 1);
      expect(r.strokes).toBeGreaterThanOrEqual(hole.par - 1);
      if (hole.par <= 3) {
        const found = solveHole(hole, { maxShots: 2, angles: 36, powers: [0.3, 0.6, 1], beam: 6 });
        expect(found, "search").not.toBeNull();
        expect(found!.strokes).toBeLessThanOrEqual(hole.par + 2);
      }
    }, 120_000);

    it("never leaves a ball stuck, inside a wall or outside the Hole after random shots", () => {
      const rng = createSeededRng(index * 77);
      for (let n = 0; n < 40; n++) {
        const shots: Shot[] = [];
        const depth = 1 + (n % 3);
        for (let d = 0; d < depth; d++) shots.push({ angle: rng.next() * Math.PI * 2, power: 0.15 + rng.next() * 0.85 });
        const r = play(hole, shots);
        const where = JSON.stringify(shots);
        expect(r.stuck, `moving forever after ${where}`).toBe(false);
        if (r.holedOut) continue;
        expect(r.ball.x, where).toBeGreaterThan(0);
        expect(r.ball.x, where).toBeLessThan(hole.width);
        expect(r.ball.y, where).toBeGreaterThan(0);
        expect(r.ball.y, where).toBeLessThan(hole.height);
        expect(insideWall(hole, r.ball), where).toBe(false);
      }
    }, 120_000);
  });
});
