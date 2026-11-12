import { ITEM_CATALOGUE, ITEM_TUNING, XRAY_AIM_STALE_MS, XRAY_INTERVAL_MS, type CourseData, type HoleData, type Polygon, type XrayMessage } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../src/simulation";
import { TestGame } from "../harness";

/**
 * Give Item, Rig the Box, God Mode and the x-ray (ticket 20).
 *
 * A walled lane; Maya is the Admin (Tee slot 0), Ben and Jay line up behind.
 * Item Boxes sit at (250, 280) and (250, 320), on Ben's and Jay's shot lines.
 */
const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
function lane(): CourseData {
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
    itemBoxes: [{ x: 250, y: 280 }, { x: 250, y: 320 }],
    windmills: [],
    slidingWalls: [],
  };
  return { id: "lane", name: "Lane", holes: [hole, { ...hole, id: "lane2", name: "Lane 2" }] };
}

function game(seed = 1): TestGame {
  const t = new TestGame({ course: lane(), seed });
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.join("jay", "Jay");
  t.startPlaying();
  t.drain();
  return t;
}

const held = (t: TestGame, id: string) => t.game.getHeldItem(id);
const give = (t: TestGame, targetId: string, item: keyof typeof ITEM_CATALOGUE, mode: "stealth" | "loud" = "stealth") =>
  t.adminPower("maya", "giveItem", { targetId, item }, mode);
const visible = (t: TestGame) => TestGame.nonAdmin(t.drain()).filter((e) => e.type !== "xray");

describe("Give Item", () => {
  it("fills the slot, replacing a held Item, for any Player including the Admin", () => {
    const t = game();
    expect(give(t, "ben", "freezeRay")).toEqual({ ok: true });
    expect(held(t, "ben")).toBe("freezeRay");
    expect(give(t, "ben", "shield")).toEqual({ ok: true });
    expect(held(t, "ben")).toBe("shield");
    expect(give(t, "maya", "swap")).toEqual({ ok: true });
    expect(held(t, "maya")).toBe("swap");
    expect(t.adminPower("maya", "giveItem", { targetId: "nobody", item: "swap" })).toEqual({ ok: false, reason: "unknown_target" });
    expect(t.adminPower("maya", "giveItem", { targetId: "ben", item: "nope" as never })).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("tells the recipient alone, and the item is usable at once (no roulette)", () => {
    const t = game();
    t.drain();
    give(t, "ben", "shield");
    const events = TestGame.nonAdmin(t.drain());
    expect(events).toEqual([
      { type: "item", payload: { item: "shield", roulette: false, readyAt: expect.any(Number) }, audience: { kind: "player", playerId: "ben" } },
    ]);
    expect(t.send("ben", { type: "useItem" })).toEqual({ ok: true });
    expect(t.state.players.ben!.effects.map((e) => e.kind)).toEqual(["shielded"]);
  });

  it("is not in synced state, and the other Players see nothing", () => {
    const t = game();
    const before = JSON.stringify(t.state);
    give(t, "ben", "freezeRay");
    expect(JSON.stringify(t.state)).toBe(before);
    expect(TestGame.seenBy(t.drain(), "jay")).toEqual([]);
  });

  it("works on a Shielded, immune and Frozen Player (Admin Powers ignore all limits)", () => {
    const t = game();
    give(t, "jay", "freezeRay");
    give(t, "ben", "shield");
    t.send("ben", { type: "useItem" }); // Ben is Shielded
    // Jay's Freeze Ray is eaten by the Shield; give Ben a Freeze Ray target situation too:
    give(t, "ben", "mulligan");
    expect(held(t, "ben")).toBe("mulligan");
    // Freeze Jay with Maya's own Freeze Ray (Maya leads, so she is not a target; Jay is Frozen by Ben's hit).
    give(t, "ben", "freezeRay");
    expect(t.send("ben", { type: "useItem", targetId: "jay" })).toEqual({ ok: true });
    expect(t.state.players.jay!.effects.map((e) => e.kind)).toContain("frozen");
    expect(t.state.players.jay!.immuneUntil).toBeGreaterThan(t.clock.now());
    // Jay is Frozen and immune: Give Item and Rig the Box still take effect.
    expect(give(t, "jay", "swap")).toEqual({ ok: true });
    expect(held(t, "jay")).toBe("swap");
    expect(t.adminPower("maya", "rigBox", { targetId: "jay", item: "inkSplat" })).toEqual({ ok: true });
  });

  it("Loud adds the banner and a feed line that doesn't say which Item", () => {
    const t = game();
    give(t, "ben", "freezeRay", "loud");
    const events = TestGame.nonAdmin(t.drain());
    expect(events.map((e) => e.type).sort()).toEqual(["banner", "feed", "item"]);
    expect(JSON.stringify(events.filter((e) => e.type !== "item"))).not.toMatch(/freeze/i);
  });

  it("only the Admin can use it", () => {
    const t = game();
    expect(t.adminPower("ben", "giveItem", { targetId: "ben", item: "swap" })).toEqual({ ok: false, reason: "not_admin" });
    expect(held(t, "ben")).toBeNull();
  });
});

/** Ben shoots through his box and waits out the roulette. */
function benPicksUp(t: TestGame): void {
  t.shoot("ben", 0, 0.25);
  t.advanceUntilRest("ben");
  t.advance(ITEM_TUNING.rouletteMs);
}

describe("Rig the Box", () => {
  it("makes the next pickup give exactly the chosen Item, then clears", () => {
    const t = game();
    expect(t.adminPower("maya", "rigBox", { targetId: "ben", item: "inkSplat" })).toEqual({ ok: true });
    benPicksUp(t);
    expect(held(t, "ben")).toBe("inkSplat");
    const picks = t.game.getItemLog().filter((l) => l.kind === "pickup");
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ playerId: "ben", item: "inkSplat", rigged: true });
    // Used up; the box respawns and the next pickup is a normal draw.
    t.advance(ITEM_TUNING.boxRespawnMs);
    t.send("ben", { type: "useItem" });
    expect(held(t, "ben")).toBeNull();
    t.shoot("ben", Math.PI, 0.25);
    t.advanceUntilRest("ben");
    t.shoot("ben", 0, 0.25);
    t.advanceUntilRest("ben");
    const later = t.game.getItemLog().filter((l) => l.kind === "pickup");
    expect(later.length).toBeGreaterThan(1);
    expect(later.at(-1)).toMatchObject({ rigged: false });
  });

  it("a rigged pickup is indistinguishable: same events, same Rng stream", () => {
    const run = (rig: boolean) => {
      const t = game(5);
      if (rig) t.adminPower("maya", "rigBox", { targetId: "ben", item: "bananaMine" });
      t.drain();
      t.shoot("ben", 0, 0.25);
      t.advanceUntilRest("ben");
      const events = TestGame.nonAdmin(t.drain()).filter((e) => e.type !== "xray");
      // Jay's natural pickup comes after Ben's: it must not shift.
      t.shoot("jay", 0, 0.25);
      t.advanceUntilRest("jay");
      return { events, jay: held(t, "jay"), roulette: events.filter((e) => e.type === "item").map((e) => (e.payload as { roulette: boolean }).roulette) };
    };
    const rigged = run(true);
    const plain = run(false);
    expect(rigged.jay).toBe(plain.jay);
    expect(rigged.roulette).toEqual([true]);
    // Everything but the held item inside Ben's private message is the same.
    const strip = (events: GameEvent[]) => events.map((e) => (e.type === "item" ? { ...e, payload: { ...e.payload, item: "?" } } : e));
    expect(strip(rigged.events)).toEqual(strip(plain.events));
  });

  it("is not in synced state", () => {
    const t = game();
    const before = JSON.stringify(t.state);
    t.adminPower("maya", "rigBox", { targetId: "ben", item: "inkSplat" });
    expect(JSON.stringify(t.state)).toBe(before);
    expect(visible(t)).toEqual([]);
  });
});

describe("God Mode", () => {
  /** Jay freezes Maya (the Admin, 1st in line). Returns what non-Admins observed. */
  function freezeMaya(t: TestGame) {
    give(t, "jay", "freezeRay");
    t.drain();
    expect(t.send("jay", { type: "useItem", targetId: "maya" })).toEqual({ ok: true });
    return TestGame.nonAdmin(t.drain()).filter((e) => e.type !== "xray");
  }

  it("blocks attacks on the Admin: no Effect, no immunity, no Item Hit", () => {
    const t = game();
    t.adminPower("maya", "godMode", { enabled: true });
    freezeMaya(t);
    expect(t.state.players.maya!.effects).toEqual([]);
    expect(t.state.players.maya!.immuneUntil).toBe(0);
    expect(t.game.getItemLog().some((l) => l.kind === "hit")).toBe(false);
    expect(t.game.getItemLog().filter((l) => l.kind === "blocked")).toHaveLength(1);
    expect(held(t, "jay")).toBeNull(); // the Item is used up, like a Shield-eaten one
  });

  it("looks in Stealth exactly like a Shield pop", () => {
    const natural = game();
    natural.adminPower("maya", "giveItem", { targetId: "maya", item: "shield" });
    natural.send("maya", { type: "useItem" });
    const shieldPop = freezeMaya(natural);

    const god = game();
    god.adminPower("maya", "godMode", { enabled: true }, "stealth");
    const godBlock = freezeMaya(god);

    expect(godBlock).toEqual(shieldPop.filter((e) => e.type !== "fx" || e.payload.kind !== "thaw"));
    expect(godBlock.some((e) => e.type === "fx" && e.payload.kind === "shieldPop")).toBe(true);
    expect(godBlock.some((e) => e.type === "feed" && /Shield ate a Freeze Ray/.test(e.payload.text))).toBe(true);
  });

  it("is a divine block in Loud, with the Golf Gods banner and no mention of an Admin", () => {
    const t = game();
    t.adminPower("maya", "godMode", { enabled: true }, "loud");
    t.drain();
    give(t, "jay", "freezeRay");
    t.drain();
    t.send("jay", { type: "useItem", targetId: "maya" });
    const events = TestGame.nonAdmin(t.drain());
    expect(events.some((e) => e.type === "fx" && e.payload.kind === "divineBlock")).toBe(true);
    expect(events.some((e) => e.type === "fx" && e.payload.kind === "shieldPop")).toBe(false);
    expect(events.filter((e) => e.type === "banner")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toMatch(/admin/i);
  });

  it("keeps a real Shield and works when toggled off again", () => {
    const t = game();
    t.adminPower("maya", "godMode", { enabled: true });
    t.adminPower("maya", "godMode", { enabled: false });
    freezeMaya(t);
    expect(t.state.players.maya!.effects.map((e) => e.kind)).toEqual(["frozen"]);
  });

  it("other Players are still hit normally", () => {
    const t = game();
    t.adminPower("maya", "godMode", { enabled: true });
    give(t, "maya", "freezeRay");
    expect(t.send("maya", { type: "useItem", targetId: "ben" })).toEqual({ ok: true });
    expect(t.state.players.ben!.effects.map((e) => e.kind)).toEqual(["frozen"]);
  });
});

describe("x-ray", () => {
  const xrays = (t: TestGame) => t.drain().filter((e) => e.type === "xray");

  it("goes to the Admin's audience only, with every Player's Item, Effects and aim", () => {
    const t = game();
    give(t, "ben", "freezeRay");
    give(t, "jay", "shield");
    t.send("jay", { type: "useItem" });
    t.send("ben", { type: "aim", angle: 1.5, power: 0.6 });
    t.advance(XRAY_INTERVAL_MS + 50);
    const events = t.drain();
    const x = events.filter((e) => e.type === "xray");
    expect(x.length).toBeGreaterThan(0);
    expect(x.every((e) => e.audience.kind === "admin")).toBe(true);
    expect(events.filter((e) => e.type === "xray" && e.audience.kind !== "admin")).toEqual([]);
    const payload = x.at(-1)!.payload as XrayMessage;
    const by = Object.fromEntries(payload.players.map((p) => [p.id, p]));
    expect(by.ben).toMatchObject({ item: "freezeRay", aim: { angle: 1.5, power: 0.6 }, effects: [] });
    expect(by.jay!.item).toBeNull();
    expect(by.jay!.effects).toEqual([expect.objectContaining({ kind: "shielded", sourceId: "jay", visible: true })]);
    expect(by.maya).toMatchObject({ item: null, aim: null });
    // And nobody else's connection ever gets any of it.
    expect(TestGame.nonAdmin(events).some((e) => e.type === "xray")).toBe(false);
  });

  it("aim lines clear when released, after a shot, and when stale", () => {
    const t = game();
    const aimOf = (id: string) => {
      t.advance(XRAY_INTERVAL_MS + 50);
      const last = xrays(t).at(-1)!.payload as XrayMessage;
      return last.players.find((p) => p.id === id)!.aim;
    };
    t.send("ben", { type: "aim", angle: 0.5, power: 0.5 });
    expect(aimOf("ben")).not.toBeNull();
    t.send("ben", { type: "aim", angle: 0, power: 0, active: false });
    expect(aimOf("ben")).toBeNull();
    t.send("jay", { type: "aim", angle: 0.5, power: 0.5 });
    t.shoot("jay", 0, 0.1);
    expect(aimOf("jay")).toBeNull();
    t.send("ben", { type: "aim", angle: 0.5, power: 0.5 });
    t.advance(XRAY_AIM_STALE_MS + 100);
    expect(aimOf("ben")).toBeNull();
  });

  it("rejects malformed aims and sends nothing when there is no Admin", () => {
    const t = game();
    expect(t.send("ben", { type: "aim", angle: "x", power: 1 })).toEqual({ ok: false, reason: "invalid_payload" });
    const none = new TestGame({ course: lane() });
    none.join("ben", "Ben");
    none.join("jay", "Jay");
    none.startPlaying();
    none.advance(1000);
    expect(none.drain().some((e) => e.type === "xray")).toBe(false);
  });
});
