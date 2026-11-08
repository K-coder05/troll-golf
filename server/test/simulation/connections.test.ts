import type { CourseData, HoleData, Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { COUNTDOWN_MS, isTargetable, SCOREBOARD_MS } from "../../src/simulation";
import { FRAME_MS, TestGame } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A walled 1200x600 box: Tee at (100, 300), the Cup 400 px straight to the right. */
function straightHole(id: string, par = 3): HoleData {
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
  };
}

const oneHole: CourseData = { id: "one", name: "One", holes: [straightHole("first")] };
const threeHoles: CourseData = {
  id: "three",
  name: "Three",
  holes: [straightHole("first", 3), straightHole("second", 4), straightHole("third", 2)],
};

/** Arrives at the Cup slowly enough to drop in. */
const SOFT_PUTT = 0.45;

function playing(course: CourseData, ...players: string[]): TestGame {
  const t = new TestGame({ course });
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.drain();
  return t;
}

const aimAt = (t: TestGame, id: string, to: { x: number; y: number }) => {
  const b = t.ball(id);
  return Math.atan2(to.y - b.y, to.x - b.x);
};

function holeOut(t: TestGame, id: string): void {
  t.shoot(id, aimAt(t, id, t.state.cup), SOFT_PUTT);
  t.advanceUntilRest(id);
  expect(t.state.players[id]!.holedOut).toBe(true);
}

const feedTexts = (t: TestGame) => t.drain().flatMap((e) => (e.type === "feed" ? [e.payload.text] : []));

describe("a Player whose connection drops mid-Hole", () => {
  it("leaves their ball where it is: a rolling ball stops dead and nothing moves it", () => {
    const t = playing(oneHole, "maya", "ben");
    t.shoot("ben", Math.PI / 2, 0.8);
    t.advance(200);
    const before = { ...t.ball("ben") };
    expect(before.atRest).toBe(false);

    expect(t.send("ben", { type: "disconnect" })).toEqual({ ok: true });
    expect(t.state.players.ben!.connected).toBe(false);
    expect(feedTexts(t)).toContain("Ben disconnected");
    t.advance(3000);
    expect(t.ball("ben")).toMatchObject({ x: before.x, y: before.y, vx: 0, vy: 0, atRest: true });
  });

  it("has no collisions: another ball rolls straight through it", () => {
    // Control: connected, Maya's ball knocks Ben's (on the Tee slot above hers) away.
    const control = playing(oneHole, "maya", "ben");
    const benStart = { ...control.ball("ben") };
    control.shoot("maya", aimAt(control, "maya", benStart), 0.5);
    control.advanceUntilRest("maya");
    control.advanceUntilRest("ben");
    expect(Math.hypot(control.ball("ben").x - benStart.x, control.ball("ben").y - benStart.y)).toBeGreaterThan(20);
    const blockedTravel = 300 - control.ball("maya").y;

    const t = playing(oneHole, "maya", "ben");
    t.send("ben", { type: "disconnect" });
    t.shoot("maya", aimAt(t, "maya", benStart), 0.5);
    t.advanceUntilRest("maya");
    expect(t.ball("ben")).toMatchObject({ x: benStart.x, y: benStart.y, atRest: true });
    // Maya's ball went on through where Ben's sits, keeping all its speed.
    expect(300 - t.ball("maya").y).toBeGreaterThan(blockedTravel + 50);
  });

  it("can't be targeted, and can't shoot while gone", () => {
    const t = playing(oneHole, "maya", "ben");
    expect(isTargetable(t.state.players.ben!)).toBe(true);
    t.send("ben", { type: "disconnect" });
    expect(isTargetable(t.state.players.ben!)).toBe(false);
    expect(t.shoot("ben", 0, 0.5)).toEqual({ ok: false, reason: "not_connected" });
    expect(t.send("ben", { type: "disconnect" })).toEqual({ ok: false, reason: "not_connected" });
    t.send("ben", { type: "reconnect" });
    expect(isTargetable(t.state.players.ben!)).toBe(true);
  });

  it("doesn't hold up the everyone-Holed-Out check", () => {
    const t = playing(oneHole, "maya", "ben");
    t.send("ben", { type: "disconnect" });
    holeOut(t, "maya");
    t.advance(FRAME_MS);
    expect(t.state.phase).toBe("holeEnd");
  });

  it("is scored min(Strokes + 2, stroke cap) if still gone when the Hole ends", () => {
    const t = playing(threeHoles, "maya", "ben", "jay");
    // Ben: 1 Stroke, then drops. Jay: 6 Strokes, then drops (cap is Par 3 + 4 = 7).
    t.shoot("ben", -Math.PI / 2, 0.2);
    t.advanceUntilRest("ben");
    for (let i = 0; i < 6; i++) {
      t.shoot("jay", Math.PI / 2, 0.05);
      t.advanceUntilRest("jay");
    }
    t.send("ben", { type: "disconnect" });
    t.send("jay", { type: "disconnect" });
    holeOut(t, "maya");
    t.advance(FRAME_MS);
    expect(t.state.phase).toBe("holeEnd");
    expect(t.state.players.ben!.strokes[0]).toBe(3);
    expect(t.state.players.jay!.strokes[0]).toBe(7);
  });

  it("who misses a whole Hole while gone is scored its stroke cap, like a late joiner", () => {
    const t = playing(threeHoles, "maya", "ben");
    t.send("ben", { type: "disconnect" });
    holeOut(t, "maya");
    t.advanceUntilPhase("holeEnd");
    t.advanceUntilPhase("countdown", SCOREBOARD_MS + 100);
    // Still gone for all of Hole 2: their ball waits on the Tee, untouched.
    t.advanceUntilPhase("playing", COUNTDOWN_MS + FRAME_MS);
    holeOut(t, "maya");
    t.advanceUntilPhase("holeEnd");
    expect(t.state.players.ben!.strokes.slice(0, 2)).toEqual([2, 4 + 4]);
  });
});

describe("a Player who reconnects", () => {
  it("gets back the same ball, Strokes and seat, and plays on", () => {
    const t = playing(oneHole, "maya", "ben");
    t.shoot("ben", Math.PI / 2, 0.3);
    t.advanceUntilRest("ben");
    const spot = { ...t.ball("ben") };
    t.send("ben", { type: "disconnect" });
    t.advance(5000);
    t.drain();

    expect(t.send("ben", { type: "reconnect" })).toEqual({ ok: true });
    const ben = t.state.players.ben!;
    expect(ben.connected).toBe(true);
    expect(ben.name).toBe("Ben");
    expect(ben.strokes).toEqual([1]);
    expect(ben.ball).toMatchObject({ x: spot.x, y: spot.y, atRest: true, restSpot: spot.restSpot });
    // The client is sent what it needs to draw the room again.
    const events = TestGame.seenBy(t.drain(), "ben");
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["time", "courses", "hole"]));
    expect(events).toContainEqual({ type: "feed", payload: { text: "Ben is back" }, audience: { kind: "everyone" } });

    expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
    t.advanceUntilRest("ben");
    expect(t.state.players.ben!.strokes).toEqual([2]);
    expect(t.send("ben", { type: "reconnect" })).toEqual({ ok: false, reason: "already_connected" });
  });

  it("collides again once back", () => {
    const t = playing(oneHole, "maya", "ben");
    const benStart = { ...t.ball("ben") };
    t.send("ben", { type: "disconnect" });
    t.send("ben", { type: "reconnect" });
    t.shoot("maya", aimAt(t, "maya", benStart), 0.5);
    t.advanceUntilRest("maya");
    t.advanceUntilRest("ben");
    expect(Math.hypot(t.ball("ben").x - benStart.x, t.ball("ben").y - benStart.y)).toBeGreaterThan(20);
  });

  it("after missing the end of a Hole, plays the next one from the Tee", () => {
    const t = playing(threeHoles, "maya", "ben");
    t.shoot("ben", -Math.PI / 2, 0.3);
    t.advanceUntilRest("ben");
    t.send("ben", { type: "disconnect" });
    holeOut(t, "maya");
    t.advanceUntilPhase("countdown", 20_000);
    expect(t.send("ben", { type: "reconnect" })).toEqual({ ok: true });
    t.advanceUntilPhase("playing", COUNTDOWN_MS + FRAME_MS);
    expect(t.state.players.ben!.strokes.slice(0, 2)).toEqual([3, 0]);
    expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
  });
});

describe("leaving", () => {
  it("mid-game keeps the Player's scores but frees the seat for good", () => {
    const t = new TestGame({ course: oneHole });
    for (let i = 1; i <= 8; i++) t.join(`p${i}`);
    t.startPlaying();
    t.shoot("p2", 0, 0.2);
    t.advanceUntilRest("p2");
    expect(t.send("p2", { type: "leave" })).toEqual({ ok: true });
    expect(t.state.players.p2).toMatchObject({ connected: false, strokes: [1] });
    expect(t.send("p2", { type: "reconnect" })).toEqual({ ok: false, reason: "left_game" });
    expect(t.join("p9").ok).toBe(true);
    expect(t.join("p10")).toEqual({ ok: false, reason: "room_full" });
  });

  it("a dropped Player whose reconnection window runs out leaves; the room creator role passes on", () => {
    const t = playing(oneHole, "maya", "ben");
    t.send("maya", { type: "disconnect" });
    expect(t.state.creatorId).toBe("maya");
    expect(t.send("maya", { type: "leave" })).toEqual({ ok: true });
    expect(t.state.players.maya!.connected).toBe(false);
    expect(t.state.creatorId).toBe("ben");
  });

  it("in the lobby a dropped Player can come back before they're removed", () => {
    const t = new TestGame({ course: oneHole });
    t.join("maya", "Maya");
    t.join("ben", "Ben");
    t.send("ben", { type: "disconnect" });
    expect(t.state.players.ben!.connected).toBe(false);
    t.send("ben", { type: "reconnect" });
    t.send("maya", { type: "start" });
    t.advanceUntilPhase("playing", COUNTDOWN_MS + FRAME_MS);
    expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
  });
});

describe("a late joiner", () => {
  it("spectates the current Hole, scored at its stroke cap, then plays the next Hole", () => {
    const t = playing(threeHoles, "maya", "ben");
    t.shoot("maya", Math.PI / 2, 0.2);
    t.advanceUntilRest("maya");

    expect(t.join("jay", "Jay")).toEqual({ ok: true });
    const jay = () => t.state.players.jay!;
    expect(jay().spectating).toBe(true);
    expect(jay().strokes).toEqual([3 + 4, 0, 0]);
    expect(feedTexts(t)).toContain("Jay joined, playing from the next Hole");
    expect(isTargetable(jay())).toBe(false);
    expect(t.shoot("jay", 0, 0.5)).toEqual({ ok: false, reason: "spectating" });
    // Standing counts the capped Hole: Jay is last, and never the Leader.
    expect(jay().standing).toBe(3);
    expect(t.state.leaderId).not.toBe("jay");

    // Jay doesn't hold up the everyone-Holed-Out check.
    holeOut(t, "maya");
    holeOut(t, "ben");
    t.advance(FRAME_MS);
    expect(t.state.phase).toBe("holeEnd");
    expect(jay().strokes[0]).toBe(7);

    t.advanceUntilPhase("countdown", SCOREBOARD_MS + 100);
    expect(jay().spectating).toBe(false);
    expect(Math.hypot(jay().ball.x - 100, jay().ball.y - 300)).toBeLessThan(60);
    t.advanceUntilPhase("playing", COUNTDOWN_MS + FRAME_MS);
    expect(t.shoot("jay", 0, 0.3)).toEqual({ ok: true });
    expect(isTargetable(jay())).toBe(true);
  });

  it("joining during the scoreboard misses the Hole just played", () => {
    const t = playing(threeHoles, "maya");
    holeOut(t, "maya");
    t.advance(FRAME_MS);
    expect(t.state.phase).toBe("holeEnd");
    t.join("jay");
    expect(t.state.players.jay!).toMatchObject({ spectating: true, strokes: [7, 0, 0] });
    t.advanceUntilPhase("countdown", SCOREBOARD_MS + 100);
    expect(t.state.players.jay!.spectating).toBe(false);
  });

  it("joining several Holes in scores each missed Hole at Par + 4", () => {
    const t = playing(threeHoles, "maya");
    holeOut(t, "maya");
    t.advanceUntilPhase("playing", 20_000);
    expect(t.state.holeIndex).toBe(1);
    t.join("jay");
    expect(t.state.players.jay!.strokes).toEqual([3 + 4, 4 + 4, 0]);
  });

  it("joining during the 3-2-1 plays the Hole about to start", () => {
    const t = new TestGame({ course: threeHoles });
    t.join("maya");
    t.send("maya", { type: "start" });
    expect(t.state.phase).toBe("countdown");
    t.join("jay");
    expect(t.state.players.jay!).toMatchObject({ spectating: false, strokes: [0, 0, 0] });
    t.advanceUntilPhase("playing", COUNTDOWN_MS + FRAME_MS);
    expect(t.shoot("jay", Math.PI / 2, 0.3)).toEqual({ ok: true });
  });

  it("joining after the last Hole just watches the results, every Hole capped", () => {
    const t = playing(oneHole, "maya");
    holeOut(t, "maya");
    t.advanceUntilPhase("gameEnd", 20_000);
    t.join("jay", "Jay");
    expect(t.state.players.jay!).toMatchObject({ spectating: true, strokes: [7] });
    expect(feedTexts(t)).toContain("Jay joined to watch");
  });
});
