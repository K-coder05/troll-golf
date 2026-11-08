import { IMMUNITY_MS, ITEM_TUNING, type CourseData, type HoleData, type ItemTuning, type Polygon, type Vec2 } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { ITEM_HANDLERS, type GameEvent, type ItemHandlerRegistry } from "../../src/simulation";
import { TestGame } from "../harness";

/**
 * Cup Magnet, Ghost Ball, Swap. A walled lane; players sit on the Tee slots
 * (100,300), (100,280), (100,320) in join order and every player listed in
 * `armed` picks up the Item under test from a box at their start.
 */

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const SLOTS: Vec2[] = [
  { x: 100, y: 300 },
  { x: 100, y: 280 },
  { x: 100, y: 320 },
  { x: 100, y: 340 },
];

interface LaneOptions {
  cup?: Vec2;
  walls?: Polygon[];
  water?: Polygon[];
}

function lane(boxSlots: number[], o: LaneOptions): CourseData {
  const hole: HoleData = {
    id: "lane",
    name: "Lane",
    par: 3,
    width: 1200,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { ...(o.cup ?? { x: 1000, y: 300 }), radius: 12 },
    walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600), ...(o.walls ?? [])],
    surfaces: (o.water ?? []).map((polygon) => ({ kind: "water" as const, polygon })),
    boostPads: [],
    teleporters: [],
    itemBoxes: boxSlots.map((i) => ({ ...SLOTS[i]! })),
    windmills: [],
    slidingWalls: [],
  };
  return { id: "lane", name: "Lane", holes: [hole, { ...hole, id: "lane2" }] };
}

const TUNING: ItemTuning = {
  ...ITEM_TUNING,
  boxCountScale: 1,
  odds: {
    first: { self: 100, attack: 0, chaos: 0 },
    middle: { self: 100, attack: 0, chaos: 0 },
    last: { self: 100, attack: 0, chaos: 0 },
  },
  boxRadius: 2,
  boxRespawnMs: 1e9,
};

function game(
  item: "cupMagnet" | "ghostBall" | "swap" | "shield",
  players: string[],
  armed: string[],
  o: LaneOptions = {},
  seed = 1,
): TestGame {
  const handlers: ItemHandlerRegistry = { [item]: ITEM_HANDLERS[item]! };
  const t = new TestGame({
    course: lane(armed.map((id) => players.indexOf(id)), o),
    items: { tuning: TUNING, handlers },
    seed,
  });
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.advance(TUNING.rouletteMs + 50);
  return t;
}

const use = (t: TestGame, id: string) => t.send(id, { type: "useItem" });
const kinds = (t: TestGame, id: string) => t.state.players[id]!.effects.map((e) => e.kind);
const feed = (events: GameEvent[]) => events.filter((e) => e.type === "feed").map((e) => (e.payload as { text: string }).text);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (p: Vec2, w: Polygon) => p.x > w[0]!.x && p.x < w[1]!.x && p.y > w[0]!.y && p.y < w[2]!.y;

describe("Cup Magnet", () => {
  const cup = { x: 700, y: 120 };
  const endsAt = (magnet: boolean) => {
    const t = game("cupMagnet", ["jay", "maya"], magnet ? ["jay"] : [], { cup });
    if (magnet) expect(use(t, "jay")).toEqual({ ok: true });
    expect(t.shoot("jay", 0, 0.5)).toEqual({ ok: true });
    t.advanceUntilRest("jay");
    return { t, end: { x: t.ball("jay").x, y: t.ball("jay").y } };
  };

  it("the next shot ends closer to the Cup than the same shot without it, and the Effect clears at rest", () => {
    const plain = endsAt(false);
    const magnet = endsAt(true);
    expect(dist(magnet.end, cup)).toBeLessThan(dist(plain.end, cup) - 20);
    // It curves in: the ball is pulled toward the Cup, not teleported onto it.
    expect(magnet.end.y).toBeLessThan(plain.end.y);
    expect(kinds(magnet.t, "jay")).toEqual([]);
  });

  it("shows a badge while armed, does nothing until a shot is taken, and clears after exactly one shot", () => {
    const t = game("cupMagnet", ["jay", "maya"], ["jay"], { cup });
    use(t, "jay");
    expect(kinds(t, "jay")).toEqual(["cupMagnet"]);
    t.advance(2000);
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 300 });
    t.shoot("jay", 0, 0.5);
    expect(kinds(t, "jay")).toEqual(["cupMagnet"]);
    t.advanceUntilRest("jay");
    expect(kinds(t, "jay")).toEqual([]);
    // The second shot is a plain one.
    const before = t.ball("jay").y;
    t.shoot("jay", 0, 0.3);
    t.advanceUntilRest("jay");
    expect(Math.abs(t.ball("jay").y - before)).toBeLessThan(0.01);
  });

  it("is cleared when the Hole ends", () => {
    const t = game("cupMagnet", ["jay"], ["jay"], { cup: { x: 400, y: 300 } });
    use(t, "jay");
    t.shoot("jay", 0, 0.4);
    t.advanceUntilRest("jay");
    expect(t.state.players.jay!.holedOut).toBe(true);
    expect(kinds(t, "jay")).toEqual([]);
  });
});

describe("Ghost Ball", () => {
  const wall = rect(400, T, 20, 600 - 2 * T); // floor to ceiling
  const thick = rect(400, T, 300, 600 - 2 * T);

  it("passes through a wall that stops a normal shot; the Effect clears at rest", () => {
    const plain = game("ghostBall", ["jay", "maya"], [], { walls: [wall] });
    plain.shoot("jay", 0, 0.8);
    plain.advanceUntilRest("jay");
    expect(plain.ball("jay").x).toBeLessThan(400);

    const t = game("ghostBall", ["jay", "maya"], ["jay"], { walls: [wall] });
    use(t, "jay");
    expect(kinds(t, "jay")).toEqual(["ghostBall"]);
    t.shoot("jay", 0, 0.8);
    t.advanceUntilRest("jay");
    expect(t.ball("jay").x).toBeGreaterThan(420);
    expect(kinds(t, "jay")).toEqual([]);
    // The next shot hits the wall again.
    t.shoot("jay", Math.PI, 0.8);
    let minX = Infinity;
    while (!t.ball("jay").atRest) {
      t.advance(1000 / 60);
      minX = Math.min(minX, t.ball("jay").x);
    }
    expect(minX).toBeGreaterThan(420); // bounced off the wall, never through it
  });

  it("still takes the Water penalty beyond the wall", () => {
    const t = game("ghostBall", ["jay", "maya"], ["jay"], { walls: [wall], water: [rect(440, 16, 500, 568)] });
    use(t, "jay");
    t.shoot("jay", 0, 0.8);
    t.advanceUntilRest("jay");
    // 1 Stroke + 1 penalty, back on the Rest Spot (the Tee).
    expect(t.state.players.jay!.strokes[0]).toBe(2);
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 300 });
    expect(kinds(t, "jay")).toEqual([]);
  });

  it("a ball that stops inside a wall is moved to a legal spot, which is its Rest Spot", () => {
    const t = game("ghostBall", ["jay", "maya"], ["jay"], { walls: [thick] });
    use(t, "jay");
    t.shoot("jay", 0, 0.45);
    let wasInside = false;
    for (let i = 0; i < 1500 && !t.ball("jay").atRest; i++) {
      t.advance(1000 / 60);
      wasInside ||= inside(t.ball("jay"), thick);
    }
    expect(wasInside).toBe(true);
    const b = t.ball("jay");
    expect(b.atRest).toBe(true);
    expect(inside(b, thick)).toBe(false);
    expect(b.restSpot).toEqual({ x: b.x, y: b.y });
    expect(kinds(t, "jay")).toEqual([]);
    // It can shoot on from there.
    expect(t.shoot("jay", Math.PI, 0.2)).toEqual({ ok: true });
  });

  it("never leaves the Hole", () => {
    const t = game("ghostBall", ["jay", "maya"], ["jay"], { walls: [] });
    use(t, "jay");
    t.shoot("jay", Math.PI, 1);
    t.advanceUntilRest("jay");
    expect(t.ball("jay").x).toBeGreaterThan(0);
    t.shoot("jay", -Math.PI / 2, 1);
    t.advanceUntilRest("jay");
    expect(t.ball("jay").y).toBeGreaterThan(0);
  });

  it("other balls still collide with a ghost", () => {
    const t = game("ghostBall", ["jay", "maya"], ["jay"], { walls: [] });
    use(t, "jay");
    // Maya sits at (100,280); a ghost shot straight up from (100,300) hits her.
    t.shoot("jay", -Math.PI / 2, 0.3);
    t.advance(400);
    expect(t.ball("maya").atRest && t.ball("maya").y === 280).toBe(false);
  });
});

describe("Swap", () => {
  const players = ["jay", "maya", "ben"];

  it("trades the positions of the user's ball and an opponent's; the opponent becomes immune and gets Rest Spots updated", () => {
    const t = game("swap", players, ["jay"]);
    t.drain();
    expect(use(t, "jay")).toEqual({ ok: true });
    const jay = t.ball("jay");
    const others = [t.ball("maya"), t.ball("ben")];
    const swapped = others.find((b) => b.x === 100 && b.y === 300)!;
    expect(swapped).toBeDefined();
    expect(jay.y === 280 || jay.y === 320).toBe(true);
    expect(jay.restSpot).toEqual({ x: jay.x, y: jay.y });
    expect(swapped.restSpot).toEqual({ x: 100, y: 300 });
    expect(feed(t.drain()).some((l) => l.includes("swapped places"))).toBe(true);
    expect(t.game.getHeldItem("jay")).toBeNull();
    const log = t.game.getItemLog().filter((e) => e.kind === "hit" && e.item === "swap");
    expect(log).toHaveLength(1);
  });

  it("is deterministic for a seed and reaches every opponent over seeds", () => {
    const pick = (seed: number) => {
      const t = game("swap", players, ["jay"], {}, seed);
      use(t, "jay");
      return t.ball("maya").y === 300 ? "maya" : "ben";
    };
    expect(pick(7)).toBe(pick(7));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pick(i + 1)));
    expect(seen).toEqual(new Set(["maya", "ben"]));
  });

  it("skips Players who are disconnected or immune; with nobody left the Item is kept", () => {
    const t = game("swap", players, ["jay"]);
    t.send("maya", { type: "disconnect" });
    t.state.players.ben!.immuneUntil = t.clock.now() + IMMUNITY_MS;
    expect(use(t, "jay")).toEqual({ ok: false, reason: "no_target" });
    expect(t.game.getHeldItem("jay")).toBe("swap");
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 300 });
    // Maya reconnects: she is the only valid target now.
    t.send("maya", { type: "reconnect" });
    expect(use(t, "jay")).toEqual({ ok: true });
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 280 });
    expect(t.ball("maya")).toMatchObject({ x: 100, y: 300 });
  });

  it("skips Players who have Holed Out", () => {
    const t = game("swap", players, ["jay"], { cup: { x: 300, y: 280 } });
    const b = t.ball("maya");
    t.shoot("maya", Math.atan2(280 - b.y, 300 - b.x), 0.35);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    t.advance(IMMUNITY_MS);
    expect(use(t, "jay")).toEqual({ ok: true });
    expect(t.ball("ben")).toMatchObject({ x: 100, y: 300 });
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 320 });
  });

  it("a Shield blocks it: nothing moves, the Item is used up, no Item Hit, the Shield is gone", () => {
    // Maya leads, so her box gives a Shield; Jay (last) draws a chaos Item: Swap.
    const tuning: ItemTuning = {
      ...TUNING,
      odds: {
        first: { self: 100, attack: 0, chaos: 0 },
        middle: { self: 0, attack: 0, chaos: 100 },
        last: { self: 0, attack: 0, chaos: 100 },
      },
    };
    const t = new TestGame({
      course: lane([0, 1], {}),
      items: { tuning, handlers: { shield: ITEM_HANDLERS.shield!, swap: ITEM_HANDLERS.swap! } },
    });
    t.join("maya", "Maya");
    t.join("jay", "Jay");
    t.startPlaying();
    t.advance(TUNING.rouletteMs + 50);
    expect(t.game.getHeldItem("maya")).toBe("shield");
    expect(t.game.getHeldItem("jay")).toBe("swap");
    use(t, "maya");
    t.drain();
    expect(use(t, "jay")).toEqual({ ok: true });
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 280 });
    expect(t.ball("maya")).toMatchObject({ x: 100, y: 300 });
    expect(feed(t.drain())).toEqual(["Maya's Shield ate a Swap"]);
    expect(kinds(t, "maya")).toEqual([]);
    expect(t.game.getHeldItem("jay")).toBeNull();
    expect(t.game.getItemLog().filter((e) => e.kind === "hit" && e.item === "swap")).toHaveLength(0);
    expect(t.game.getItemLog().filter((e) => e.kind === "blocked" && e.item === "swap")).toHaveLength(1);
  });

  it("is refused after Holing Out", () => {
    const t = game("swap", players, ["jay"], { cup: { x: 300, y: 300 } });
    t.shoot("jay", 0, 0.35);
    t.advanceUntilRest("jay");
    expect(t.state.players.jay!.holedOut).toBe(true);
    t.drain();
    expect(use(t, "jay")).toEqual({ ok: false, reason: "holed_out" });
    expect(t.game.getHeldItem("jay")).toBe("swap");
  });
});
