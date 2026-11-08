import { readFileSync } from "node:fs";
import { convertCourse, type TiledMap } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { defaultCourse, loadCourse, sampleCourse } from "../src/courses";
import { TestGame } from "./harness";

const SOURCES = ["01-warm-up", "02-dogleg", "03-island-hop"];

describe("the sample Course", () => {
  it("is exactly what the course converter makes from the Tiled maps in the repo", () => {
    const sources = SOURCES.map((name) => ({
      name,
      map: JSON.parse(readFileSync(new URL(`../src/courses/sample/${name}.tmj`, import.meta.url), "utf8")) as TiledMap,
    }));
    const converted = convertCourse({ id: "sample", name: "Sample Course" }, sources);
    // If this fails, re-run `npm run convert-sample-course`.
    expect(sampleCourse).toEqual(converted);
  });

  it("has 3 Holes with Cups of the default radius and is the default Course", () => {
    expect(sampleCourse.holes.map((h) => h.name)).toEqual(["Warm-Up", "Dogleg", "Island Hop"]);
    expect(sampleCourse.holes.every((h) => h.cup.radius === 12)).toBe(true);
    expect(defaultCourse).toBe(sampleCourse);
  });

  it("plays a full round: a hole-in-one on the Warm-Up, then two Holes run out the clock", () => {
    const t = new TestGame({ course: sampleCourse });
    t.join("maya", "Maya");
    t.startPlaying();
    expect(t.state.courseId).toBe("sample");
    expect(t.state.pars).toEqual(sampleCourse.holes.map((h) => h.par));

    // Warm-Up: the Cup is 560 px straight right of the Tee.
    t.shoot("maya", 0, 0.6);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    expect(t.state.phase).toBe("holeEnd");

    t.advanceUntilPhase("countdown");
    expect(t.state.holeIndex).toBe(1);
    expect(t.ball("maya")).toMatchObject(sampleCourse.holes[1]!.tee);
    t.advanceUntilPhase("gameEnd", 300_000);
    expect(t.state.players.maya!.strokes).toEqual([1, 2, 2]);
  });
});

describe("loading course data", () => {
  it("rejects data without Holes, Tee, Cup or Par", () => {
    expect(() => loadCourse(null)).toThrow(/not an object/);
    expect(() => loadCourse({ id: "x", name: "X", holes: [] })).toThrow(/no Holes/);
    const hole = sampleCourse.holes[0]!;
    const { tee: _tee, ...noTee } = hole;
    expect(() => loadCourse({ id: "x", name: "X", holes: [noTee] })).toThrow(/Hole 1: missing Tee/);
    expect(() => loadCourse({ id: "x", name: "X", holes: [hole, { ...hole, par: 0 }] })).toThrow(/Hole 2: bad par/);
  });
});
