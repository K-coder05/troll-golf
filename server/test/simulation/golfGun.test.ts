import { IMMUNITY_MS, ITEM_CATALOGUE, ITEM_TUNING, type CourseData, type HoleData, type ItemTuning, type Polygon, type Vec2 } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { ITEM_HANDLERS, type GameEvent } from "../../src/simulation";
import { TestGame } from "../harness";

/**
 * Golf Gun. Setup: the walled lane of effects.test.ts with a lake south of
 * the Tee. Players sit on the Tee slots in join order: (100,300), (100,280),
 * (100,320). The Player listed as `gunner` gets the gun from a box; the 1st
 * Standing draws a Shield instead (self column), everybody else an attack Item.
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
];

function lane(boxSlots: number[], cupX: number, lake: boolean): CourseData {
  const hole: HoleData = {
    id: "lane",
    name: "Lane",
    par: 3,
    width: 1200,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: cupX, y: 300, radius: 12 },
    walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600)],
    surfaces: lake ? [{ kind: "water", polygon: rect(40, 420, 200, 150) }] : [],
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
  odds: {
    first: { self: 100, attack: 0, chaos: 0 },
    middle: { self: 0, attack: 100, chaos: 0 },
    last: { self: 0, attack: 100, chaos: 0 },
  },
  boxRadius: 2,
  boxRespawnMs: 1e9,
};
const HANDLERS = { golfGun: ITEM_HANDLERS.golfGun!, shield: ITEM_HANDLERS.shield! };

function game(players: string[], armed: string[], opts: { cupX?: number; lake?: boolean } = {}): TestGame {
  const t = new TestGame({
    course: lane(armed.map((id) => players.indexOf(id)), opts.cupX ?? 1000, opts.lake ?? false),
    items: { tuning: TUNING, handlers: HANDLERS },
  });
  for (const id of players) t.join(id, id[0]!.toUpperCase() + id.slice(1));
  t.startPlaying();
  t.advance(TUNING.rouletteMs + 50);
  return t;
}

const arm = (t: TestGame, id: string) => t.send(id, { type: "useItem" });
const shootAt = (t: TestGame, id: string, at: string, jitter = 0) => {
  const b = t.state.players[at]!.ball;
  return t.send(id, { type: "useItem", point: { x: b.x + jitter, y: b.y } });
};
const feed = (events: GameEvent[]) => events.filter((e) => e.type === "feed").map((e) => (e.payload as { text: string }).text);
const slotMessages = (events: GameEvent[], id: string) =>
  events.filter((e) => e.type === "item" && e.audience.kind === "player" && e.audience.playerId === id).map((e) => e.payload as { item: string | null; active?: { shotsLeft: number; endsAt: number } });
const hits = (t: TestGame) => t.game.getItemLog().filter((e) => e.kind === "hit" && e.item === "golfGun");

describe("Golf Gun", () => {
  it("the first use arms it: 3 shots, 10 s, and the Item stays held", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    expect(t.game.getHeldItem("maya")).toBe("golfGun");
    t.drain();
    expect(arm(t, "maya")).toEqual({ ok: true });
    expect(t.game.getHeldItem("maya")).toBe("golfGun");
    const msg = slotMessages(t.drain(), "maya").at(-1)!;
    expect(msg.active).toEqual({ shotsLeft: ITEM_CATALOGUE.golfGun.params.shots, endsAt: t.clock.now() + 10_000 });
    // Armed with no aim at all is refused and keeps the shot.
    expect(arm(t, "maya")).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("a landed shot pushes the target straight away from the shooter's ball", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    // Move Ben to the right so the line from Maya (100,280) is diagonal.
    t.shoot("ben", 0, 0.1);
    t.advanceUntilRest("ben");
    const ben = t.ball("ben");
    expect(ben.x).toBeGreaterThan(130);
    arm(t, "maya");
    expect(shootAt(t, "maya", "ben", 5)).toEqual({ ok: true });
    const after = t.ball("ben");
    const speed = Math.hypot(after.vx, after.vy);
    expect(speed).toBeGreaterThan(300);
    const dx = ben.x - 100;
    const dy = ben.y - 280;
    const len = Math.hypot(dx, dy);
    expect(after.vx / speed).toBeCloseTo(dx / len, 2);
    expect(after.vy / speed).toBeCloseTo(dy / len, 2);
    expect(hits(t)).toHaveLength(1);
  });

  it("a Holed-Out shooter fires from the Cup", () => {
    const t = game(["jay", "maya", "ben"], ["maya"], { cupX: 500 });
    const b = t.ball("maya");
    t.shoot("maya", Math.atan2(300 - b.y, 500 - b.x), 0.45);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.holedOut).toBe(true);
    arm(t, "maya");
    shootAt(t, "maya", "ben");
    const after = t.ball("ben");
    // From (500,300) to Ben at (100,320): west, a little south.
    expect(after.vx).toBeLessThan(-300);
    expect(after.vy).toBeGreaterThan(0);
    expect(Math.abs(after.vy)).toBeLessThan(Math.abs(after.vx) / 5);
  });

  it("after 3 shots (misses count) the Item is used up", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    arm(t, "maya");
    t.send("maya", { type: "useItem", point: { x: 600, y: 100 } }); // a miss
    expect(t.game.getHeldItem("maya")).toBe("golfGun");
    expect(hits(t)).toHaveLength(0);
    shootAt(t, "maya", "ben");
    expect(t.game.getHeldItem("maya")).toBe("golfGun");
    t.drain();
    t.advance(IMMUNITY_MS + 100);
    shootAt(t, "maya", "jay");
    expect(t.game.getHeldItem("maya")).toBeNull();
    expect(slotMessages(t.drain(), "maya").at(-1)).toEqual({ item: null, roulette: false, readyAt: 0 });
    expect(hits(t)).toHaveLength(2);
    expect(arm(t, "maya")).toEqual({ ok: false, reason: "no_item" });
  });

  it("after 10 s the Item is used up and crosshair mode ends", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    arm(t, "maya");
    t.advance(9_800);
    expect(t.game.getHeldItem("maya")).toBe("golfGun");
    t.drain();
    t.advance(400);
    expect(t.game.getHeldItem("maya")).toBeNull();
    expect(slotMessages(t.drain(), "maya").at(-1)).toMatchObject({ item: null });
    expect(shootAt(t, "maya", "ben")).toEqual({ ok: false, reason: "no_item" });
  });

  it("a Shield absorbs one shot and the following shots land", () => {
    const t = game(["jay", "maya", "ben"], ["jay", "maya"]);
    expect(t.game.getHeldItem("jay")).toBe("shield");
    t.send("jay", { type: "useItem" });
    arm(t, "maya");
    t.drain();
    shootAt(t, "maya", "jay");
    expect(hits(t)).toHaveLength(0);
    expect(t.state.players.jay!.effects).toHaveLength(0);
    expect(t.state.players.jay!.immuneUntil).toBeLessThan(t.clock.now());
    expect(feed(t.drain())).toContain("Jay's Shield ate a Golf Gun");
    expect(Math.hypot(t.ball("jay").vx, t.ball("jay").vy)).toBe(0);
    // The next shot at Jay lands.
    shootAt(t, "maya", "jay");
    expect(hits(t)).toHaveLength(1);
    expect(Math.hypot(t.ball("jay").vx, t.ball("jay").vy)).toBeGreaterThan(300);
  });

  it("immunity applies between shots: a second shot within 3 s doesn't land, a later one does", () => {
    const t = game(["jay", "maya", "ben"], ["maya"]);
    arm(t, "maya");
    shootAt(t, "maya", "ben");
    const v1 = t.ball("ben").vy;
    t.advance(1000);
    const before = { ...t.ball("ben") };
    shootAt(t, "maya", "ben");
    expect(hits(t)).toHaveLength(1);
    // Nothing added to Ben's velocity by the immune shot (only friction since).
    expect(Math.hypot(t.ball("ben").vx, t.ball("ben").vy)).toBeLessThanOrEqual(Math.hypot(before.vx, before.vy) + 1e-6);
    expect(v1).toBeGreaterThan(0);
    // The shot was still spent: one left.
    t.advance(IMMUNITY_MS);
    shootAt(t, "maya", "ben");
    expect(hits(t)).toHaveLength(2);
    expect(t.game.getHeldItem("maya")).toBeNull();
  });

  it("knocking a target into the lake: +1 Stroke, Rest Spot return, 'sniped into the lake' line", () => {
    const t = game(["jay", "maya", "ben"], ["maya"], { lake: true });
    const spot = { ...t.ball("ben") };
    arm(t, "maya");
    t.drain();
    shootAt(t, "maya", "ben");
    const lines: string[] = [...feed(t.drain())];
    for (let i = 0; i < 300 && !lines.some((l) => l.includes("into the lake")); i++) {
      t.advance(50);
      lines.push(...feed(t.drain()));
    }
    expect(lines).toContain("Maya shot Ben");
    expect(lines).toContain("Maya sniped Ben into the lake (+1)");
    expect(t.state.players.ben!.strokes[0]).toBe(1);
    expect(t.ball("ben")).toMatchObject({ x: spot.x, y: spot.y, atRest: true });
  });

  it("a ball that sinks long after the shot is not credited to the sniper", () => {
    const t = game(["jay", "maya", "ben"], ["maya"], { lake: true });
    arm(t, "maya");
    t.send("maya", { type: "useItem", point: { x: 700, y: 100 } });
    t.shoot("ben", Math.PI / 2, 0.5);
    t.drain();
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      t.advance(50);
      lines.push(...feed(t.drain()));
    }
    expect(lines).toContain("Ben landed in the water (+1)");
  });
});
