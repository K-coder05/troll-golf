import { EMOTE_KINDS, type CourseData, type HoleData, type Polygon } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { EMOTE_GAP_MS } from "../../src/simulation";
import { TestGame } from "../harness";

const T = 16;
const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const hole: HoleData = {
  id: "box",
  name: "Box",
  par: 3,
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
const course: CourseData = { id: "box", name: "Box", holes: [hole] };

function playing(...players: string[]): TestGame {
  const t = new TestGame({ course });
  for (const id of players) t.join(id);
  t.startPlaying();
  t.drain();
  return t;
}

const fx = (t: TestGame, kind: string) =>
  t.drain().filter((e) => e.type === "fx" && e.payload.kind === kind);

describe("emotes", () => {
  it("an emote reaches everyone as an event naming the sender", () => {
    const t = playing("maya", "ben");
    expect(t.send("maya", { type: "emote", kind: "gg" })).toEqual({ ok: true });
    const events = t.drain().filter((e) => e.type === "emote");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ payload: { playerId: "maya", kind: "gg" }, audience: { kind: "everyone" } });
  });

  it("a second emote within a second is rejected, one after a second is fine", () => {
    const t = playing("maya", "ben");
    expect(t.send("maya", { type: "emote", kind: "laugh" }).ok).toBe(true);
    t.clock.advance(EMOTE_GAP_MS - 100);
    expect(t.send("maya", { type: "emote", kind: "salty" })).toEqual({ ok: false, reason: "rate_limited" });
    // The limit is per Player.
    expect(t.send("ben", { type: "emote", kind: "salty" }).ok).toBe(true);
    t.drain();
    t.clock.advance(100);
    expect(t.send("maya", { type: "emote", kind: "what" }).ok).toBe(true);
    expect(t.drain().filter((e) => e.type === "emote")).toHaveLength(1);
  });

  it("rejects unknown kinds and strangers, without using up the allowance", () => {
    const t = playing("maya");
    for (const kind of ["rofl", 3, undefined, null, { kind: "gg" }]) {
      expect(t.send("maya", { type: "emote", kind })).toEqual({ ok: false, reason: "invalid_payload" });
    }
    expect(t.send("nobody", { type: "emote", kind: "gg" })).toEqual({ ok: false, reason: "unknown_player" });
    expect(t.send("maya", { type: "emote", kind: EMOTE_KINDS[0] }).ok).toBe(true);
  });
});

describe("juice fx", () => {
  it("a shot sends a putt fx at the ball with its power", () => {
    const t = playing("maya");
    t.shoot("maya", 0, 0.5);
    const [putt] = fx(t, "putt");
    expect(putt).toMatchObject({ payload: { x: 100, y: 300, intensity: 0.5 }, audience: { kind: "everyone" } });
  });

  it("a ball hitting a wall sends a throttled wallHit fx; a creeping touch stays silent", () => {
    const t = playing("maya");
    t.shoot("maya", -Math.PI / 2, 0.7);
    t.advance(1500);
    const hits = fx(t, "wallHit");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const first = hits[0]!.type === "fx" ? hits[0]!.payload : null;
    expect(first!.intensity).toBeGreaterThan(0.1);
    expect(first!.intensity).toBeLessThanOrEqual(1);

    const slow = playing("maya");
    slow.shoot("maya", Math.PI, 0.05); // rolls ~30 px towards the left wall 84 px away and stops
    slow.advance(4000);
    expect(fx(slow, "wallHit")).toHaveLength(0);
  });

  it("a ball skimming past the Cup without dropping sends one nearMiss at the Cup", () => {
    const t = playing("maya");
    // Passes about 25 px above the Cup's centre: outside its 12 px radius, inside the near-miss zone.
    t.shoot("maya", Math.atan2(-25, 400), 0.6);
    t.advance(3000);
    const events = t.drain().filter((e) => e.type === "fx");
    const kinds = events.map((e) => (e.type === "fx" ? e.payload.kind : ""));
    expect(kinds.filter((k) => k === "nearMiss")).toHaveLength(1);
    expect(kinds).not.toContain("lipOut");
    expect(kinds).not.toContain("holeOut");
    const near = events.find((e) => e.type === "fx" && e.payload.kind === "nearMiss")!;
    expect(near.type === "fx" && near.payload).toMatchObject({ x: 500, y: 300, targetId: "maya" });
  });

  it("no nearMiss for a ball that goes nowhere near the Cup, or that drops in or lips out", () => {
    const far = playing("maya");
    far.shoot("maya", Math.atan2(-150, 400), 0.6);
    far.advance(3000);
    expect(fx(far, "nearMiss")).toHaveLength(0);

    const drop = playing("maya");
    drop.shoot("maya", 0, 0.45);
    drop.advance(4000);
    expect(drop.state.players.maya!.holedOut).toBe(true);
    expect(fx(drop, "nearMiss")).toHaveLength(0);

    const lip = playing("maya");
    lip.shoot("maya", 0, 0.8);
    lip.advance(3000);
    expect(fx(lip, "nearMiss")).toHaveLength(0);
  });
});
