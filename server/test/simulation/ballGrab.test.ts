import { MAX_THROW_SPEED } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { TestGame } from "../harness";

/** Placeholder Course: Tee (160, 320), Cup (800, 320) r12, Water x 300-500 y 480-600. Maya is the Admin. */
function game(): TestGame {
  const t = new TestGame();
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.startPlaying();
  t.drain();
  return t;
}

const grab = (t: TestGame, targetId: string, mode: "stealth" | "loud" = "stealth") =>
  t.adminPower("maya", "ballGrab", { action: "grab", targetId }, mode);
const move = (t: TestGame, x: number, y: number) => t.adminPower("maya", "ballGrab", { action: "move", x, y });
const release = (t: TestGame, x: number, y: number, v?: { vx: number; vy: number }) =>
  t.adminPower("maya", "ballGrab", { action: "release", x, y, ...v });
const strokes = (t: TestGame, id: string) => t.state.players[id]!.strokes[t.state.holeIndex];

describe("Ball Grab", () => {
  it("a grabbed ball follows the drag positions and can't be shot while held", () => {
    const t = game();
    expect(grab(t, "ben")).toEqual({ ok: true });
    expect(t.shoot("ben", 0, 0.5)).toEqual({ ok: false, reason: "ball_moving" });
    for (const x of [200, 300, 400]) {
      expect(move(t, x, 200)).toEqual({ ok: true });
      t.advance(50);
      expect(t.ball("ben")).toMatchObject({ x, y: 200 });
    }
    // Held balls stay where the Admin puts them: no rolling, no rest rule.
    t.advance(2000);
    expect(t.ball("ben")).toMatchObject({ x: 400, y: 200, atRest: false });
    expect(strokes(t, "ben")).toBe(0);
  });

  it("releasing without a velocity leaves the ball at rest, and it can be shot again", () => {
    const t = game();
    grab(t, "ben");
    move(t, 600, 200);
    expect(release(t, 620, 210)).toEqual({ ok: true });
    expect(t.ball("ben")).toMatchObject({ x: 620, y: 210, vx: 0, vy: 0, atRest: true });
    t.advance(1000);
    expect(t.ball("ben")).toMatchObject({ x: 620, y: 210 });
    expect(t.shoot("ben", 0, 0.2)).toEqual({ ok: true });
  });

  it("releasing with a throw velocity gives the ball that velocity, capped", () => {
    const t = game();
    grab(t, "ben");
    release(t, 200, 200, { vx: 600, vy: 0 });
    expect(t.ball("ben")).toMatchObject({ vx: 600, atRest: false });
    t.advance(300);
    expect(t.ball("ben").x).toBeGreaterThan(300);
    t.advanceUntilRest("ben");

    const t2 = game();
    grab(t2, "ben");
    release(t2, 200, 200, { vx: 30000, vy: 0 });
    expect(Math.hypot(t2.ball("ben").vx, t2.ball("ben").vy)).toBeCloseTo(MAX_THROW_SPEED, 0);
  });

  it("a ball dragged off the map or into a wall stays at the last legal spot", () => {
    const t = game();
    grab(t, "ben");
    move(t, 300, 300);
    move(t, -50, 300);
    expect(t.ball("ben")).toMatchObject({ x: 300, y: 300 });
    expect(release(t, 5000, 5000)).toEqual({ ok: true });
    expect(t.ball("ben")).toMatchObject({ x: 300, y: 300 });
  });

  it("releasing into the Water costs +1 Stroke and returns the ball to its Rest Spot", () => {
    const t = game();
    const rest = { ...t.ball("ben").restSpot };
    grab(t, "ben");
    move(t, 400, 540);
    release(t, 400, 540);
    expect(strokes(t, "ben")).toBe(1);
    expect(t.ball("ben")).toMatchObject({ x: rest.x, y: rest.y, atRest: true });
    expect(t.drain().some((e) => e.type === "feed" && /water/.test(e.payload.text))).toBe(true);
  });

  it("releasing a thrown ball into the Water also sinks it", () => {
    const t = game();
    grab(t, "ben");
    release(t, 400, 440, { vx: 0, vy: 300 });
    t.advance(1000);
    expect(strokes(t, "ben")).toBe(1);
  });

  it("releasing in the Cup at low speed Holes Out; a fast throw lips out", () => {
    const t = game();
    grab(t, "ben");
    move(t, 800, 320);
    release(t, 800, 320);
    expect(t.state.players.ben!.holedOut).toBe(true);
    expect(strokes(t, "ben")).toBe(0);

    const t2 = game();
    grab(t2, "ben");
    release(t2, 790, 320, { vx: 700, vy: 0 });
    expect(t2.state.players.ben!.holedOut).toBe(false);
    expect(t2.drain().some((e) => e.type === "fx" && e.payload.kind === "lipOut")).toBe(true);
  });

  it("a ball can be taken back to the Tee, and a rolling ball can be grabbed", () => {
    const t = game();
    t.shoot("ben", 0, 0.8);
    t.advance(200);
    expect(t.ball("ben").atRest).toBe(false);
    grab(t, "ben");
    expect(t.ball("ben").atRest).toBe(false);
    release(t, 160, 320);
    expect(t.ball("ben")).toMatchObject({ x: 160, y: 320, atRest: true });
    t.advance(500);
    expect(t.ball("ben")).toMatchObject({ x: 160, y: 320 });
  });

  it("grabbing is logged once per grab, not per move", () => {
    const t = game();
    grab(t, "ben");
    for (let i = 0; i < 10; i++) move(t, 200 + i * 10, 200);
    release(t, 300, 200);
    const log = t.game.getAdminLog().filter((l) => l.power === "ballGrab");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ mode: "stealth", targetId: "ben" });
  });

  it("only balls in play can be grabbed", () => {
    const t = game();
    expect(grab(t, "nobody")).toEqual({ ok: false, reason: "unknown_target" });
    expect(move(t, 1, 1)).toEqual({ ok: false, reason: "not_holding" });
    expect(release(t, 1, 1)).toEqual({ ok: false, reason: "not_holding" });
    t.send("ben", { type: "disconnect" });
    expect(grab(t, "ben")).toEqual({ ok: false, reason: "not_in_play" });
    t.send("ben", { type: "reconnect" });
    grab(t, "ben");
    move(t, 800, 320);
    release(t, 800, 320);
    expect(grab(t, "ben")).toEqual({ ok: false, reason: "not_in_play" }); // Holed Out
    t.join("late", "Late");
    expect(grab(t, "late")).toEqual({ ok: false, reason: "not_in_play" }); // spectating
  });

  it("is only for the Admin, and only while a Hole is played", () => {
    const t = game();
    expect(t.adminPower("ben", "ballGrab", { action: "grab", targetId: "maya" })).toEqual({ ok: false, reason: "not_admin" });
    const lobby = new TestGame();
    lobby.joinAsAdmin("maya");
    expect(lobby.adminPower("maya", "ballGrab", { action: "grab", targetId: "maya" })).toEqual({ ok: false, reason: "wrong_phase" });
    expect(grab(t, "ben")).toEqual({ ok: true });
    expect(t.adminPower("maya", "ballGrab", { action: "move", x: "a" as never, y: 1 })).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("the Admin can grab their own ball; grabbing another ball puts the first down at rest", () => {
    const t = game();
    grab(t, "maya");
    move(t, 300, 200);
    grab(t, "ben");
    expect(t.ball("maya")).toMatchObject({ x: 300, y: 200, atRest: true });
    expect(t.shoot("maya", 0, 0.2)).toEqual({ ok: true });
  });

  it("if the Admin disconnects while holding, the ball is put down; so when the Hole ends", () => {
    const t = game();
    grab(t, "ben");
    move(t, 300, 200);
    t.send("maya", { type: "disconnect" });
    expect(t.ball("ben")).toMatchObject({ x: 300, y: 200, atRest: true });
    t.advance(500);
    expect(t.shoot("ben", 0, 0.2)).toEqual({ ok: true });

    const t2 = game();
    grab(t2, "ben");
    move(t2, 300, 200);
    t2.advanceUntilPhase("holeEnd");
    expect(t2.ball("ben")).toMatchObject({ x: 300, y: 200, atRest: true });
    expect(t2.adminPower("maya", "ballGrab", { action: "move", x: 1, y: 1 })).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("if the held ball's owner disconnects, the ball stays frozen where it is", () => {
    const t = game();
    grab(t, "ben");
    move(t, 300, 200);
    t.send("ben", { type: "disconnect" });
    expect(t.ball("ben")).toMatchObject({ x: 300, y: 200, atRest: true });
    expect(move(t, 400, 200)).toEqual({ ok: false, reason: "not_holding" });
  });

  it("Stealth emits no event; Loud emits a grab effect and the banner once", () => {
    const t = game();
    grab(t, "ben");
    move(t, 300, 200);
    release(t, 300, 200);
    expect(t.drain().filter((e) => e.audience.kind !== "admin")).toEqual([]);

    grab(t, "ben", "loud");
    move(t, 320, 200);
    release(t, 320, 200);
    const events = t.drain().filter((e) => e.audience.kind !== "admin");
    expect(events.filter((e) => e.type === "banner")).toHaveLength(1);
    expect(events.filter((e) => e.type === "fx" && e.payload.kind === "grab")).toHaveLength(2);
  });
});
