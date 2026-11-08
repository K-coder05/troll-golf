import type { CourseData, HoleData, Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { COUNTDOWN_MS, CUP_CAPTURE_SPEED, SCOREBOARD_MS, unfinishedScore } from "../../src/simulation";
import { FRAME_MS, TestGame } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A walled 1200x600 box: Tee at (100, 300), the Cup 400 px straight to the right. */
function straightHole(id: string, par = 3, extra: Partial<HoleData> = {}): HoleData {
  return {
    id,
    name: id,
    par,
    width: 1200,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: 500, y: 300, radius: 12 },
    walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600)],
    surfaces: [],
    boostPads: [],
    teleporters: [],
    itemBoxes: [],
    windmills: [],
    slidingWalls: [],
    ...extra,
  };
}

const oneHole: CourseData = { id: "one", name: "One", holes: [straightHole("first")] };
const threeHoles: CourseData = {
  id: "three",
  name: "Three",
  holes: [
    straightHole("first", 3),
    straightHole("second", 4, { tee: { x: 200, y: 200 }, cup: { x: 900, y: 450, radius: 20 } }),
    straightHole("third", 2),
  ],
};

/** Arrives at the Cup at about 50 px/s: drops in. */
const SOFT_PUTT = 0.45;
/** Arrives at the Cup at about 480 px/s: lips out. */
const HARD_PUTT = 0.8;

function playing(course: CourseData, ...players: string[]): TestGame {
  const t = new TestGame({ course });
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.drain();
  return t;
}

/** Angle from a Player's ball to the Cup. */
function aimAtCup(t: TestGame, id: string): number {
  const b = t.ball(id);
  return Math.atan2(t.state.cup.y - b.y, t.state.cup.x - b.x);
}

describe("the Cup", () => {
  it("a slow ball inside the capture radius Holes Out", () => {
    const t = playing(oneHole, "maya");
    t.shoot("maya", 0, SOFT_PUTT);
    t.advanceUntilRest("maya");

    const maya = t.state.players.maya!;
    expect(maya.holedOut).toBe(true);
    expect(maya.ball).toMatchObject({ x: 500, y: 300, vx: 0, vy: 0, atRest: true });
    expect(maya.strokes).toEqual([1]);

    const events = t.drain();
    expect(events).toContainEqual({ type: "fx", payload: { kind: "holeOut", x: 500, y: 300 }, audience: { kind: "everyone" } });
    expect(events).toContainEqual({ type: "feed", payload: { text: "Maya holed out in 1 (-2)" }, audience: { kind: "everyone" } });
    expect(events.some((e) => e.type === "fx" && e.payload.kind === "lipOut")).toBe(false);
  });

  it("a fast ball lips out once and keeps rolling past the Cup", () => {
    const t = playing(oneHole, "maya");
    t.shoot("maya", 0, HARD_PUTT);
    let fastestInCup = 0;
    while (!t.ball("maya").atRest) {
      t.advance(FRAME_MS);
      const b = t.ball("maya");
      if (Math.hypot(b.x - 500, b.y - 300) <= 12) fastestInCup = Math.max(fastestInCup, Math.hypot(b.vx, b.vy));
    }

    expect(fastestInCup).toBeGreaterThan(CUP_CAPTURE_SPEED);
    const maya = t.state.players.maya!;
    expect(maya.holedOut).toBe(false);
    expect(maya.ball.x).toBeGreaterThan(800);
    const lipOuts = t.drain().filter((e) => e.type === "fx" && e.payload.kind === "lipOut");
    expect(lipOuts).toEqual([{ type: "fx", payload: { kind: "lipOut", x: 500, y: 300 }, audience: { kind: "everyone" } }]);
    expect(t.state.phase).toBe("playing");
  });

  it("a ball that lipped out can still drop in on a later, slower pass", () => {
    const t = playing(oneHole, "maya");
    t.shoot("maya", 0, HARD_PUTT);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(false);

    // Back towards the Cup, softly.
    const distance = t.ball("maya").x - 500;
    expect(distance).toBeGreaterThan(300);
    t.shoot("maya", aimAtCup(t, "maya"), SOFT_PUTT * (distance / 400));
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    expect(t.state.players.maya!.strokes).toEqual([2]);
  });

  it("a Player who has Holed Out can't shoot again", () => {
    const t = playing(oneHole, "maya", "ben");
    t.shoot("maya", 0, SOFT_PUTT);
    t.advanceUntilRest("maya");
    expect(t.shoot("maya", Math.PI, 1)).toEqual({ ok: false, reason: "holed_out" });
    expect(t.state.players.maya!.strokes).toEqual([1]);
  });

  it("the Cup in state is the current Hole's Cup", () => {
    const t = playing(threeHoles, "maya");
    expect(t.state.cup).toEqual({ x: 500, y: 300, radius: 12 });
  });
});

describe("the Hole flow", () => {
  it("starts in the lobby, where shots are rejected", () => {
    const t = new TestGame({ course: oneHole });
    t.join("maya");
    expect(t.state.phase).toBe("lobby");
    expect(t.state.pars).toEqual([3]);
    expect(t.shoot("maya", 0, 0.5)).toEqual({ ok: false, reason: "wrong_phase" });
    t.advance(5000);
    expect(t.state.phase).toBe("lobby");
    expect(t.ball("maya").atRest).toBe(true);
  });

  it("a start goes to a 3-2-1 countdown, then shots are allowed and the 90 s timer runs", () => {
    const t = new TestGame({ course: oneHole });
    t.join("maya");
    t.drain();
    const startedAt = t.clock.now();

    expect(t.send("maya", { type: "start" })).toEqual({ ok: true });
    expect(t.state.phase).toBe("countdown");
    expect(t.state.phaseEndsAt).toBe(startedAt + COUNTDOWN_MS);
    expect(t.state.holeEndsAt).toBe(0);
    const holes = t.drain().filter((e) => e.type === "hole");
    expect(holes).toEqual([
      { type: "hole", payload: { holeIndex: 0, hole: oneHole.holes[0] }, audience: { kind: "everyone" } },
    ]);

    t.advance(COUNTDOWN_MS - 100);
    expect(t.state.phase).toBe("countdown");
    expect(t.shoot("maya", 0, 0.5)).toEqual({ ok: false, reason: "wrong_phase" });
    expect(t.state.players.maya!.strokes).toEqual([0]);

    t.advanceUntilPhase("playing");
    expect(t.state.holeEndsAt).toBeCloseTo(t.clock.now() + 90_000, -2);
    expect(t.state.phaseEndsAt).toBe(t.state.holeEndsAt);
    expect(t.shoot("maya", 0, 0.5)).toEqual({ ok: true });
  });

  it("refuses a second start, and a start from a stranger", () => {
    const t = new TestGame({ course: oneHole });
    t.join("maya");
    expect(t.send("ghost", { type: "start" })).toEqual({ ok: false, reason: "unknown_player" });
    t.send("maya", { type: "start" });
    expect(t.send("maya", { type: "start" })).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("ends the Hole as soon as everyone has Holed Out", () => {
    const t = playing(oneHole, "maya", "ben");
    t.shoot("maya", 0, SOFT_PUTT);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    expect(t.state.phase).toBe("playing");

    t.shoot("ben", aimAtCup(t, "ben"), SOFT_PUTT);
    t.advanceUntilRest("ben");
    expect(t.state.players.ben!.holedOut).toBe(true);
    expect(t.state.phase).toBe("holeEnd");
    expect(t.state.phaseEndsAt).toBeCloseTo(t.clock.now() + SCOREBOARD_MS, -2);
    expect(t.state.holeEndsAt).toBe(0);
    // Holed-out Players keep their real score.
    expect(t.state.players.maya!.strokes).toEqual([1]);
    expect(t.state.players.ben!.strokes).toEqual([1]);
  });

  it("when the timer runs out, unfinished Players get min(Strokes + 2, Par + 4)", () => {
    const t = playing(oneHole, "maya", "ben", "jay");
    // Maya holes out in 1. Ben takes 1 shot away from the Cup. Jay dribbles 6 tiny shots.
    t.shoot("maya", 0, SOFT_PUTT);
    t.shoot("ben", Math.PI / 2, 0.2);
    for (let i = 0; i < 6; i++) {
      expect(t.shoot("jay", Math.PI, 0.01)).toEqual({ ok: true });
      t.advanceUntilRest("jay");
    }
    t.advanceUntilRest("maya");
    t.advanceUntilRest("ben");

    const timerEnd = t.state.holeEndsAt;
    t.advance(timerEnd - t.clock.now() - 100);
    expect(t.state.phase).toBe("playing");
    t.advanceUntilPhase("holeEnd", 500);

    expect(t.state.players.maya!.strokes).toEqual([1]); // finished: real score
    expect(t.state.players.ben!.strokes).toEqual([3]); // 1 + 2
    expect(t.state.players.jay!.strokes).toEqual([7]); // min(6 + 2, 3 + 4)
    expect(t.shoot("ben", 0, 0.5)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("follows the room's timer and stroke cap settings", () => {
    const t = new TestGame({ course: oneHole, settings: { holeTimerSec: 30, strokeCapOverPar: 1 } });
    t.join("maya");
    t.startPlaying();
    for (let i = 0; i < 3; i++) {
      t.shoot("maya", Math.PI, 0.01);
      t.advanceUntilRest("maya");
    }
    const ms = t.advanceUntilPhase("holeEnd");
    expect(ms).toBeLessThan(30_000);
    expect(ms).toBeGreaterThan(25_000);
    expect(t.state.players.maya!.strokes).toEqual([4]); // min(3 + 2, 3 + 1)
  });

  it("freezes the balls when the Hole ends: a rolling ball stops and takes no more penalties", () => {
    const water: Partial<HoleData> = { surfaces: [{ kind: "water", polygon: rect(100, 400, 200, 180) }] };
    const course: CourseData = { id: "w", name: "W", holes: [straightHole("w", 3, water)] };
    const t = new TestGame({ course, settings: { holeTimerSec: 1 } });
    t.join("maya");
    t.startPlaying();
    // Ends up rolling towards the Water just as the timer runs out.
    t.advance(800);
    t.shoot("maya", Math.PI / 2, 0.3);
    t.advanceUntilPhase("holeEnd");
    const frozen = { ...t.ball("maya") };
    expect(frozen).toMatchObject({ vx: 0, vy: 0, atRest: true });
    expect(t.state.players.maya!.strokes).toEqual([3]);
    t.advance(2000);
    expect(t.ball("maya")).toMatchObject({ x: frozen.x, y: frozen.y });
    expect(t.state.players.maya!.strokes).toEqual([3]);
  });

  it("shows the scoreboard for 8 s, then starts the next Hole with everyone back on its Tee", () => {
    const t = playing(threeHoles, "maya", "ben");
    t.shoot("maya", 0, SOFT_PUTT);
    t.advanceUntilRest("maya");
    t.advanceUntilPhase("holeEnd");
    t.drain();

    t.advance(SCOREBOARD_MS - 100);
    expect(t.state.phase).toBe("holeEnd");
    t.advanceUntilPhase("countdown", 500);

    expect(t.state.holeIndex).toBe(1);
    expect(t.state.cup).toEqual({ x: 900, y: 450, radius: 20 });
    const maya = t.state.players.maya!;
    const ben = t.state.players.ben!;
    expect(maya.holedOut).toBe(false);
    expect(maya.ball).toEqual({ x: 200, y: 200, vx: 0, vy: 0, atRest: true, restSpot: { x: 200, y: 200 } });
    expect(Math.hypot(ben.ball.x - 200, ben.ball.y - 200)).toBeLessThan(30);
    expect(Math.hypot(ben.ball.x - maya.ball.x, ben.ball.y - maya.ball.y)).toBeGreaterThanOrEqual(16);
    // Earlier Holes keep their scores; the new Hole starts at 0.
    expect(maya.strokes).toEqual([1, 0, 0]);
    expect(ben.strokes).toEqual([2, 0, 0]);
    // Everyone gets the new layout.
    const holes = t.drain().filter((e) => e.type === "hole");
    expect(holes).toEqual([
      { type: "hole", payload: { holeIndex: 1, hole: threeHoles.holes[1] }, audience: { kind: "everyone" } },
    ]);

    // The new Hole plays: its own Cup is where balls drop in now.
    t.advanceUntilPhase("playing");
    t.shoot("maya", aimAtCup(t, "maya"), 0.75);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    expect(t.state.players.maya!.strokes).toEqual([1, 1, 0]);
  });

  it("goes lobby → countdown → playing → holeEnd → … → gameEnd over a 3-Hole round", () => {
    const t = new TestGame({ course: threeHoles });
    t.join("maya");
    const phases: string[] = [t.state.phase];
    const holes: number[] = [];
    t.send("maya", { type: "start" });
    while (t.state.phase !== "gameEnd") {
      const seen: string = t.state.phase;
      if (phases.at(-1) !== seen) {
        phases.push(seen);
        if (seen === "countdown") holes.push(t.state.holeIndex);
      }
      t.advance(250);
    }
    phases.push("gameEnd");
    expect(phases).toEqual([
      "lobby",
      ...["countdown", "playing", "holeEnd"],
      ...["countdown", "playing", "holeEnd"],
      ...["countdown", "playing", "holeEnd"],
      "gameEnd",
    ]);
    expect(holes).toEqual([0, 1, 2]);
    // Nobody shot: each Hole scored at min(0 + 2, Par + 4).
    expect(t.state.players.maya!.strokes).toEqual([2, 2, 2]);
    expect(t.state.phaseEndsAt).toBe(0);
  });

  it("stays on the final results once the last Hole is over", () => {
    const t = playing({ ...oneHole }, "maya");
    t.shoot("maya", 0, SOFT_PUTT);
    t.advanceUntilRest("maya");
    t.advanceUntilPhase("holeEnd");
    t.drain();
    t.advanceUntilPhase("gameEnd", SCOREBOARD_MS + 100);
    expect(t.drain()).toContainEqual({ type: "feed", payload: { text: "Game over" }, audience: { kind: "everyone" } });
    t.advance(60_000);
    expect(t.state.phase).toBe("gameEnd");
    expect(t.state.holeIndex).toBe(0);
    expect(t.state.players.maya!.strokes).toEqual([1]);
    expect(t.shoot("maya", 0, 0.5)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("a Player leaving ends the Hole if everyone still in the room has Holed Out", () => {
    const t = playing(oneHole, "maya", "ben");
    t.shoot("maya", 0, SOFT_PUTT);
    t.advanceUntilRest("maya");
    t.send("ben", { type: "leave" });
    t.advance(FRAME_MS);
    expect(t.state.phase).toBe("holeEnd");
  });
});

describe("the unfinished-Hole score", () => {
  it("is Strokes + 2, capped at Par + the stroke cap", () => {
    expect(unfinishedScore(0, 3, 4)).toBe(2);
    expect(unfinishedScore(4, 3, 4)).toBe(6);
    expect(unfinishedScore(5, 3, 4)).toBe(7);
    expect(unfinishedScore(12, 3, 4)).toBe(7);
    expect(unfinishedScore(3, 5, 0)).toBe(5);
  });
});
