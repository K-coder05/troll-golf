import {
  CHAOS_FACTORS,
  CHAOS_LEVELS,
  ITEM_CATALOGUE,
  ITEM_TUNING,
  scaleOdds,
  type ChaosLevelId,
  type CourseData,
  type HoleData,
  type ItemCategory,
  type ItemTuning,
  type Polygon,
  type Vec2,
} from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { RoomStateSchema } from "../../src/room/schema";
import { syncState } from "../../src/room/syncState";
import { ITEM_HANDLERS, type ItemHandlerRegistry } from "../../src/simulation";
import { TestGame } from "../harness";

/**
 * Chaos level: 0.6x / 1x / 1.5x on Item Box count, attack odds and Item
 * Effect durations (the Golf Gun window and the Banana Mine's lifetime
 * included, since they are Item durations). Admin Powers are never scaled.
 */

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const LEVELS = CHAOS_LEVELS;

/** A walled lane. Ben (slot 0) is 1st; Maya (slot 1, at 100,280) has the only box of the Tee when `maya`. */
function lane(boxes: Vec2[]): CourseData {
  const hole: HoleData = {
    id: "lane",
    name: "Lane",
    par: 3,
    width: 1200,
    height: 600,
    tee: { x: 100, y: 300 },
    cup: { x: 1000, y: 300, radius: 12 },
    walls: [rect(0, 0, 1200, T), rect(0, 600 - T, 1200, T), rect(0, 0, T, 600), rect(1200 - T, 0, T, 600)],
    surfaces: [],
    boostPads: [],
    teleporters: [],
    itemBoxes: boxes,
    windmills: [],
    slidingWalls: [],
  };
  return { id: "lane", name: "Lane", holes: [hole, { ...hole, id: "lane2" }] };
}

const ATTACK_ONLY: ItemTuning = {
  ...ITEM_TUNING,
  odds: {
    first: { self: 100, attack: 0, chaos: 0 },
    middle: { self: 0, attack: 100, chaos: 0 },
    last: { self: 0, attack: 100, chaos: 0 },
  },
  boxRadius: 2,
  boxRespawnMs: 1e9,
};

/** Ben and Maya in a lane with one box under Maya; she picks up the one Item in `handlers`. */
function withItem(level: ChaosLevelId, handlers: ItemHandlerRegistry): TestGame {
  const t = new TestGame({
    course: lane([{ x: 100, y: 280 }]),
    settings: { chaosLevel: level },
    items: { tuning: ATTACK_ONLY, handlers },
  });
  t.join("ben", "Ben");
  t.join("maya", "Maya");
  t.startPlaying();
  t.advance(ATTACK_ONLY.rouletteMs + 50);
  return t;
}

const sum = (row: { self: number; attack: number; chaos: number }) => row.self + row.attack + row.chaos;

describe("chaos level setting", () => {
  it("defaults to normal and only the room creator can change it, in the lobby", () => {
    const t = new TestGame();
    t.join("maya");
    t.join("ben");
    expect(t.state.settings.chaosLevel).toBe("normal");
    expect(t.send("ben", { type: "configure", chaosLevel: "unhinged" })).toEqual({ ok: false, reason: "not_creator" });
    expect(t.send("maya", { type: "configure", chaosLevel: "bogus" })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.state.settings.chaosLevel).toBe("normal");
    expect(t.send("maya", { type: "configure", chaosLevel: "unhinged" })).toEqual({ ok: true });
    expect(t.state.settings.chaosLevel).toBe("unhinged");
    t.startPlaying();
    expect(t.send("maya", { type: "configure", chaosLevel: "chill" }).ok).toBe(false);
    expect(t.state.settings.chaosLevel).toBe("unhinged");
  });

  it("is in the synced settings", () => {
    const t = new TestGame();
    t.join("maya");
    t.send("maya", { type: "configure", chaosLevel: "chill" });
    const synced = new RoomStateSchema();
    syncState(synced, t.state);
    expect(synced.settings.chaosLevel).toBe("chill");
  });

  it("can be set together with the Course", () => {
    const t = new TestGame({ courses: { other: { ...lane([]), id: "other" } } });
    t.join("maya");
    expect(t.send("maya", { type: "configure", courseId: "other", chaosLevel: "chill" })).toEqual({ ok: true });
    expect(t.state.courseId).toBe("other");
    expect(t.state.settings.chaosLevel).toBe("chill");
    // A bad level changes nothing, not even the Course.
    expect(t.send("maya", { type: "configure", courseId: "lane", chaosLevel: "x" }).ok).toBe(false);
    expect(t.state.courseId).toBe("other");
  });
});

describe("Item Effect durations", () => {
  it("a Freeze lasts 3.6 s at Chill, 6 s at Normal and 9 s at Unhinged", () => {
    const expected: Record<ChaosLevelId, number> = { chill: 3600, normal: 6000, unhinged: 9000 };
    for (const level of LEVELS) {
      const t = withItem(level, { freezeRay: ITEM_HANDLERS.freezeRay! });
      expect(t.game.getHeldItem("maya")).toBe("freezeRay");
      const at = t.clock.now();
      expect(t.send("maya", { type: "useItem" })).toEqual({ ok: true });
      expect(t.state.players.ben!.effects[0]).toMatchObject({ kind: "frozen", startedAt: at, endsAt: at + expected[level] });
      t.advance(expected[level] - 100);
      expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: false, reason: "frozen" });
      t.advance(200);
      expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
    }
  });

  it("the Shield scales too", () => {
    const t = withItem("unhinged", { shield: ITEM_HANDLERS.shield! });
    t.drain();
    // Ben is 1st (self row) but has no box; Maya draws from the attack row, falling back to the only Item there is.
    expect(t.game.getHeldItem("maya")).toBe("shield");
    const at = t.clock.now();
    t.send("maya", { type: "useItem" });
    expect(t.state.players.maya!.effects[0]).toMatchObject({ kind: "shielded", endsAt: at + 45_000 });
  });

  it("the Golf Gun window scales with the level (shots do not)", () => {
    const expected: Record<ChaosLevelId, number> = { chill: 6000, normal: 10_000, unhinged: 15_000 };
    for (const level of LEVELS) {
      const t = withItem(level, { golfGun: ITEM_HANDLERS.golfGun! });
      t.drain();
      const at = t.clock.now();
      expect(t.send("maya", { type: "useItem" })).toEqual({ ok: true });
      const msg = t
        .drain()
        .filter((e) => e.type === "item" && e.audience.kind === "player")
        .map((e) => e.payload as { active?: { shotsLeft: number; endsAt: number } })
        .at(-1)!;
      expect(msg.active).toEqual({ shotsLeft: ITEM_CATALOGUE.golfGun.params.shots, endsAt: at + expected[level] });
    }
  });

  it("the Banana Mine's lifetime scales with the level", () => {
    const expected: Record<ChaosLevelId, number> = { chill: 27_000, normal: 45_000, unhinged: 67_500 };
    for (const level of LEVELS) {
      const t = withItem(level, { bananaMine: ITEM_HANDLERS.bananaMine! });
      expect(t.send("maya", { type: "useItem" })).toEqual({ ok: true });
      expect(t.state.traps[0]!.expiresAt).toBe(t.clock.now() + expected[level]);
    }
  });
});

describe("Admin Powers are not scaled", () => {
  it("Invert Controls lasts the same at every level (default 20 s, or the one given)", () => {
    for (const level of LEVELS) {
      const t = new TestGame({ course: lane([]), settings: { chaosLevel: level } });
      t.joinAsAdmin("maya", "Maya");
      t.join("ben", "Ben");
      t.startPlaying();
      const at = t.clock.now();
      expect(t.adminPower("maya", "invertControls", { targetId: "ben" }, "loud")).toEqual({ ok: true });
      expect(t.state.players.ben!.effects[0]).toMatchObject({ kind: "invertControls", endsAt: at + 20_000 });
      expect(t.adminPower("maya", "invertControls", { targetId: "maya", durationSec: 10 }, "loud")).toEqual({ ok: true });
      expect(t.state.players.maya!.effects[0]).toMatchObject({ kind: "invertControls", endsAt: at + 10_000 });
    }
  });
});

describe("attack odds", () => {
  it("scale the attack column and every row still adds up to 100", () => {
    for (const level of LEVELS) {
      const scaled = scaleOdds(ITEM_TUNING.odds, level);
      for (const row of ["first", "middle", "last"] as const) {
        expect(sum(scaled[row])).toBeCloseTo(100, 9);
        const f = CHAOS_FACTORS[level].attack;
        expect(scaled[row].attack).toBeCloseTo(Math.min(100, ITEM_TUNING.odds[row].attack * f), 9);
        for (const c of ["self", "attack", "chaos"] as ItemCategory[]) expect(scaled[row][c]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(scaleOdds(ITEM_TUNING.odds, "normal")).toEqual(ITEM_TUNING.odds);
  });

  it("the other two columns keep their proportions", () => {
    const o = scaleOdds(ITEM_TUNING.odds, "unhinged").middle;
    expect(o.attack).toBeCloseTo(82.5, 9);
    expect(o.self / o.chaos).toBeCloseTo(40 / 5, 9);
    const chill = scaleOdds(ITEM_TUNING.odds, "chill").first;
    expect(chill.attack).toBeCloseTo(16.8, 9);
    expect(chill.self).toBeGreaterThan(ITEM_TUNING.odds.first.self);
  });

  it("an attack share above 100 is capped and the rest drops to 0", () => {
    const odds = { first: { self: 0, attack: 100, chaos: 0 }, middle: { self: 10, attack: 80, chaos: 10 }, last: { self: 10, attack: 90, chaos: 0 } };
    const u = scaleOdds(odds, "unhinged");
    expect(u.first).toEqual({ self: 0, attack: 100, chaos: 0 });
    expect(u.last).toEqual({ self: 0, attack: 100, chaos: 0 });
    for (const row of [u.first, u.middle, u.last]) expect(sum(row)).toBeCloseTo(100, 9);
  });

  it("the draws follow the level: more attack Items when Unhinged, fewer when Chill", () => {
    const attackShare = (level: ChaosLevelId): number => {
      let attacks = 0;
      const n = 400;
      for (let seed = 1; seed <= n; seed++) {
        // Last Standing (Maya), 20 draws' worth is too slow: one fresh game per seed with default odds.
        const t = new TestGame({
          course: lane([{ x: 100, y: 280 }]),
          settings: { chaosLevel: level },
          seed,
          items: { tuning: { ...ITEM_TUNING, boxRadius: 2 }, handlers: { freezeRay: ITEM_HANDLERS.freezeRay!, shield: ITEM_HANDLERS.shield! } },
        });
        t.join("ben");
        t.join("maya");
        t.startPlaying();
        t.advance(ITEM_TUNING.rouletteMs + 50);
        if (t.game.getHeldItem("maya") === "freezeRay") attacks++;
      }
      return attacks / n;
    };
    const chill = attackShare("chill");
    const normal = attackShare("normal");
    const unhinged = attackShare("unhinged");
    expect(chill).toBeLessThan(normal);
    expect(normal).toBeLessThan(unhinged);
  });
});

describe("Item Box count", () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ x: 100 + i * 100, y: 100 }));
  const boxesAt = (level: ChaosLevelId, boxCountScale = 1) => {
    const t = new TestGame({
      course: lane(points),
      settings: { chaosLevel: level },
      items: { tuning: { ...ITEM_TUNING, boxCountScale } },
    });
    t.join("maya");
    t.startPlaying();
    return t.state.itemBoxes.length;
  };

  it("Chill has fewer boxes than Normal", () => {
    expect(boxesAt("chill")).toBe(6);
    expect(boxesAt("normal")).toBe(10);
  });

  it("Unhinged scales the base fraction up, capped at every spawn point", () => {
    expect(boxesAt("unhinged")).toBe(10);
    expect(boxesAt("chill", 0.5)).toBe(3);
    expect(boxesAt("normal", 0.5)).toBe(5);
    expect(boxesAt("unhinged", 0.5)).toBe(8);
  });

  it("changing the level in the lobby redoes the boxes", () => {
    const t = new TestGame({ course: lane(points) });
    t.join("maya");
    expect(t.state.itemBoxes).toHaveLength(10);
    t.send("maya", { type: "configure", chaosLevel: "chill" });
    expect(t.state.itemBoxes).toHaveLength(6);
  });
});
