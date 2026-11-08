import {
  ITEM_CATALOGUE,
  ITEM_TUNING,
  type CourseData,
  type HoleData,
  type ItemCategory,
  type ItemId,
  type OddsRow,
  type Polygon,
} from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import {
  chooseBoxSpawns,
  createSeededRng,
  drawItem,
  ITEM_HANDLERS,
  oddsRowFor,
  type GameEvent,
  type ItemHandler,
} from "../../src/simulation";
import { TestGame, type TestGameOptions } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/**
 * A walled 1200x600 lane: Tee (100, 300), Cup (500, 300) straight to the
 * right, an Item Box on the line at (250, 300), Water below the Tee.
 */
function lane(extra: Partial<HoleData> = {}): CourseData {
  const hole: HoleData = {
    id: "lane",
    name: "Lane",
    par: 3,
    width: 1200,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: 500, y: 300, radius: 12 },
    walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600)],
    surfaces: [{ kind: "water", polygon: rect(40, 450, 320, 120) }],
    boostPads: [],
    teleporters: [],
    itemBoxes: [{ x: 250, y: 300 }],
    windmills: [],
    slidingWalls: [],
    ...extra,
  };
  return { id: "lane", name: "Lane", holes: [hole, { ...hole, id: "lane2", name: "Lane 2" }] };
}

/** Reaches about x = 350 and stops, well short of the Cup, through the box at x = 250. */
const SHORT = 0.25;
/** Drops into the Cup at (500, 300). */
const SOFT_PUTT = 0.45;
const RIGHT = 0;
const DOWN = Math.PI / 2;

function playing(options: TestGameOptions, ...players: string[]): TestGame {
  const t = new TestGame(options);
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.drain();
  return t;
}

const held = (t: TestGame, id: string) => t.game.getHeldItem(id);
const strokes = (t: TestGame, id: string) => t.state.players[id]!.strokes[t.state.holeIndex];
const useItem = (t: TestGame, id: string, params: { targetId?: string; point?: { x: number; y: number } } = {}) =>
  t.send(id, { type: "useItem", ...params });
const itemMessages = (events: GameEvent[]) => events.filter((e) => e.type === "item" || e.type === "itemDenied");

/** Maya rolls through the lane's box with a short shot and waits out the roulette. */
function mayaPicksUp(t: TestGame): void {
  t.shoot("maya", RIGHT, SHORT);
  t.advanceUntilRest("maya");
  t.advance(ITEM_TUNING.rouletteMs);
}

describe("Item Boxes", () => {
  it("each Hole's spawn points get a box, in public state", () => {
    const t = playing({ course: lane() }, "maya");
    expect(t.state.itemBoxes).toEqual([{ id: 0, x: 250, y: 300, active: true, respawnAt: 0 }]);
  });

  it("there are no boxes when Items are off", () => {
    const t = playing({ course: lane(), settings: { itemsEnabled: false } }, "maya");
    expect(t.state.itemBoxes).toEqual([]);
    t.shoot("maya", RIGHT, SHORT);
    t.advanceUntilRest("maya");
    expect(held(t, "maya")).toBeNull();
  });

  it("rolling through an active box with an empty slot gives an Item; the box shatters and respawns after 10 s", () => {
    const t = playing({ course: lane() }, "maya", "ben");
    t.shoot("maya", RIGHT, SHORT);
    // Run until the box shatters.
    let shatteredAt = 0;
    for (let i = 0; i < 120 && t.state.itemBoxes[0]!.active; i++) {
      t.advance(1000 / 60);
      shatteredAt = t.clock.now();
    }
    expect(t.state.itemBoxes[0]).toMatchObject({ active: false, respawnAt: shatteredAt + 10_000 });
    expect(held(t, "maya")).toBe("mulligan");

    const events = t.drain();
    expect(events).toContainEqual({ type: "fx", payload: { kind: "itemBox", x: 250, y: 300 }, audience: { kind: "everyone" } });
    expect(events).toContainEqual({
      type: "item",
      payload: { item: "mulligan", roulette: true, readyAt: shatteredAt + ITEM_TUNING.rouletteMs },
      audience: { kind: "player", playerId: "maya" },
    });

    t.advance(10_000 - 100);
    expect(t.state.itemBoxes[0]!.active).toBe(false);
    t.advance(200);
    expect(t.state.itemBoxes[0]).toMatchObject({ active: true, respawnAt: 0 });
  });

  it("is a sensor: the ball's path is the same with or without the box", () => {
    const withBox = playing({ course: lane() }, "maya");
    const without = playing({ course: lane({ itemBoxes: [] }) }, "maya");
    for (const t of [withBox, without]) {
      t.shoot("maya", 0.05, 0.3);
      t.advanceUntilRest("maya");
    }
    expect(held(withBox, "maya")).toBe("mulligan");
    expect(held(without, "maya")).toBeNull();
    expect(withBox.ball("maya")).toEqual(without.ball("maya"));
  });

  it("a Player already holding an Item rolls through without picking anything up", () => {
    const t = playing({ course: lane({ itemBoxes: [{ x: 250, y: 300 }, { x: 285, y: 300 }] }) }, "maya");
    t.shoot("maya", RIGHT, SHORT);
    t.advanceUntilRest("maya");
    expect(t.ball("maya").x).toBeGreaterThan(285);
    expect(t.state.itemBoxes.map((b) => b.active)).toEqual([false, true]);
    expect(t.game.getItemLog().filter((e) => e.kind === "pickup")).toHaveLength(1);
  });

  it("a box gives at most one Item: the next ball through a shattered box gets nothing", () => {
    const t = playing({ course: lane() }, "maya", "ben");
    t.shoot("maya", RIGHT, SHORT);
    t.advanceUntilRest("maya");
    t.shoot("ben", 0.02, SHORT);
    t.advanceUntilRest("ben");
    expect(held(t, "maya")).toBe("mulligan");
    expect(held(t, "ben")).toBeNull();
  });

  it("only some spawn points get a box when the box count is scaled down, deterministically", () => {
    const points = [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 0 }));
    expect(chooseBoxSpawns(points, 1, createSeededRng(1))).toEqual(points);
    const half = chooseBoxSpawns(points, 0.5, createSeededRng(7));
    expect(half).toHaveLength(3);
    expect(chooseBoxSpawns(points, 0.5, createSeededRng(7))).toEqual(half);
    expect(chooseBoxSpawns(points, 0.01, createSeededRng(7))).toHaveLength(1);
    expect(chooseBoxSpawns([], 1, createSeededRng(7))).toEqual([]);
  });

  it("boxes come back fresh on the next Hole", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    expect(t.state.itemBoxes[0]!.active).toBe(false);
    t.advanceUntilPhase("holeEnd", 200_000);
    t.advanceUntilPhase("countdown");
    expect(t.state.itemBoxes).toEqual([{ id: 0, x: 250, y: 300, active: true, respawnAt: 0 }]);
    // The held Item carries over to the next Hole.
    expect(held(t, "maya")).toBe("mulligan");
  });
});

describe("the draw", () => {
  it("1st Standing uses the first row, last the last, everyone between the middle", () => {
    expect(oddsRowFor(1, 1)).toBe("first");
    expect(oddsRowFor(1, 2)).toBe("first");
    expect(oddsRowFor(2, 2)).toBe("last");
    expect([1, 2, 3, 4, 5].map((s) => oddsRowFor(s, 5))).toEqual(["first", "middle", "middle", "middle", "last"]);
  });

  it("with a seeded Rng the category follows the right odds row (statistical, many draws)", () => {
    const expected: Record<OddsRow, Record<ItemCategory, number>> = {
      first: { self: 70, attack: 28, chaos: 2 },
      middle: { self: 40, attack: 55, chaos: 5 },
      last: { self: 15, attack: 70, chaos: 15 },
    };
    const draws = 20_000;
    for (const row of ["first", "middle", "last"] as const) {
      const rng = createSeededRng(42);
      const counts: Record<ItemCategory, number> = { self: 0, attack: 0, chaos: 0 };
      for (let i = 0; i < draws; i++) {
        const drawn = drawItem(rng, ITEM_TUNING.odds, row, ITEM_CATALOGUE, () => true)!;
        counts[drawn.category]++;
        // With every Item available, the Item is always from the drawn category.
        expect(ITEM_CATALOGUE[drawn.item].category).toBe(drawn.category);
      }
      for (const category of ["self", "attack", "chaos"] as const) {
        expect(Math.abs((counts[category] / draws) * 100 - expected[row][category])).toBeLessThan(1.2);
      }
    }
  });

  it("draws an Item within its category by weight", () => {
    const rng = createSeededRng(3);
    const counts: Partial<Record<ItemId, number>> = {};
    for (let i = 0; i < 20_000; i++) {
      const { item } = drawItem(rng, ITEM_TUNING.odds, "last", ITEM_CATALOGUE, () => true)!;
      counts[item] = (counts[item] ?? 0) + 1;
    }
    // Attack: Freeze 3, Golf Gun 3, Ink 3, Banana 2 out of 11, at 70%.
    expect((counts.bananaMine! / 20_000) * 100).toBeCloseTo((70 * 2) / 11, -0.5);
    expect((counts.freezeRay! / 20_000) * 100).toBeCloseTo((70 * 3) / 11, -0.5);
  });

  it("is deterministic with the same seed", () => {
    const run = () => {
      const rng = createSeededRng(9);
      return Array.from({ length: 50 }, () => drawItem(rng, ITEM_TUNING.odds, "middle", ITEM_CATALOGUE, () => true));
    };
    expect(run()).toEqual(run());
  });

  it("falls back to any available Item when the drawn category has none yet (placeholder until tickets 15-19)", () => {
    const rng = createSeededRng(5);
    const onlyMulligan = (id: ItemId) => id === "mulligan";
    const categories = new Set<ItemCategory>();
    for (let i = 0; i < 500; i++) {
      const drawn = drawItem(rng, ITEM_TUNING.odds, "last", ITEM_CATALOGUE, onlyMulligan)!;
      expect(drawn.item).toBe("mulligan");
      categories.add(drawn.category);
    }
    // The drawn category is still reported as rolled.
    expect(categories).toEqual(new Set(["self", "attack", "chaos"]));
    expect(drawItem(rng, ITEM_TUNING.odds, "last", ITEM_CATALOGUE, () => false)).toBeNull();
  });

  it("a pickup uses the picker's Standing row, and the pickup is logged with a timestamp", () => {
    const t = playing({ course: lane() }, "maya", "ben", "jay");
    // Jay (on the Tee's lowest slot) falls to last: two shots into the Water.
    for (let i = 0; i < 2; i++) {
      t.shoot("jay", DOWN, 0.5);
      t.advanceUntilRest("jay");
    }
    t.advance(100);
    expect(t.state.players.jay!.standing).toBe(3);
    const at = t.clock.now();
    t.shoot("jay", RIGHT, SHORT);
    t.advanceUntilRest("jay");
    const pickup = t.game.getItemLog().find((e) => e.kind === "pickup");
    expect(pickup).toMatchObject({ kind: "pickup", playerId: "jay", item: "mulligan", standing: 3, row: "last", rigged: false, holeIndex: 0 });
    expect(pickup!.at).toBeGreaterThan(at);
  });
});

describe("holding and using an Item", () => {
  it("the Item is decided at pickup; the roulette only delays its use", () => {
    const t = playing({ course: lane() }, "maya");
    t.shoot("maya", RIGHT, SHORT);
    while (held(t, "maya") === null) t.advance(1000 / 60);
    const pickup = t.game.getItemLog().find((e) => e.kind === "pickup")!;
    const slot = t.drain().find((e) => e.type === "item")!;
    expect(slot.payload).toEqual({ item: pickup.item, roulette: true, readyAt: pickup.at + ITEM_TUNING.rouletteMs });
    expect(held(t, "maya")).toBe(pickup.item);

    // Still spinning on the client: not usable yet, and still held.
    t.advance(Math.max(0, pickup.at + ITEM_TUNING.rouletteMs - t.clock.now() - 50));
    expect(useItem(t, "maya")).toEqual({ ok: false, reason: "item_not_ready" });
    expect(held(t, "maya")).toBe(pickup.item);
    t.advance(100);
    t.shoot("maya", RIGHT, 0.1);
    expect(useItem(t, "maya")).toEqual({ ok: true });
    expect(t.game.getItemLog().at(-1)).toMatchObject({ kind: "use", item: pickup.item, playerId: "maya" });
  });

  it("is private: only the holder is told what they hold, and it is not in synced state", () => {
    const t = playing({ course: lane() }, "maya", "ben");
    t.shoot("maya", RIGHT, SHORT);
    t.advanceUntilRest("maya");
    const events = t.drain();
    expect(JSON.stringify(t.state)).not.toMatch(/mulligan|"item"/i);
    expect(JSON.stringify(TestGame.seenBy(events, "ben"))).not.toMatch(/mulligan|"item"/i);
    expect(TestGame.seenBy(events, "maya").filter((e) => e.type === "item")).toHaveLength(1);
  });

  it("an empty slot can't be used", () => {
    const t = playing({ course: lane() }, "maya");
    expect(useItem(t, "maya")).toEqual({ ok: false, reason: "no_item" });
    expect(itemMessages(t.drain())).toEqual([]);
  });

  it("rejects malformed targets and points, keeping the Item", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    t.drain();
    expect(t.send("maya", { type: "useItem", targetId: 7 })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.send("maya", { type: "useItem", point: { x: "a", y: 1 } })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(held(t, "maya")).toBe("mulligan");
    expect(itemMessages(t.drain())).toEqual([
      { type: "itemDenied", payload: { item: "mulligan", reason: "invalid_payload" }, audience: { kind: "player", playerId: "maya" } },
      { type: "itemDenied", payload: { item: "mulligan", reason: "invalid_payload" }, audience: { kind: "player", playerId: "maya" } },
    ]);
  });

  it("can't be used between Holes", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    t.advanceUntilPhase("holeEnd", 200_000);
    expect(useItem(t, "maya")).toEqual({ ok: false, reason: "wrong_phase" });
    expect(held(t, "maya")).toBe("mulligan");
  });

  it("survives a disconnect, and the reconnecting Player is told what they hold", () => {
    const t = playing({ course: lane() }, "maya", "ben");
    mayaPicksUp(t);
    t.send("maya", { type: "disconnect" });
    expect(held(t, "maya")).toBe("mulligan");
    t.drain();
    t.send("maya", { type: "reconnect" });
    const slot = t.drain().filter((e) => e.type === "item");
    expect(slot).toEqual([
      { type: "item", payload: expect.objectContaining({ item: "mulligan", roulette: false }), audience: { kind: "player", playerId: "maya" } },
    ]);
    expect(useItem(t, "maya")).toEqual({ ok: true });
  });

  it("every use is logged with a timestamp", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    const at = t.clock.now();
    useItem(t, "maya");
    expect(t.game.getItemLog().at(-1)).toEqual({
      kind: "use",
      at,
      phase: "playing",
      holeIndex: 0,
      playerId: "maya",
      item: "mulligan",
      category: "self",
      summary: "Maya: Mulligan, -1 Stroke on Hole 1",
    });
  });

  it("after a use the slot is empty and the holder is told", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    t.drain();
    useItem(t, "maya");
    expect(held(t, "maya")).toBeNull();
    expect(t.drain().filter((e) => e.type === "item")).toEqual([
      { type: "item", payload: { item: null, roulette: false, readyAt: 0 }, audience: { kind: "player", playerId: "maya" } },
    ]);
  });
});

describe("Mulligan", () => {
  it("after a shot into the Water, restores the ball from before that shot and refunds 2 Strokes", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    const before = { x: t.ball("maya").x, y: t.ball("maya").y };
    expect(strokes(t, "maya")).toBe(1);
    t.shoot("maya", DOWN, 0.5);
    t.advanceUntilRest("maya");
    expect(strokes(t, "maya")).toBe(3); // the shot + the Water penalty
    t.drain();

    expect(useItem(t, "maya")).toEqual({ ok: true });
    expect(strokes(t, "maya")).toBe(1);
    expect(t.ball("maya")).toMatchObject({ ...before, vx: 0, vy: 0, atRest: true, restSpot: before });
    const events = t.drain();
    expect(events).toContainEqual({ type: "feed", payload: { text: "Maya took a Mulligan (-2)" }, audience: { kind: "everyone" } });
    expect(events).toContainEqual({ type: "fx", payload: { kind: "itemUse", item: "mulligan", ...before }, audience: { kind: "everyone" } });
  });

  it("works while the ball is still rolling, and it can be shot again from there", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    const before = { x: t.ball("maya").x, y: t.ball("maya").y };
    t.shoot("maya", RIGHT, 0.6);
    t.advance(300);
    expect(t.ball("maya").atRest).toBe(false);
    expect(useItem(t, "maya")).toEqual({ ok: true });
    expect(t.ball("maya")).toMatchObject({ ...before, atRest: true });
    expect(strokes(t, "maya")).toBe(1);
    t.advance(500);
    expect(t.ball("maya")).toMatchObject({ ...before, atRest: true });
    expect(t.shoot("maya", RIGHT, 0.1)).toEqual({ ok: true });
  });

  it("takes back only the last shot", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    t.shoot("maya", RIGHT, 0.15);
    t.advanceUntilRest("maya");
    const b = { x: t.ball("maya").x, y: t.ball("maya").y };
    t.shoot("maya", Math.atan2(510 - b.y, 200 - b.x), 0.6);
    t.advanceUntilRest("maya");
    expect(strokes(t, "maya")).toBe(4);
    useItem(t, "maya");
    expect(strokes(t, "maya")).toBe(2);
    expect(t.ball("maya")).toMatchObject(b);
  });

  it("with no shot this Hole there is nothing to take back: the Item is kept", () => {
    const t = playing({ course: lane() }, "maya");
    mayaPicksUp(t);
    t.advanceUntilPhase("holeEnd", 200_000);
    t.advanceUntilPhase("playing");
    t.drain();
    expect(useItem(t, "maya")).toEqual({ ok: false, reason: "no_shot" });
    expect(held(t, "maya")).toBe("mulligan");
    expect(itemMessages(t.drain())).toEqual([
      { type: "itemDenied", payload: { item: "mulligan", reason: "no_shot" }, audience: { kind: "player", playerId: "maya" } },
    ]);
  });

  it("is rejected after Holing Out, and the Item is kept", () => {
    // A second box sits on the Cup: Maya, already holding, rolls through it into the Cup.
    const t = playing({ course: lane({ itemBoxes: [{ x: 250, y: 300 }, { x: 500, y: 300 }] }) }, "maya", "ben");
    t.shoot("maya", RIGHT, SOFT_PUTT);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    t.advance(ITEM_TUNING.rouletteMs);
    expect(useItem(t, "maya")).toEqual({ ok: false, reason: "holed_out" });
    expect(held(t, "maya")).toBe("mulligan");
    expect(strokes(t, "maya")).toBe(1);
  });
});

describe("Players who have Holed Out", () => {
  /** A stand-in self Item that works after Holing Out, so the rule can be checked before tickets 15-19. */
  const shield: ItemHandler<"shield"> = { id: "shield", use: (ctx) => ({ ok: true, summary: `${ctx.user.name}: Shield` }) };
  const options: TestGameOptions = {
    course: lane({ itemBoxes: [{ x: 250, y: 300 }, { x: 500, y: 300 }] }),
    // Data, not code: Mulligan's weight 0 means boxes never give it.
    items: {
      catalogue: { ...ITEM_CATALOGUE, mulligan: { ...ITEM_CATALOGUE.mulligan, weight: 0 } },
      handlers: { ...ITEM_HANDLERS, shield },
    },
  };

  it("keep and can use their held Item, but can't pick up new ones", () => {
    const t = playing(options, "maya", "ben");
    t.shoot("maya", RIGHT, SOFT_PUTT);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    expect(held(t, "maya")).toBe("shield");
    // The box on the Cup is still there: Maya was holding when she rolled through it.
    expect(t.state.itemBoxes[1]!.active).toBe(true);

    t.advance(ITEM_TUNING.rouletteMs);
    expect(useItem(t, "maya")).toEqual({ ok: true });
    expect(held(t, "maya")).toBeNull();
    // Her ball sits in the Cup, right on an active box, with an empty slot: nothing is picked up.
    t.advance(3000);
    expect(held(t, "maya")).toBeNull();
    expect(t.state.itemBoxes[1]!.active).toBe(true);
  });
});

describe("Item data", () => {
  it("weights are data: a weight-0 Item never comes from a box", () => {
    const shield: ItemHandler<"shield"> = { id: "shield", use: () => ({ ok: true, summary: "Shield" }) };
    const t = playing(
      {
        course: lane(),
        items: {
          catalogue: { ...ITEM_CATALOGUE, mulligan: { ...ITEM_CATALOGUE.mulligan, weight: 0 } },
          handlers: { ...ITEM_HANDLERS, shield },
        },
      },
      "maya",
    );
    t.shoot("maya", RIGHT, SHORT);
    t.advanceUntilRest("maya");
    expect(held(t, "maya")).toBe("shield");
  });

  it("durations are data: the respawn and roulette times come from the tuning", () => {
    const t = playing({ course: lane(), items: { tuning: { ...ITEM_TUNING, boxRespawnMs: 3000, rouletteMs: 200 } } }, "maya");
    t.shoot("maya", RIGHT, SHORT);
    while (t.state.itemBoxes[0]!.active) t.advance(1000 / 60);
    const pickedAt = t.clock.now();
    t.advance(250);
    expect(useItem(t, "maya")).toEqual({ ok: true });
    t.advance(pickedAt + 3000 - t.clock.now() + 20);
    expect(t.state.itemBoxes[0]!.active).toBe(true);
  });
});
