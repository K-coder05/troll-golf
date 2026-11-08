import { ITEM_CATALOGUE, ITEM_TUNING, type CourseData, type HoleData, type ItemTuning, type Polygon, type Vec2 } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { ITEM_HANDLERS, type GameEvent } from "../../src/simulation";
import { TestGame } from "../harness";

/**
 * Banana Mine. Walled lane. Players sit on the Tee slots in join order:
 * (100,300), (100,280). The first Standing draws a Shield (self column),
 * the Player listed as `mined` gets a Banana Mine (last Standing, attack column).
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
];

function lane(boxSlots: number[], cupX: number): CourseData {
  const hole: HoleData = {
    id: "lane",
    name: "Lane",
    par: 3,
    width: 1200,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: cupX, y: 300, radius: 12 },
    walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600)],
    surfaces: [],
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
    middle: { self: 0, attack: 100, chaos: 0 },
    last: { self: 0, attack: 100, chaos: 0 },
  },
  boxRadius: 2,
  boxRespawnMs: 1e9,
};
const HANDLERS = { bananaMine: ITEM_HANDLERS.bananaMine!, shield: ITEM_HANDLERS.shield! };

/** ben (1st Standing, slot 0) and maya (last, slot 1); `boxes` says who has a box. */
function game(opts: { seed?: number; cupX?: number; shieldBen?: boolean } = {}): TestGame {
  const t = new TestGame({
    seed: opts.seed ?? 1,
    course: lane(opts.shieldBen ? [0, 1] : [1], opts.cupX ?? 1000),
    items: { tuning: TUNING, handlers: HANDLERS },
  });
  t.join("ben", "Ben");
  t.join("maya", "Maya");
  t.startPlaying();
  t.advance(TUNING.rouletteMs + 50);
  return t;
}

const useItem = (t: TestGame, id: string, point?: Vec2) => t.send(id, { type: "useItem", ...(point ? { point } : {}) });
const feed = (events: GameEvent[]) => events.filter((e) => e.type === "feed").map((e) => (e.payload as { text: string }).text);
const speed = (t: TestGame, id: string) => Math.hypot(t.ball(id).vx, t.ball(id).vy);
const hits = (t: TestGame) => t.game.getItemLog().filter((e) => e.kind === "hit" && e.item === "bananaMine");

/** Ben rolls out east and rests; Maya lays a mine on the Tee; Maya rolls clear. Returns Ben's rest position. */
function setUp(t: TestGame): void {
  t.shoot("ben", -0.02, 0.3);
  t.advanceUntilRest("ben");
  expect(useItem(t, "maya")).toEqual({ ok: true });
  t.shoot("maya", 0.3, 0.2);
  t.advanceUntilRest("maya");
}

/** Ben shoots back at the mine on Maya's Tee spot. */
function shootAtMine(t: TestGame, who = "ben"): void {
  const b = t.ball(who);
  t.shoot(who, Math.atan2(280 - b.y, 100 - b.x), 0.5);
}

describe("Banana Mine", () => {
  it("lays a public trap at the ball; the owner rolling away doesn't set it off", () => {
    const t = game();
    expect(t.game.getHeldItem("maya")).toBe("bananaMine");
    const at = { ...t.ball("maya") };
    expect(useItem(t, "maya")).toEqual({ ok: true });
    expect(t.game.getHeldItem("maya")).toBeNull();
    expect(t.state.traps).toHaveLength(1);
    expect(t.state.traps[0]).toMatchObject({ x: at.x, y: at.y, expiresAt: t.clock.now() + ITEM_CATALOGUE.bananaMine.durationMs });
    expect(Object.keys(t.state.traps[0]!).sort()).toEqual(["expiresAt", "id", "x", "y"]);
    t.shoot("maya", 0.3, 0.2);
    t.advanceUntilRest("maya");
    expect(t.state.traps).toHaveLength(1);
  });

  it("the next ball to touch it gets a random-direction push, the trap disappears, deterministic by seed", () => {
    const run = (seed: number) => {
      const t = game({ seed });
      setUp(t);
      t.drain();
      shootAtMine(t);
      let pushed: { vx: number; vy: number } | null = null;
      for (let i = 0; i < 600 && t.state.traps.length > 0; i++) t.advance(1000 / 60);
      expect(t.state.traps).toHaveLength(0);
      t.advance(1000 / 60);
      pushed = t.ball("ben");
      return { pushed, events: t.drain() };
    };
    const a = run(1);
    const b = run(1);
    const c = run(2);
    expect(Math.hypot(a.pushed.vx, a.pushed.vy)).toBeGreaterThan(300);
    expect(b.pushed).toEqual(a.pushed);
    expect(c.pushed).not.toEqual(a.pushed);
    expect(feed(a.events)).toContain("Ben slipped on Maya's banana");
  });

  it("the owner's own ball sets it off too, with a spin but no Item Hit", () => {
    const t = game();
    setUp(t);
    t.drain();
    shootAtMine(t, "maya");
    for (let i = 0; i < 600 && t.state.traps.length > 0; i++) t.advance(1000 / 60);
    expect(t.state.traps).toHaveLength(0);
    expect(feed(t.drain())).toContain("Maya slipped on their own banana");
    expect(hits(t)).toHaveLength(0);
    expect(t.state.players.maya!.immuneUntil).toBeLessThan(t.clock.now());
  });

  it("an opponent setting it off is an Item Hit for the owner and a kill feed line", () => {
    const t = game();
    setUp(t);
    shootAtMine(t);
    for (let i = 0; i < 600 && t.state.traps.length > 0; i++) t.advance(1000 / 60);
    expect(hits(t)).toHaveLength(1);
    expect(hits(t)[0]).toMatchObject({ playerId: "maya", targetId: "ben" });
    expect(t.state.players.ben!.immuneUntil).toBeGreaterThan(t.clock.now());
  });

  it("a Shield eats it: no push, no Item Hit, and the trap is still used up", () => {
    const t = game({ shieldBen: true });
    expect(useItem(t, "ben")).toEqual({ ok: true }); // Shield
    t.shoot("ben", -0.02, 0.3);
    t.advanceUntilRest("ben");
    useItem(t, "maya");
    t.shoot("maya", 0.3, 0.2);
    t.advanceUntilRest("maya");
    t.drain();
    shootAtMine(t);
    for (let i = 0; i < 600 && t.state.traps.length > 0; i++) t.advance(1000 / 60);
    expect(t.state.traps).toHaveLength(0);
    expect(hits(t)).toHaveLength(0);
    expect(feed(t.drain())).toContain("Ben's Shield ate a Banana Mine");
  });

  it("an untriggered trap disappears after 45 s", () => {
    const t = game();
    useItem(t, "maya");
    t.advance(44_500);
    expect(t.state.traps).toHaveLength(1);
    t.advance(600);
    expect(t.state.traps).toHaveLength(0);
  });

  it("traps clear when the next Hole starts", () => {
    const t = game();
    useItem(t, "maya");
    expect(t.state.traps).toHaveLength(1);
    t.advanceUntilPhase("holeEnd");
    expect(t.state.traps).toHaveLength(0);
  });

  describe("a Holed-Out Player places it by clicking", () => {
    const holeOut = (): TestGame => {
      const t = game({ cupX: 500 });
      const b = t.ball("maya");
      t.shoot("maya", Math.atan2(300 - b.y, 500 - b.x), 0.45);
      t.advanceUntilRest("maya");
      expect(t.state.players.maya!.holedOut).toBe(true);
      return t;
    };

    it("inside 3 cup-radii is rejected and the Item kept; outside is accepted", () => {
      const t = holeOut();
      const near = useItem(t, "maya", { x: 500 + 3 * 12 - 1, y: 300 });
      expect(near).toEqual({ ok: false, reason: "bad_placement" });
      expect(t.game.getHeldItem("maya")).toBe("bananaMine");
      expect(t.state.traps).toHaveLength(0);
      expect(useItem(t, "maya", { x: -5, y: 300 })).toEqual({ ok: false, reason: "bad_placement" });
      expect(useItem(t, "maya")).toEqual({ ok: false, reason: "invalid_payload" });
      expect(t.game.getHeldItem("maya")).toBe("bananaMine");
      expect(useItem(t, "maya", { x: 500 + 3 * 12 + 1, y: 300 })).toEqual({ ok: true });
      expect(t.game.getHeldItem("maya")).toBeNull();
      expect(t.state.traps).toHaveLength(1);
      expect(t.state.traps[0]).toMatchObject({ x: 537, y: 300 });
    });

    it("an opponent rolling over a placed trap is an Item Hit for the holed-out owner", () => {
      const t = holeOut();
      useItem(t, "maya", { x: 300, y: 300 });
      t.shoot("ben", 0, 0.5);
      for (let i = 0; i < 600 && t.state.traps.length > 0; i++) t.advance(1000 / 60);
      expect(t.state.traps).toHaveLength(0);
      expect(hits(t)).toHaveLength(1);
    });
  });
});
