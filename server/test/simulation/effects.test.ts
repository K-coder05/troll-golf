import {
  ITEM_CATALOGUE,
  ITEM_TUNING,
  IMMUNITY_MS,
  NUKE_BLAST_MS,
  NUKE_SIREN_MS,
  type CourseData,
  type HoleData,
  type ItemTuning,
  type Polygon,
  type Vec2,
} from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { ITEM_HANDLERS, isTargetable, type GameEvent, type ItemHandler } from "../../src/simulation";
import { TestGame, type TestGameOptions } from "../harness";

/**
 * Targeting, the Effects engine, Freeze Ray, Shield, Item Hits and the kill feed.
 *
 * Setup: a walled lane with the Tee at (100, 300) and the Cup far right.
 * Players line up on the Tee slots in join order: (100, 300), (100, 280),
 * (100, 320), (80, 300), so at the start Standing = join order and the first
 * to join is the Leader. An Item Box sits on the Tee slot of each Player who
 * should get an Item; a ball resting on a box picks it up on the first frame.
 * The odds are data: 1st Standing always draws a self Item (Shield), everyone
 * else an attack Item (Freeze Ray).
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
  { x: 80, y: 300 },
];

function lane(boxSlots: number[], cupX = 1000): CourseData {
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
  return { id: "lane", name: "Lane", holes: [hole, { ...hole, id: "lane2", name: "Lane 2" }] };
}

const TUNING: ItemTuning = {
  ...ITEM_TUNING,
  boxCountScale: 1,
  odds: {
    first: { self: 100, attack: 0, chaos: 0 },
    middle: { self: 0, attack: 100, chaos: 0 },
    last: { self: 0, attack: 100, chaos: 0 },
  },
  // Only the ball resting on a box reaches it (Tee slots are 20 px apart), and boxes never come back.
  boxRadius: 2,
  boxRespawnMs: 1e9,
};

const REAL = { freezeRay: ITEM_HANDLERS.freezeRay!, shield: ITEM_HANDLERS.shield! };

/**
 * A stand-in non-disabling attack Item (the Golf Gun's slot) that only goes
 * through the shared hit path, so immunity can be checked on its own. It
 * fires at `targetId` and stays held, like the Golf Gun's shots.
 */
const zapper: ItemHandler<"golfGun"> = {
  id: "golfGun",
  use(ctx) {
    const hit = ctx.hit(ctx.request.targetId ?? "", () => {});
    if (hit.result === "missed") return { ok: false, reason: hit.reason };
    return { ok: true, keep: true, summary: `zap ${hit.result}` };
  },
};

/** `players` join in order (slot = join order); those listed in `armed` get an Item from a box on their slot. */
function game(players: string[], armed: string[], extra: Partial<TestGameOptions> & { cupX?: number } = {}): TestGame {
  const t = new TestGame({
    course: lane(armed.map((id) => players.indexOf(id)), extra.cupX),
    ...extra,
    items: { tuning: TUNING, handlers: REAL, ...extra.items },
  });
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.advance(TUNING.rouletteMs + 50);
  for (const id of armed) expect(t.game.getHeldItem(id)).not.toBeNull();
  return t;
}

const held = (t: TestGame, id: string) => t.game.getHeldItem(id);
const use = (t: TestGame, id: string, targetId?: string) =>
  t.send(id, { type: "useItem", ...(targetId !== undefined ? { targetId } : {}) });
const kinds = (t: TestGame, id: string) => t.state.players[id]!.effects.map((e) => e.kind);
const frozen = (t: TestGame, id: string) => kinds(t, id).includes("frozen");
const feed = (events: GameEvent[]) => events.filter((e) => e.type === "feed").map((e) => (e.payload as { text: string }).text);
/** A soft putt from the Player's Tee slot into the Cup at (500, 300). */
function holeOut(t: TestGame, id: string): void {
  const b = t.ball(id);
  t.shoot(id, Math.atan2(300 - b.y, 500 - b.x), 0.45);
  t.advanceUntilRest(id);
  expect(t.state.players[id]!.holedOut).toBe(true);
}
const hitsLog = (t: TestGame) => t.game.getItemLog().filter((e) => e.kind === "hit" || e.kind === "blocked");

describe("targeting", () => {
  it("a tap aims a targeted Item at the Leader", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    expect(t.state.leaderId).toBe("jay");
    expect(held(t, "maya")).toBe("freezeRay");
    t.drain();
    expect(use(t, "maya")).toEqual({ ok: true });
    expect(frozen(t, "jay")).toBe(true);
    expect(frozen(t, "ben")).toBe(false);
    expect(held(t, "maya")).toBeNull();
    expect(t.game.getItemLog().at(-1)).toMatchObject({ kind: "use", item: "freezeRay", playerId: "maya", targetId: "jay" });
    expect(feed(t.drain())).toContain("Jay got frozen");
  });

  it("when the Leader can't be targeted, a tap skips to the next-best Standing (never the user)", () => {
    const t = game(["jay", "ann", "maya", "ben"], ["maya"]);
    // Disconnected Jay is still the Leader, but can't be targeted.
    t.send("jay", { type: "disconnect" });
    expect(t.state.leaderId).toBe("jay");
    expect(use(t, "maya")).toEqual({ ok: true });
    expect(frozen(t, "ann")).toBe(true);
    expect(frozen(t, "jay")).toBe(false);
  });

  it("a Leader who just got hit (immune and Frozen) is skipped; picking them is refused and the Item kept", () => {
    const t = game(["jay", "maya", "ben"], ["maya", "ben"]);
    use(t, "maya");
    expect(frozen(t, "jay")).toBe(true);
    t.drain();

    expect(use(t, "ben", "jay")).toEqual({ ok: false, reason: "untargetable" });
    expect(held(t, "ben")).toBe("freezeRay");
    expect(t.drain()).toContainEqual({
      type: "itemDenied",
      payload: { item: "freezeRay", reason: "untargetable" },
      audience: { kind: "player", playerId: "ben" },
    });
    // A tap skips Jay and hits the next-best Standing, Maya.
    expect(use(t, "ben")).toEqual({ ok: true });
    expect(frozen(t, "maya")).toBe(true);
  });

  it("with nobody who can be targeted, the Item is kept", () => {
    const t = game(["jay", "maya"], ["maya"]);
    t.send("jay", { type: "disconnect" });
    t.drain();
    expect(use(t, "maya")).toEqual({ ok: false, reason: "no_target" });
    expect(held(t, "maya")).toBe("freezeRay");
    expect(t.drain()).toEqual([
      { type: "itemDenied", payload: { item: "freezeRay", reason: "no_target" }, audience: { kind: "player", playerId: "maya" } },
    ]);
  });

  it("Holed-Out Players, yourself and unknown ids can't be picked", () => {
    const t = game(["jay", "maya"], ["maya"], { cupX: 500 });
    holeOut(t, "jay");
    expect(use(t, "maya", "jay")).toEqual({ ok: false, reason: "untargetable" });
    expect(use(t, "maya")).toEqual({ ok: false, reason: "no_target" });
    expect(use(t, "maya", "maya")).toEqual({ ok: false, reason: "unknown_target" });
    expect(use(t, "maya", "nobody")).toEqual({ ok: false, reason: "unknown_target" });
    expect(held(t, "maya")).toBe("freezeRay");
  });

  it("isTargetable: in play always; with a time, not while immune; for disabling Items, not while disabled", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    const jay = () => t.state.players.jay!;
    const now = () => t.clock.now();
    expect(isTargetable(jay(), { now: now(), disabling: true })).toBe(true);
    use(t, "maya");
    expect(jay().immuneUntil).toBe(now() + IMMUNITY_MS);
    expect(isTargetable(jay())).toBe(true);
    expect(isTargetable(jay(), { now: now() })).toBe(false);
    t.advance(IMMUNITY_MS + 50);
    expect(isTargetable(jay(), { now: now() })).toBe(true);
    expect(isTargetable(jay(), { now: now(), disabling: true })).toBe(false);
  });
});

describe("Freeze Ray", () => {
  it("stops a rolling ball dead and rejects shots for 6 s", () => {
    const t = game(["jay", "maya"], ["maya"]);
    t.shoot("jay", 0, 0.6);
    t.advance(300);
    expect(t.ball("jay").atRest).toBe(false);
    const frozenAt = t.clock.now();
    use(t, "maya");
    const spot = { x: t.ball("jay").x, y: t.ball("jay").y };
    t.advance(1000);
    expect(t.ball("jay")).toMatchObject({ ...spot, vx: 0, vy: 0, atRest: true });
    expect(t.shoot("jay", 0, 0.5)).toEqual({ ok: false, reason: "frozen" });
    const effect = t.state.players.jay!.effects[0]!;
    expect(effect).toMatchObject({ kind: "frozen", startedAt: frozenAt, endsAt: frozenAt + 6000 });

    t.advance(frozenAt + 6000 - t.clock.now() - 50);
    expect(t.shoot("jay", 0, 0.5)).toEqual({ ok: false, reason: "frozen" });
    t.drain();
    t.advance(100);
    expect(frozen(t, "jay")).toBe(false);
    expect(t.drain()).toContainEqual(expect.objectContaining({ type: "fx", payload: expect.objectContaining({ kind: "thaw", targetId: "jay" }) }));
    expect(t.shoot("jay", 0, 0.5)).toEqual({ ok: true });
    t.advance(300);
    expect(t.ball("jay").x).toBeGreaterThan(spot.x + 20);
  });

  it("is a block of ice: another ball bounces off and doesn't move it", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    use(t, "maya"); // Jay at (100, 300) is frozen
    const spot = { ...t.ball("jay") };
    // Ben at (100, 320) shoots straight up into Jay.
    t.shoot("ben", -Math.PI / 2, 0.5);
    t.advanceUntilRest("ben");
    expect(t.ball("jay")).toMatchObject({ x: spot.x, y: spot.y });
    expect(t.ball("ben").y).toBeGreaterThan(300);
  });

  it("mashing click breaks out 1 s sooner, and no more", () => {
    const t = game(["jay", "maya"], ["maya"]);
    const at = t.clock.now();
    use(t, "maya");
    for (let i = 0; i < 25; i++) expect(t.send("jay", { type: "mash" })).toEqual({ ok: true });
    expect(t.state.players.jay!.effects[0]!.endsAt).toBe(at + 5000);
    t.advance(4950);
    expect(frozen(t, "jay")).toBe(true);
    t.advance(100);
    expect(frozen(t, "jay")).toBe(false);
    expect(t.send("jay", { type: "mash" })).toEqual({ ok: false, reason: "no_effect" });
    // The Effect log has how long it really lasted (ticket 23's longest-frozen).
    expect(t.game.getEffectLog().find((e) => e.kind === "end")).toMatchObject({ effect: "frozen", targetId: "jay", sourceId: "maya", why: "expired" });
  });

  it("a Player under Freeze can't receive another disabling Effect, even after their immunity ends", () => {
    const t = game(["jay", "maya", "ben"], ["maya", "ben"]);
    use(t, "maya");
    t.advance(IMMUNITY_MS + 100);
    expect(use(t, "ben", "jay")).toEqual({ ok: false, reason: "untargetable" });
    expect(t.state.players.jay!.effects).toHaveLength(1);
    expect(held(t, "ben")).toBe("freezeRay");
  });

  it("a Player who has Holed Out can still use it", () => {
    const t = game(["jay", "maya", "ben"], ["maya"], { cupX: 500 });
    holeOut(t, "maya");
    expect(use(t, "maya")).toEqual({ ok: true });
    expect(frozen(t, "jay")).toBe(true);
  });
});

describe("immunity", () => {
  it("after an attack lands, the target can't be hit again for 3 s", () => {
    const t = game(["jay", "maya", "ben"], ["maya", "ben"], { items: { handlers: { golfGun: zapper } } });
    expect(use(t, "maya", "jay")).toEqual({ ok: true });
    t.advance(IMMUNITY_MS - 100);
    expect(use(t, "ben", "jay")).toEqual({ ok: false, reason: "untargetable" });
    t.advance(200);
    expect(use(t, "ben", "jay")).toEqual({ ok: true });
    expect(hitsLog(t).map((e) => [e.kind, e.playerId, e.targetId])).toEqual([
      ["hit", "maya", "jay"],
      ["hit", "ben", "jay"],
    ]);
  });
});

describe("Shield", () => {
  it("absorbs exactly one attack, then is gone; a blocked attack is no Item Hit, a landed one is", () => {
    // Jay leads, so his box gives a Shield; Maya and Ben get Freeze Rays.
    const t = game(["jay", "maya", "ben"], ["jay", "maya", "ben"]);
    expect(held(t, "jay")).toBe("shield");
    t.drain();
    expect(use(t, "jay")).toEqual({ ok: true });
    expect(kinds(t, "jay")).toEqual(["shielded"]);
    expect(feed(t.drain())).toContain("Jay raised a Shield");

    expect(use(t, "maya")).toEqual({ ok: true });
    expect(held(t, "maya")).toBeNull(); // used up even though it was blocked
    expect(kinds(t, "jay")).toEqual([]);
    // A blocked attack grants no immunity.
    expect(t.state.players.jay!.immuneUntil).toBe(0);
    const events = t.drain();
    expect(feed(events)).toEqual(["Jay's Shield ate a Freeze Ray"]);
    expect(events).toContainEqual({
      type: "fx",
      payload: { kind: "shieldPop", x: 100, y: 300, item: "freezeRay", targetId: "jay" },
      audience: { kind: "everyone" },
    });

    expect(use(t, "ben")).toEqual({ ok: true });
    expect(kinds(t, "jay")).toEqual(["frozen"]);
    expect(feed(t.drain())).toEqual(["Jay got frozen"]);
    expect(hitsLog(t).map((e) => [e.kind, e.playerId, e.targetId])).toEqual([
      ["blocked", "maya", "jay"],
      ["hit", "ben", "jay"],
    ]);
  });

  it("expires after 30 s", () => {
    const t = game(["jay", "maya"], ["jay"]);
    use(t, "jay");
    t.advance(30_000 - 50);
    expect(kinds(t, "jay")).toEqual(["shielded"]);
    t.advance(100);
    expect(kinds(t, "jay")).toEqual([]);
  });

  it("can't be raised after Holing Out; the Item is kept", () => {
    const t = game(["jay", "maya"], ["jay"], { cupX: 500 });
    holeOut(t, "jay");
    expect(use(t, "jay")).toEqual({ ok: false, reason: "holed_out" });
    expect(held(t, "jay")).toBe("shield");
  });
});

describe("Item Hits and the final results", () => {
  it("are server-only during play, revealed at the end, and break ties in the final results", () => {
    // Maya and Ben never shoot: both score 2 + 2 over the two Holes. Ben lands a Freeze on Maya.
    const t = game(["maya", "ben"], ["ben"], { settings: { holeTimerSec: 10 } });
    expect(use(t, "ben")).toEqual({ ok: true });
    expect(t.state.players.ben!.itemHits).toBe(0);
    t.advanceUntilPhase("holeEnd");
    expect(t.state.players.maya!.standing).toBe(1); // joined first; Item Hits don't count mid-game
    t.advanceUntilPhase("gameEnd");
    const total = (id: string) => t.state.players[id]!.strokes.reduce((a, b) => a + b, 0);
    expect(total("maya")).toBe(total("ben"));
    expect(t.state.players.ben!.itemHits).toBe(1);
    expect(t.state.players.maya!.itemHits).toBe(0);
    expect(t.state.players.ben!.standing).toBe(1);
    expect(t.state.players.maya!.standing).toBe(2);
  });
});

describe("Effects in public state", () => {
  it("show on the ball for everyone, never naming who caused them", () => {
    const t = game(["jay", "maya", "ben"], ["jay", "maya"]);
    use(t, "jay");
    t.send("maya", { type: "useItem", targetId: "ben" });
    expect(kinds(t, "jay")).toEqual(["shielded"]);
    expect(kinds(t, "ben")).toEqual(["frozen"]);
    expect(JSON.stringify(t.state)).not.toMatch(/source/i);
  });

  it("are cleared when the Hole ends", () => {
    const t = game(["jay", "maya"], ["maya"], { settings: { holeTimerSec: 4 } });
    use(t, "maya");
    t.advanceUntilPhase("holeEnd");
    expect(kinds(t, "jay")).toEqual([]);
    expect(t.state.players.jay!.immuneUntil).toBe(0);
  });

  it("Effect durations come from the Item data", () => {
    const catalogue = { ...ITEM_CATALOGUE, freezeRay: { ...ITEM_CATALOGUE.freezeRay, durationMs: 2000 } };
    const t = game(["jay", "maya"], ["maya"], { items: { catalogue } });
    const at = t.clock.now();
    use(t, "maya");
    expect(t.state.players.jay!.effects[0]!.endsAt).toBe(at + 2000);
  });
});

describe("Freeze and the Nuke", () => {
  it("a Frozen Player's held Item survives a Nuke", () => {
    // Jay leads and holds a Shield he doesn't use; Ben freezes him; Maya (the Admin) nukes.
    const t = new TestGame({ course: lane([0, 2]), items: { tuning: TUNING, handlers: REAL } });
    t.join("jay", "Jay");
    t.joinAsAdmin("maya", "Maya");
    t.join("ben", "Ben");
    t.startPlaying();
    t.advance(TUNING.rouletteMs + 50);
    expect(held(t, "jay")).toBe("shield");
    expect(use(t, "ben")).toEqual({ ok: true });
    expect(frozen(t, "jay")).toBe(true);
    expect(t.adminPower("maya", "nuke", { x: 300, y: 300 })).toEqual({ ok: true });
    t.advance(NUKE_SIREN_MS + 100);
    // An ice block doesn't fly.
    expect(t.ball("jay")).toMatchObject({ x: 100, y: 300 });
    t.advance(NUKE_BLAST_MS);
    expect(held(t, "jay")).toBe("shield");
    expect(frozen(t, "jay")).toBe(true);
  });
});

describe("Ink Splat", () => {
  const INK = { ...REAL, inkSplat: ITEM_HANDLERS.inkSplat! };
  const inkOnly = {
    tuning: TUNING,
    handlers: INK,
    // Attackers always draw Ink Splat.
    catalogue: { ...ITEM_CATALOGUE, freezeRay: { ...ITEM_CATALOGUE.freezeRay, weight: 0 } },
  };
  const inkGame = (players: string[], armed: string[]) => game(players, armed, { items: inkOnly });
  const inked = (t: TestGame, id: string) => kinds(t, id).includes("inked");

  it("sends the screen ink to the victim only, plus a public badge and kill feed line", () => {
    const t = inkGame(["jay", "maya", "ben"], ["maya"]);
    expect(held(t, "maya")).toBe("inkSplat");
    t.drain();
    expect(use(t, "maya")).toEqual({ ok: true });
    const events = t.drain();
    const ink = events.filter((e) => e.type === "fx" && (e.payload as { kind: string }).kind === "inkScreen");
    expect(ink).toHaveLength(1);
    expect(ink[0]!.audience).toEqual({ kind: "player", playerId: "jay" });
    expect(ink[0]!.payload).toMatchObject({ durationMs: 6000, coverage: 0.6 });
    expect(feed(events)).toContain("Jay got inked");
    expect(inked(t, "jay")).toBe(true);
    expect(t.state.players.jay!.effects[0]).toMatchObject({ kind: "inked", endsAt: t.clock.now() + 6000 });
    // It doesn't stop shooting, and it ends after 6 s.
    expect(t.shoot("jay", 0, 0.1)).toEqual({ ok: true });
    t.advance(6100);
    expect(inked(t, "jay")).toBe(false);
  });

  it("can't hit a Frozen Player, even after immunity", () => {
    // Middle Standing draws attack (Freeze Ray), last draws chaos (Ink Splat, moved to that column here).
    const mixed = {
      tuning: { ...TUNING, odds: { ...TUNING.odds, last: { self: 0, attack: 0, chaos: 100 } } },
      handlers: INK,
      catalogue: { ...ITEM_CATALOGUE, inkSplat: { ...ITEM_CATALOGUE.inkSplat, category: "chaos" as const } },
    };
    const t = game(["jay", "maya", "ann"], ["maya", "ann"], { items: mixed });
    expect(held(t, "maya")).toBe("freezeRay");
    expect(held(t, "ann")).toBe("inkSplat");
    use(t, "maya", "jay");
    t.advance(IMMUNITY_MS + 100);
    expect(use(t, "ann", "jay")).toEqual({ ok: false, reason: "untargetable" });
    expect(held(t, "ann")).toBe("inkSplat");
    expect(inked(t, "jay")).toBe(false);
  });

  it("a Shield eats it: no ink, no Item Hit", () => {
    // Jay (1st Standing) draws a Shield; Maya's attack draw is Ink Splat.
    const t = inkGame(["jay", "maya"], ["jay", "maya"]);
    expect(held(t, "jay")).toBe("shield");
    use(t, "jay");
    t.drain();
    use(t, "maya", "jay");
    const events = t.drain();
    expect(inked(t, "jay")).toBe(false);
    expect(events.some((e) => e.type === "fx" && (e.payload as { kind: string }).kind === "inkScreen")).toBe(false);
    expect(hitsLog(t).map((e) => e.kind)).toEqual(["blocked"]);
    expect(feed(events).join("|")).toContain("Shield ate");
  });

  it("counts as an Item Hit when it lands", () => {
    const t = inkGame(["jay", "maya"], ["maya"]);
    use(t, "maya");
    expect(hitsLog(t)).toMatchObject([{ kind: "hit", playerId: "maya", targetId: "jay", item: "inkSplat" }]);
  });
});
