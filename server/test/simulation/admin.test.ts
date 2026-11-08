import { GOLF_GODS_BANNER } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import { TestGame } from "../harness";

/** Maya is the secret Admin; Ben and Jay are her friends. */
function adminGame(): TestGame {
  const t = new TestGame();
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.join("jay", "Jay");
  return t;
}

const strokes = (t: TestGame, id: string, hole = t.state.holeIndex) => t.state.players[id]!.strokes[hole];

describe("Admin authentication", () => {
  it("a session that joined with the right secret is the Admin and plays as an ordinary Player", () => {
    const t = adminGame();
    expect(t.game.getAdminId()).toBe("maya");
    // Same Player record as anyone else: counted in Standing, nothing marks her.
    expect(Object.keys(t.state.players).sort()).toEqual(["ben", "jay", "maya"]);
    expect(Object.keys(t.state.players.maya!).sort()).toEqual(Object.keys(t.state.players.ben!).sort());
    t.startPlaying();
    expect(t.shoot("maya", 0, 0.3)).toEqual({ ok: true });
    expect(strokes(t, "maya")).toBe(1);
    t.advanceUntilRest("maya");
    expect(t.state.players.maya!.standing).toBe(3);
  });

  it("a wrong secret just joins as a normal Player (the adapter passes no admin flag)", () => {
    const t = new TestGame();
    expect(t.join("ben", "Ben")).toEqual({ ok: true });
    expect(t.game.getAdminId()).toBeNull();
    expect(t.adminPower("ben", "scoreboardEdit", { targetId: "ben", delta: 1 })).toEqual({ ok: false, reason: "not_admin" });
  });

  it("refuses a second Admin in the same room", () => {
    const t = adminGame();
    expect(t.joinAsAdmin("zed", "Zed")).toEqual({ ok: false, reason: "admin_taken" });
    expect(t.state.players.zed).toBeUndefined();
    expect(t.game.getAdminId()).toBe("maya");
    // An ordinary join still works.
    expect(t.join("zed", "Zed")).toEqual({ ok: true });
  });

  it("the Admin stays the Admin across a disconnect and reconnect", () => {
    const t = adminGame();
    t.startPlaying();
    t.send("maya", { type: "disconnect" });
    expect(t.game.getAdminId()).toBe("maya");
    expect(t.joinAsAdmin("zed", "Zed")).toEqual({ ok: false, reason: "admin_taken" });
    t.send("maya", { type: "reconnect" });
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 1 })).toEqual({ ok: true });
  });

  it("an Admin who leaves for good frees the role", () => {
    const t = adminGame();
    t.send("maya", { type: "leave" });
    expect(t.game.getAdminId()).toBeNull();
    expect(t.joinAsAdmin("zed", "Zed")).toEqual({ ok: true });
    expect(t.game.getAdminId()).toBe("zed");
  });
});

describe("the Admin Power pipeline", () => {
  it("rejects admin intents from anyone but the Admin, changing nothing and telling no one", () => {
    const t = adminGame();
    t.startPlaying();
    t.drain();
    for (const mode of ["stealth", "loud"] as const) {
      expect(t.adminPower("ben", "scoreboardEdit", { targetId: "jay", delta: 5 }, mode)).toEqual({
        ok: false,
        reason: "not_admin",
      });
    }
    expect(t.send("nobody", { type: "admin", power: "scoreboardEdit", mode: "loud", params: { targetId: "jay", delta: 5 } }))
      .toEqual({ ok: false, reason: "unknown_player" });
    expect(strokes(t, "jay")).toBe(0);
    expect(t.drain()).toEqual([]);
    expect(t.game.getAdminLog()).toEqual([]);
  });

  it("rejects unknown powers, bad modes and bad params, and tells only the Admin", () => {
    const t = adminGame();
    t.startPlaying();
    t.drain();
    expect(t.send("maya", { type: "admin", power: "toString", mode: "loud", params: {} })).toEqual({
      ok: false,
      reason: "unknown_power",
    });
    expect(t.send("maya", { type: "admin", power: "scoreboardEdit", mode: "LOUD", params: { targetId: "ben", delta: 1 } }))
      .toEqual({ ok: false, reason: "invalid_payload" });
    for (const params of [null, {}, { targetId: "ben" }, { targetId: "ben", delta: 0 }, { targetId: "ben", delta: 1.5 }, { targetId: "ben", delta: 999 }, { targetId: "ben", delta: 1, holeIndex: -1 }]) {
      expect(t.send("maya", { type: "admin", power: "scoreboardEdit", mode: "stealth", params })).toEqual({
        ok: false,
        reason: "invalid_payload",
      });
    }
    const events = t.drain();
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.audience.kind === "admin" && e.type === "adminResult")).toBe(true);
    expect(t.game.getAdminLog()).toEqual([]);
  });

  it("logs every use server-side with a timestamp, never in synced state", () => {
    const t = adminGame();
    t.startPlaying();
    const t1 = t.clock.now();
    t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 2 }, "stealth");
    t.advance(1500);
    const t2 = t.clock.now();
    t.adminPower("maya", "scoreboardEdit", { targetId: "jay", delta: -1 }, "loud");

    expect(t.game.getAdminLog()).toEqual([
      {
        at: t1,
        phase: "playing",
        holeIndex: 0,
        adminId: "maya",
        power: "scoreboardEdit",
        mode: "stealth",
        targetId: "ben",
        summary: "Ben +2 Strokes on Hole 1 (0 → 2)",
        params: { targetId: "ben", delta: 2 },
      },
      {
        at: t2,
        phase: "playing",
        holeIndex: 0,
        adminId: "maya",
        power: "scoreboardEdit",
        mode: "loud",
        targetId: "jay",
        summary: "Jay +0 Strokes on Hole 1 (0 → 0)",
        params: { targetId: "jay", delta: -1 },
      },
    ]);
    expect(JSON.stringify(t.state)).not.toMatch(/scoreboardEdit|stealth|loud/i);
  });

  it("confirms each use to the Admin alone", () => {
    const t = adminGame();
    t.startPlaying();
    t.drain();
    t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 1 });
    const results = t.drain().filter((e) => e.type === "adminResult");
    expect(results).toHaveLength(1);
    expect(results[0]!.audience).toEqual({ kind: "admin" });
    expect(results[0]!.payload).toMatchObject({ ok: true, power: "scoreboardEdit", mode: "stealth" });
  });
});

describe("Scoreboard Edit", () => {
  it("adds Strokes to the target; the scoreboard and Standing show it", () => {
    const t = adminGame();
    t.startPlaying();
    expect(t.state.players.ben!.standing).toBeLessThan(3);
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 3 })).toEqual({ ok: true });
    expect(strokes(t, "ben")).toBe(3);
    // Standing is recomputed right away: Ben is now last.
    expect(t.state.players.ben!.standing).toBe(3);
    // And it sticks through the Hole-end scoring.
    t.advanceUntilPhase("holeEnd");
    expect(strokes(t, "ben", 0)).toBe(Math.min(3 + 2, t.state.pars[0]! + 4));
  });

  it("removes Strokes, never below 0, and works on the Admin too", () => {
    const t = adminGame();
    t.startPlaying();
    t.shoot("jay", 0, 0.2);
    t.shoot("maya", 0, 0.2);
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "jay", delta: -5 })).toEqual({ ok: true });
    expect(strokes(t, "jay")).toBe(0);
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "maya", delta: -1 })).toEqual({ ok: true });
    expect(strokes(t, "maya")).toBe(0);
  });

  it("can edit an earlier Hole but not a future one", () => {
    const t = adminGame();
    t.startPlaying();
    t.advanceUntilPhase("holeEnd");
    const before = strokes(t, "ben", 0)!;
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: -2, holeIndex: 0 })).toEqual({ ok: true });
    expect(strokes(t, "ben", 0)).toBe(before - 2);
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 1, holeIndex: 1 })).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("works on a Holed-Out, disconnected or waiting Player, and in the final results", () => {
    const t = adminGame();
    t.startPlaying();
    t.send("jay", { type: "disconnect" });
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "jay", delta: 1 })).toEqual({ ok: true });
    t.join("late", "Late");
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "late", delta: -1 })).toEqual({ ok: true });
    expect(strokes(t, "late")).toBe(t.state.pars[0]! + 4 - 1);
    t.advanceUntilPhase("gameEnd");
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 1 })).toEqual({ ok: true });
  });

  it("is refused in the lobby and for a Player who isn't in the room", () => {
    const t = adminGame();
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 1 })).toEqual({
      ok: false,
      reason: "wrong_phase",
    });
    t.startPlaying();
    expect(t.adminPower("maya", "scoreboardEdit", { targetId: "ghost", delta: 1 })).toEqual({
      ok: false,
      reason: "unknown_target",
    });
  });

  it("Stealth: the number changes and no event reaches anyone but the Admin", () => {
    const t = adminGame();
    t.startPlaying();
    t.drain();
    t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 2 }, "stealth");
    expect(TestGame.nonAdmin(t.drain())).toEqual([]);
  });

  it("Loud: everyone gets the Golf Gods banner and a feed line naming only the target", () => {
    const t = adminGame();
    t.startPlaying();
    t.drain();
    t.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 2 }, "loud");
    const visible = TestGame.nonAdmin(t.drain());
    expect(visible).toEqual([
      { type: "feed", payload: { text: "👑 The Golf Gods gave Ben +2 Strokes" }, audience: { kind: "everyone" } },
      { type: "banner", payload: { text: GOLF_GODS_BANNER, detail: "Ben: +2 Strokes" }, audience: { kind: "everyone" } },
    ]);
    expect(GOLF_GODS_BANNER).toBe("👑 The Golf Gods have spoken");
  });
});
