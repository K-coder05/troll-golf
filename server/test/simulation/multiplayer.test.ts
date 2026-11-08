import type { CourseData, HoleData, Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { placeholderCourse } from "../../src/courses/placeholder";
import { FRAME_MS, TestGame } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** A walled 1200x600 box. */
function box(id: string, extra: Partial<HoleData> = {}): HoleData {
  return {
    id,
    name: id,
    par: 3,
    width: 1200,
    height: 600,
    tee: { x: 200, y: 300 },
    cup: { x: 1100, y: 540, radius: 12 },
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

const course = (id: string, ...holes: HoleData[]): CourseData => ({ id, name: id.toUpperCase(), holes });

/** Players join in order (the first is the room creator), the game starts and the 3-2-1 is over. */
function playing(c: CourseData, ...players: string[]): TestGame {
  const t = new TestGame({ course: c });
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.drain();
  return t;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const angleOf = (v: { vx: number; vy: number }) => Math.atan2(v.vy, v.vx);

describe("the lobby", () => {
  it("the room creator runs it: only they can pick the Course and start", () => {
    const other = course("other", box("o1", { par: 4 }), box("o2", { par: 5, cup: { x: 900, y: 100, radius: 20 } }));
    const t = new TestGame({ course: placeholderCourse, courses: { other } });
    t.join("maya", "Maya");
    t.join("ben", "Ben");
    expect(t.state.creatorId).toBe("maya");

    expect(t.send("ben", { type: "configure", courseId: "other" })).toEqual({ ok: false, reason: "not_creator" });
    expect(t.send("ben", { type: "start" })).toEqual({ ok: false, reason: "not_creator" });
    expect(t.state.phase).toBe("lobby");
    expect(t.state.courseId).toBe("placeholder");

    expect(t.send("maya", { type: "configure", courseId: "nope" })).toEqual({ ok: false, reason: "unknown_course" });
    t.drain();
    expect(t.send("maya", { type: "configure", courseId: "other" })).toEqual({ ok: true });
    expect(t.state.courseId).toBe("other");
    expect(t.state.pars).toEqual([4, 5]);
    expect(t.state.players.ben!.strokes).toEqual([0, 0]);
    expect(t.drain()).toContainEqual({
      type: "hole",
      payload: { holeIndex: 0, hole: other.holes[0] },
      audience: { kind: "everyone" },
    });

    expect(t.send("maya", { type: "start" })).toEqual({ ok: true });
    expect(t.state.phase).toBe("countdown");
    // The game is under way: the Course is locked in.
    expect(t.send("maya", { type: "configure", courseId: "placeholder" })).toEqual({ ok: false, reason: "wrong_phase" });

    // The chosen Course is the one played.
    t.advanceUntilPhase("playing");
    t.advanceUntilPhase("holeEnd");
    t.advanceUntilPhase("countdown");
    expect(t.state.holeIndex).toBe(1);
    expect(t.state.cup).toEqual({ x: 900, y: 100, radius: 20 });
  });

  it("tells each joining Player which Courses the room can play", () => {
    const other = course("other", box("o1"), box("o2"));
    const t = new TestGame({ course: placeholderCourse, courses: { other } });
    t.join("maya");
    t.drain();
    t.join("ben");
    const courses = t.drain().filter((e) => e.type === "courses");
    expect(courses).toEqual([
      {
        type: "courses",
        payload: {
          courses: [
            { id: "other", name: "OTHER", holes: 2 },
            { id: "placeholder", name: "Practice Box", holes: 1 },
          ],
        },
        audience: { kind: "player", playerId: "ben" },
      },
    ]);
  });

  it("hands the lobby to the longest-present Player when the room creator leaves", () => {
    const t = new TestGame();
    t.join("maya", "Maya");
    t.join("ben", "Ben");
    t.join("jay", "Jay");
    t.drain();

    t.send("maya", { type: "leave" });
    expect(t.state.creatorId).toBe("ben");
    expect(t.drain()).toContainEqual({ type: "feed", payload: { text: "Ben now runs the lobby" }, audience: { kind: "everyone" } });
    expect(t.send("maya", { type: "start" })).toEqual({ ok: false, reason: "unknown_player" });
    expect(t.send("jay", { type: "start" })).toEqual({ ok: false, reason: "not_creator" });
    expect(t.send("ben", { type: "start" })).toEqual({ ok: true });

    // Anyone else leaving changes nothing; the last one out leaves nobody running the lobby.
    t.send("jay", { type: "leave" });
    expect(t.state.creatorId).toBe("ben");
    t.send("ben", { type: "leave" });
    expect(t.state.creatorId).toBe("");
  });
});

describe("ball-ball collisions", () => {
  it("two balls that collide on the course both change course", () => {
    const t = playing(course("c", box("open")), "maya", "ben");
    // Ben rolls out to the right and stops.
    t.shoot("ben", 0, 0.3);
    t.advanceUntilRest("ben");
    const benAt = { ...t.ball("ben") };
    expect(benAt.x).toBeGreaterThan(300);

    // Maya aims half a ball below Ben's centre: a glancing hit.
    const maya = t.ball("maya");
    const aim = Math.atan2(benAt.y + 8 - maya.y, benAt.x - maya.x);
    t.shoot("maya", aim, 0.6);
    let benHit = false;
    let mayaAfterHit = 0;
    for (let ms = 0; ms < 3000 && !benHit; ms += FRAME_MS) {
      t.advance(FRAME_MS);
      benHit = !t.ball("ben").atRest;
      mayaAfterHit = angleOf(t.ball("maya"));
    }

    expect(benHit).toBe(true);
    t.advanceUntilRest("ben");
    t.advanceUntilRest("maya");
    // Ben was knocked away and Maya was deflected off her line.
    expect(distance(t.ball("ben"), benAt)).toBeGreaterThan(50);
    expect(Math.abs(mayaAfterHit - aim)).toBeGreaterThan(0.3);
    // Getting knocked costs no Stroke.
    expect(t.state.players.ben!.strokes).toEqual([1]);
  });

  it("two balls inside the Cup's capture radius don't collide", () => {
    // A huge Cup right on the Tee: both balls start inside its capture radius.
    const hole = box("cup", { tee: { x: 400, y: 300 }, cup: { x: 400, y: 300, radius: 60 } });
    const t = playing(course("c", hole), "maya", "ben");
    const benAt = { ...t.ball("ben") };
    expect(benAt.y).toBeLessThan(t.ball("maya").y);

    // Maya fires straight at Ben, far too fast to drop in.
    t.shoot("maya", -Math.PI / 2, 1);
    while (t.ball("maya").y > 200) {
      t.advance(FRAME_MS);
      expect(t.ball("ben")).toMatchObject({ x: benAt.x, y: benAt.y, atRest: true });
    }
    // She went straight through him.
    expect(t.ball("maya").x).toBeCloseTo(400, 3);
    expect(t.state.players.ben!.holedOut).toBe(false);
  });

  it("the same shot outside the Cup knocks the other ball", () => {
    const t = playing(course("c", box("open", { tee: { x: 400, y: 300 } })), "maya", "ben");
    const benAt = { ...t.ball("ben") };
    t.shoot("maya", -Math.PI / 2, 1);
    t.advance(300);
    expect(distance(t.ball("ben"), benAt)).toBeGreaterThan(50);
  });

  it("a ball in the Cup's capture radius can't be knocked by a ball coming from outside", () => {
    // Ben sits on the edge of the capture radius; Maya rolls in from 200 px away.
    const hole = box("edge", { tee: { x: 400, y: 300 }, cup: { x: 400, y: 120, radius: 30 } });
    const t = playing(course("c", hole), "maya", "ben");
    const benAt = { ...t.ball("ben") };
    // Move Ben up next to the Cup: a slow roll that stops short of it, then check he's in the zone.
    t.shoot("ben", -Math.PI / 2, 0.172);
    t.advanceUntilRest("ben");
    const benRest = { ...t.ball("ben") };
    expect(benRest.y).toBeLessThan(benAt.y);
    expect(t.state.players.ben!.holedOut).toBe(false);
    if (distance(benRest, t.state.cup) > 30 + 8) return expect.fail(`Ben stopped ${distance(benRest, t.state.cup)} px from the Cup`);

    t.shoot("maya", Math.atan2(benRest.y - t.ball("maya").y, benRest.x - t.ball("maya").x), 1);
    for (let ms = 0; ms < 600; ms += FRAME_MS) {
      t.advance(FRAME_MS);
      expect(t.ball("ben")).toMatchObject({ x: benRest.x, y: benRest.y });
    }
  });
});

describe("Standing and the Leader", () => {
  /**
   * Two Holes. On the first (Par 10, stroke cap 14) everyone dribbles and the
   * timer scores them Strokes + 2. On the second the Cup is 300 px to the
   * right of the Tee.
   */
  const twoHoles = course(
    "standing",
    box("first", { par: 10, cup: { x: 1100, y: 100, radius: 12 } }),
    box("second", { tee: { x: 200, y: 300 }, cup: { x: 500, y: 300, radius: 12 } }),
  );

  function tap(t: TestGame, id: string, times: number, angle = Math.PI / 2): void {
    for (let i = 0; i < times; i++) {
      expect(t.shoot(id, angle, 0.01)).toEqual({ ok: true });
      t.advanceUntilRest(id);
    }
  }

  function onSecondHole(benEarlier: number, mayaEarlier: number): TestGame {
    const t = new TestGame({ course: twoHoles, settings: { holeTimerSec: 20 } });
    t.join("ben", "Ben");
    t.join("maya", "Maya");
    t.startPlaying();
    tap(t, "ben", benEarlier - 2);
    tap(t, "maya", mayaEarlier - 2);
    t.advanceUntilPhase("holeEnd");
    expect(t.state.players.ben!.strokes[0]).toBe(benEarlier);
    expect(t.state.players.maya!.strokes[0]).toBe(mayaEarlier);
    t.advanceUntilPhase("playing");
    return t;
  }

  it("the spec's example: Ben (10 + 2, 20 px away) ranks above Maya (9 + 4, 300 px away)", () => {
    const t = onSecondHole(10, 9);
    // Ben rolls up close to the Cup, then taps; Maya taps four times by the Tee.
    t.shoot("ben", 0, 0.322);
    t.advanceUntilRest("ben");
    tap(t, "ben", 1);
    tap(t, "maya", 4);

    const ben = t.state.players.ben!;
    const maya = t.state.players.maya!;
    expect(ben.strokes).toEqual([10, 2]);
    expect(maya.strokes).toEqual([9, 4]);
    expect(ben.holedOut).toBe(false);
    expect(distance(ben.ball, t.state.cup)).toBeLessThan(40);
    expect(distance(maya.ball, t.state.cup)).toBeGreaterThan(280);

    expect(ben.standing).toBe(1);
    expect(maya.standing).toBe(2);
    expect(t.state.leaderId).toBe("ben");
  });

  it("Strokes come first: fewer Strokes far from the Cup beat more Strokes right next to it", () => {
    const t = onSecondHole(9, 10);
    t.shoot("ben", 0, 0.322); // Ben: 9 + 1, close to the Cup
    t.advanceUntilRest("ben");
    tap(t, "maya", 0);
    expect(distance(t.ball("ben"), t.state.cup)).toBeLessThan(distance(t.ball("maya"), t.state.cup));
    // 10 vs 10: Ben is closer, so Ben leads.
    expect(t.state.players.ben!.standing).toBe(1);

    tap(t, "ben", 1); // 11 vs 10: Maya leads although she's 300 px away.
    expect(t.state.players.maya!.standing).toBe(1);
    expect(t.state.players.ben!.standing).toBe(2);
    expect(t.state.leaderId).toBe("maya");
  });

  it("ties on Strokes go to whoever is closer to the Cup, live as the balls move", () => {
    const t = playing(course("c", box("open", { cup: { x: 900, y: 300, radius: 12 } })), "maya", "ben");
    // Ben sits on the Tee, 700 px from the Cup. Maya shoots away from it; both on 1 Stroke after Ben taps.
    tap(t, "ben", 1);
    t.shoot("maya", Math.PI, 0.1);
    t.advance(FRAME_MS * 2);
    expect(t.state.players.ben!.standing).toBe(1);
    t.advanceUntilRest("maya");
    expect(t.state.players.ben!.standing).toBe(1);
    expect(t.state.players.maya!.standing).toBe(2);

    // Maya plays towards the Cup: still 2 Strokes vs Ben's 1, so Ben stays ahead.
    t.shoot("maya", 0, 0.5);
    t.advanceUntilRest("maya");
    expect(t.state.players.ben!.standing).toBe(1);
    // Ben taps once more: 2 vs 2, and Maya is now closer.
    tap(t, "ben", 1);
    expect(distance(t.ball("maya"), t.state.cup)).toBeLessThan(distance(t.ball("ben"), t.state.cup));
    expect(t.state.players.maya!.standing).toBe(1);
  });

  it("Holed-Out Players rank by their final Strokes, and the Leader is the best Player still on the course", () => {
    const hole = box("putt", { tee: { x: 100, y: 300 }, cup: { x: 500, y: 300, radius: 12 } });
    const t = playing(course("c", hole), "maya", "ben", "jay");
    // Maya holes out in 1 (about 0.45 rolls 400 px to the Cup).
    t.shoot("maya", 0, 0.45);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    tap(t, "ben", 2);
    tap(t, "jay", 3);

    expect(t.state.players.maya!.standing).toBe(1);
    expect(t.state.players.ben!.standing).toBe(2);
    expect(t.state.players.jay!.standing).toBe(3);
    // Maya is in the Cup, so the Leader is Ben.
    expect(t.state.leaderId).toBe("ben");
    // Maya stays in the room, spectating.
    expect(t.state.phase).toBe("playing");
    expect(t.state.players.maya).toBeDefined();
  });

  it("a Holed-Out Player with more Strokes ranks below one still playing with fewer", () => {
    const hole = box("putt", { tee: { x: 100, y: 300 }, cup: { x: 500, y: 300, radius: 12 } });
    const t = playing(course("c", hole), "maya", "ben");
    tap(t, "maya", 2, -Math.PI / 2);
    t.shoot("maya", Math.atan2(300 - t.ball("maya").y, 500 - t.ball("maya").x), 0.45);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    expect(t.state.players.maya!.strokes).toEqual([3]);
    tap(t, "ben", 2);

    expect(t.state.players.ben!.standing).toBe(1);
    expect(t.state.players.maya!.standing).toBe(2);
    expect(t.state.leaderId).toBe("ben");
  });

  it("there is no Leader once everyone has Holed Out", () => {
    const hole = box("putt", { tee: { x: 100, y: 300 }, cup: { x: 500, y: 300, radius: 12 } });
    const t = playing(course("c", hole), "maya");
    expect(t.state.leaderId).toBe("maya");
    t.shoot("maya", 0, 0.45);
    t.advanceUntilRest("maya");
    expect(t.state.leaderId).toBe("");
  });
});

describe("Holing Out with others still playing", () => {
  it("the Hole goes on until every Player has Holed Out; those in the Cup spectate", () => {
    const hole = box("putt", { tee: { x: 100, y: 300 }, cup: { x: 500, y: 300, radius: 12 } });
    const t = playing(course("c", hole), "maya", "ben", "jay");
    t.shoot("maya", 0, 0.45);
    t.advanceUntilRest("maya");
    t.shoot("ben", Math.atan2(300 - t.ball("ben").y, 500 - t.ball("ben").x), 0.45);
    t.advanceUntilRest("ben");
    expect(t.state.players.ben!.holedOut).toBe(true);
    t.advance(5000);
    expect(t.state.phase).toBe("playing");
    // Spectators still get everything that happens on the course.
    t.drain();
    t.shoot("jay", Math.atan2(300 - t.ball("jay").y, 500 - t.ball("jay").x), 0.45);
    t.advanceUntilRest("jay");
    expect(t.state.players.jay!.holedOut).toBe(true);
    expect(t.state.phase).toBe("holeEnd");
    const seenByMaya = TestGame.seenBy(t.drain(), "maya");
    expect(seenByMaya.some((e) => e.type === "fx" && e.payload.kind === "holeOut")).toBe(true);
  });
});
