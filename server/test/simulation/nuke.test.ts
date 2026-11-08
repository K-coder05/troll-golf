import { NUKE_BLAST_MS, NUKE_SIREN_MS } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { sampleCourse } from "../../src/courses";
import { TestGame } from "../harness";

/** Placeholder Course: Tee (160, 320), Cup (800, 320) r12. Maya is the Admin. */
function game(settings = {}): TestGame {
  const t = new TestGame({ settings });
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.join("jay", "Jay");
  t.startPlaying();
  t.drain();
  return t;
}

const nuke = (t: TestGame, params = { x: 200, y: 450 } as { x: number; y: number; aftermath?: "wipe" | "reset" }, mode: "stealth" | "loud" = "stealth") =>
  t.adminPower("maya", "nuke", params, mode);
const strokes = (t: TestGame, id: string) => t.state.players[id]!.strokes[t.state.holeIndex];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Everyone takes a shot so balls sit away from the Tee with Strokes on the board. */
function scatter(t: TestGame): void {
  t.shoot("maya", 0, 0.12);
  t.shoot("ben", 0.4, 0.12);
  t.shoot("jay", -0.4, 0.12);
  for (const id of ["maya", "ben", "jay"]) t.advanceUntilRest(id);
}

describe("Nuke", () => {
  it("the siren lasts 3 s and no ball is touched until it ends", () => {
    const t = game();
    scatter(t);
    const before = ["maya", "ben", "jay"].map((id) => ({ ...t.ball(id) }));
    t.drain();
    expect(nuke(t)).toEqual({ ok: true });
    t.advance(NUKE_SIREN_MS - 100);
    expect(["maya", "ben", "jay"].map((id) => ({ ...t.ball(id) }))).toEqual(before);
    t.advance(200);
    expect(["maya", "ben", "jay"].some((id, i) => t.ball(id).x !== before[i]!.x)).toBe(true);
  });

  it("sends the siren to everyone at launch and the blast when it ends, in Stealth too", () => {
    for (const mode of ["stealth", "loud"] as const) {
      const t = game();
      nuke(t, { x: 480, y: 300 }, mode);
      const launch = t.drain().filter((e) => e.audience.kind === "everyone" && e.type === "fx");
      expect(launch.map((e) => (e.payload as { kind: string }).kind)).toEqual(["nukeSiren"]);
      t.advance(NUKE_SIREN_MS + 100);
      const blast = t.drain().filter((e) => e.type === "fx");
      expect(blast.map((e) => (e.payload as { kind: string }).kind)).toEqual(["nukeBlast"]);
      expect(blast[0]!.payload).toMatchObject({ x: 480, y: 300 });
    }
  });

  it("the Golf Gods banner shows only in Loud and never names the Admin", () => {
    const stealth = game();
    nuke(stealth);
    expect(stealth.drain().filter((e) => e.type === "banner")).toEqual([]);
    const loud = game();
    nuke(loud, undefined, "loud");
    const events = loud.drain();
    const banners = events.filter((e) => e.type === "banner");
    expect(banners).toHaveLength(1);
    expect(JSON.stringify(TestGame.nonAdmin(events))).not.toMatch(/maya/i);
  });

  it("the blast pushes every ball outward from the impact point", () => {
    const t = game();
    scatter(t);
    const impact = { x: 200, y: 450 };
    const before = ["maya", "ben", "jay"].map((id) => ({ ...t.ball(id) }));
    nuke(t, impact);
    t.advance(NUKE_SIREN_MS + 100);
    ["maya", "ben", "jay"].forEach((id, i) => {
      const ball = t.ball(id);
      expect(ball.atRest).toBe(false);
      expect(dist(ball, impact)).toBeGreaterThan(dist(before[i]!, impact));
      // Moving away from the impact point.
      const outward = (ball.x - impact.x) * ball.vx + (ball.y - impact.y) * ball.vy;
      expect(outward).toBeGreaterThan(0);
    });
  });

  it("Wipe (the default): every ball on the course goes to the Tee at rest, Strokes kept, timer unchanged", () => {
    const t = game();
    scatter(t);
    const timer = t.state.holeEndsAt;
    expect(nuke(t)).toEqual({ ok: true });
    // A ball flung into the Water by the blast still pays its normal penalty, so compare just before the Wipe.
    t.advance(NUKE_SIREN_MS + NUKE_BLAST_MS - 20);
    const total = { maya: strokes(t, "maya"), ben: strokes(t, "ben"), jay: strokes(t, "jay") };
    t.advance(120);
    const tee = { x: 160, y: 320 };
    for (const id of ["maya", "ben", "jay"] as const) {
      expect(dist(t.ball(id), tee)).toBeLessThan(60);
      expect(t.ball(id).atRest).toBe(true);
      expect(strokes(t, id)).toBe(total[id]);
    }
    expect(t.state.holeEndsAt).toBe(timer);
    expect(t.state.phase).toBe("playing");
    // Balls are playable again.
    expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
  });

  it("Wipe leaves Holed-Out Players alone", () => {
    const t = game();
    t.adminPower("maya", "ballGrab", { action: "grab", targetId: "ben" });
    t.adminPower("maya", "ballGrab", { action: "release", x: 800, y: 320 });
    expect(t.state.players.ben!.holedOut).toBe(true);
    const strokesBefore = strokes(t, "ben");
    nuke(t, { x: 200, y: 450, aftermath: "wipe" });
    t.advance(NUKE_SIREN_MS + NUKE_BLAST_MS + 100);
    expect(t.state.players.ben!.holedOut).toBe(true);
    expect(t.ball("ben")).toMatchObject({ x: 800, y: 320 });
    expect(strokes(t, "ben")).toBe(strokesBefore);
  });

  it("Reset: everyone including the Holed Out replays, Strokes of this Hole zeroed, timer restarted", () => {
    const t = game();
    scatter(t);
    t.adminPower("maya", "ballGrab", { action: "grab", targetId: "ben" });
    t.adminPower("maya", "ballGrab", { action: "release", x: 800, y: 320 });
    t.advance(5000);
    const oldTimer = t.state.holeEndsAt;
    nuke(t, { x: 200, y: 450, aftermath: "reset" });
    t.advance(NUKE_SIREN_MS + NUKE_BLAST_MS + 100);
    const tee = { x: 160, y: 320 };
    for (const id of ["maya", "ben", "jay"] as const) {
      expect(t.state.players[id]!.holedOut).toBe(false);
      expect(dist(t.ball(id), tee)).toBeLessThan(60);
      expect(t.ball(id).atRest).toBe(true);
      expect(strokes(t, id)).toBe(0);
    }
    expect(t.state.holeEndsAt).toBeGreaterThan(oldTimer);
    expect(t.state.holeEndsAt).toBeCloseTo(t.clock.now() + 90_000 - 100, -3);
    // Holed-Out Ben can shoot again.
    expect(t.shoot("ben", 0, 0.3)).toEqual({ ok: true });
  });

  it("Reset keeps earlier Holes' Strokes", () => {
    const t = new TestGame({ course: sampleCourse, settings: { holeTimerSec: 5 } });
    t.joinAsAdmin("maya", "Maya");
    t.join("ben", "Ben");
    t.startPlaying();
    t.advanceUntilPhase("holeEnd");
    const first = strokes(t, "maya");
    t.advanceUntilPhase("countdown");
    t.advanceUntilPhase("playing");
    expect(t.state.holeIndex).toBe(1);
    t.shoot("maya", 0, 0.1);
    nuke(t, { x: 200, y: 450, aftermath: "reset" });
    t.advance(NUKE_SIREN_MS + NUKE_BLAST_MS + 100);
    expect(first).toBeGreaterThan(0);
    expect(t.state.players.maya!.strokes[0]).toBe(first);
    expect(t.state.players.maya!.strokes[1]).toBe(0);
  });

  it("only one Nuke can be pending, and the impact point must be on the Hole", () => {
    const t = game();
    expect(nuke(t)).toEqual({ ok: true });
    expect(nuke(t)).toEqual({ ok: false, reason: "nuke_pending" });
    t.advance(NUKE_SIREN_MS + NUKE_BLAST_MS + 100);
    expect(nuke(t, { x: -50, y: 10 })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(nuke(t, { x: 400, y: 300 })).toEqual({ ok: true });
  });

  it("is only for the playing phase and only for the Admin", () => {
    const t = new TestGame();
    t.joinAsAdmin("maya", "Maya");
    t.join("ben", "Ben");
    expect(nuke(t)).toEqual({ ok: false, reason: "wrong_phase" });
    t.startPlaying();
    t.drain();
    expect(t.adminPower("ben", "nuke", { x: 400, y: 300 })).toEqual({ ok: false, reason: "not_admin" });
    expect(t.drain()).toEqual([]);
  });

  it("is cancelled if the Hole ends before it goes off", () => {
    const t = game({ holeTimerSec: 5 });
    t.advance(3000);
    nuke(t);
    t.drain();
    const before = t.ball("ben");
    t.advanceUntilPhase("holeEnd");
    const kinds = t.drain().filter((e) => e.type === "fx").map((e) => (e.payload as { kind: string }).kind);
    expect(kinds).toEqual(["nukeAbort"]);
    t.advance(NUKE_SIREN_MS + NUKE_BLAST_MS);
    expect(t.drain().filter((e) => e.type === "fx")).toEqual([]);
    expect(t.ball("ben").x).toBe(before.x);
  });

  it("a held ball is put down and blasted; disconnected and Holed-Out balls don't move; Wipe sends disconnected balls to the Tee", () => {
    const t = game();
    scatter(t);
    t.adminPower("maya", "ballGrab", { action: "grab", targetId: "ben" });
    t.adminPower("maya", "ballGrab", { action: "move", x: 500, y: 200 });
    t.send("jay", { type: "disconnect" });
    const jay = { ...t.ball("jay") };
    nuke(t, { x: 500, y: 200 });
    t.advance(NUKE_SIREN_MS + 100);
    expect(t.ball("ben").atRest).toBe(false);
    expect(t.ball("jay")).toEqual(jay);
    t.advance(NUKE_BLAST_MS);
    expect(dist(t.ball("jay"), { x: 160, y: 320 })).toBeLessThan(60);
    expect(t.adminPower("maya", "ballGrab", { action: "move", x: 1, y: 1 })).toEqual({ ok: false, reason: "not_holding" });
  });
});
