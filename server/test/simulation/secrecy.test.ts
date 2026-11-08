/**
 * Secrecy (docs/adr/0001): nobody but the Admin can tell who the Admin is.
 *
 * The strongest form of that: play the same scripted game twice, once with
 * Maya as the Admin and once with Ben, using the same Admin Powers on the same
 * targets in both Stealth and Loud. Everything a non-Admin can observe (every
 * synced state snapshot and every event not addressed to the Admin) must be
 * identical between the two runs. On top of that, nothing observable may carry
 * an admin flag, and the events an Admin Power causes must not name the Admin.
 *
 * Later Admin Powers extend `useAdminPowers` below with their own uses.
 */
import { GOLF_GODS_BANNER, type AdminMode, type AdminPowerId, type AdminPowerParams } from "@troll-golf/shared";
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../src/simulation";
import { TestGame } from "../harness";

const NAMES = { maya: "Maya", ben: "Ben", jay: "Jay" } as const;
type Id = keyof typeof NAMES;

interface Observed {
  /** JSON of the synced state after every scripted step. */
  snapshots: string[];
  /** Every event a non-Admin could receive, in order. */
  events: GameEvent[];
  /** Non-Admin events emitted by each Admin Power use (and the frames right after it). */
  powerEvents: { power: AdminPowerId; mode: AdminMode; targetId: string; events: GameEvent[] }[];
  adminEvents: GameEvent[];
}

function playScriptedGame(adminId: Id): Observed {
  const t = new TestGame({ seed: 7 });
  const observed: Observed = { snapshots: [], events: [], powerEvents: [], adminEvents: [] };
  const record = () => {
    const drained = t.drain();
    observed.adminEvents.push(...drained.filter((e) => e.audience.kind === "admin"));
    const visible = TestGame.nonAdmin(drained);
    observed.events.push(...visible);
    observed.snapshots.push(JSON.stringify(t.state));
    return visible;
  };
  const use = <K extends AdminPowerId>(power: K, mode: AdminMode, params: AdminPowerParams[K], continuation = false) => {
    record();
    expect(t.adminPower(adminId, power, params, mode)).toEqual({ ok: true });
    t.advance(500);
    const events = record();
    // A Nuke runs its siren, blast and aftermath (4.5 s) before the next power.
    if (power === "nuke") {
      t.advance(5000);
      record();
    }
    // A continuation (a Ball Grab drag or release) is part of the use that started it.
    if (!continuation) {
      observed.powerEvents.push({ power, mode, targetId: (params as { targetId?: string }).targetId ?? "", events });
    }
  };

  // Everyone joins the same way; only the adapter knows who brought the secret.
  for (const id of ["maya", "ben", "jay"] as const) {
    const result = id === adminId ? t.joinAsAdmin(id, NAMES[id]) : t.join(id, NAMES[id]);
    expect(result.ok).toBe(true);
  }
  record();
  t.startPlaying();
  record();

  t.shoot("maya", 0, 0.4);
  t.shoot("ben", Math.PI / 2, 0.3);
  t.advance(400);
  record();

  useAdminPowers(use);

  t.advanceUntilPhase("holeEnd");
  record();
  use("scoreboardEdit", "loud", { targetId: "ben", delta: -1, holeIndex: 0 });
  use("scoreboardEdit", "stealth", { targetId: "jay", delta: 1, holeIndex: 0 });
  t.advanceUntilPhase("gameEnd");
  record();
  use("scoreboardEdit", "loud", { targetId: "maya", delta: 1, holeIndex: 0 });
  return observed;
}

/** Every Admin Power, Stealth and Loud, on every kind of target (the Admin included). */
function useAdminPowers(
  use: <K extends AdminPowerId>(power: K, mode: AdminMode, params: AdminPowerParams[K], continuation?: boolean) => void,
): void {
  for (const mode of ["stealth", "loud"] as const) {
    use("scoreboardEdit", mode, { targetId: "jay", delta: 2 });
    use("scoreboardEdit", mode, { targetId: "ben", delta: -1 });
    use("scoreboardEdit", mode, { targetId: "maya", delta: 1 });
  }
  // Ball Grab: pick a ball up, drag it, put it down at rest, on others and on the Admin's own ball.
  for (const mode of ["stealth", "loud"] as const) {
    for (const [targetId, x, y] of [["jay", 300, 200], ["ben", 400, 220], ["maya", 500, 240]] as const) {
      use("ballGrab", mode, { action: "grab", targetId });
      use("ballGrab", mode, { action: "move", x: x - 40, y }, true);
      use("ballGrab", mode, { action: "move", x, y }, true);
      use("ballGrab", mode, { action: "release", x, y }, true);
    }
  }
  // Nuke: siren, blast and both aftermaths, in both modes. (use() waits 500 ms; the next use waits out the rest.)
  use("nuke", "stealth", { x: 600, y: 300 });
  use("nuke", "loud", { x: 300, y: 300, aftermath: "reset" });
  // Cup powers: teleport, slide, resize, and a Lip-Out waiting for a ball (none arrive within the 500 ms window).
  for (const mode of ["stealth", "loud"] as const) {
    use("moveCup", mode, { mode: "teleport", x: 700, y: 350 });
    use("moveCup", mode, { mode: "slide", triggerDistance: 100, speed: 50 });
    use("cupSize", mode, { radius: 30 });
    use("cupSize", mode, { radius: 8 });
    use("lipOut", mode, { targetId: "jay" });
    use("lipOut", mode, { targetId: "maya" });
  }
  // Terrain Paint: a stroke, dragged on, then a clear, away from every ball (they rest on the Tee after the Reset).
  for (const mode of ["stealth", "loud"] as const) {
    use("terrainPaint", mode, { action: "stroke", surface: "water", radius: 30, points: [{ x: 600, y: 120 }] });
    use("terrainPaint", mode, { action: "extend", points: [{ x: 660, y: 120 }, { x: 720, y: 140 }] }, true);
    use("terrainPaint", mode, { action: "stroke", surface: "ice", radius: 20, points: [{ x: 500, y: 500 }, { x: 560, y: 520 }] });
  }
  use("terrainPaint", "stealth", { action: "clear" });
  use("terrainPaint", "loud", { action: "stroke", surface: "sand", radius: 25, points: [{ x: 640, y: 480 }], durationSec: 1 });
  // Magnet/Repel: the same polarity for everyone (the default would favour the Admin and so differ between runs), then off.
  for (const mode of ["stealth", "loud"] as const) {
    for (const targetId of ["maya", "ben", "jay"]) use("magnet", mode, { action: "set", targetId, polarity: "attract" });
    use("magnet", mode, { action: "toggle", enabled: true });
    use("magnet", mode, { action: "toggle", enabled: false });
  }
  // Spawn Wall: out of the way of every ball; one stays, one is timed, then Clear.
  for (const mode of ["stealth", "loud"] as const) {
    use("spawnWall", mode, { action: "spawn", a: { x: 560, y: 470 }, b: { x: 620, y: 470 } });
    use("spawnWall", mode, { action: "spawn", a: { x: 560, y: 530 }, b: { x: 620, y: 530 }, durationSec: 1 });
  }
  use("spawnWall", "stealth", { action: "clear" });
  // Invert Controls on others and on the Admin, in both modes.
  for (const mode of ["stealth", "loud"] as const) {
    use("invertControls", mode, { targetId: "jay" });
    use("invertControls", mode, { targetId: "ben", durationSec: 5 });
    use("invertControls", mode, { targetId: "maya", durationSec: 5 });
  }
  // Items: give (to others and to the Admin), rig a box, God Mode on and off.
  for (const mode of ["stealth", "loud"] as const) {
    use("giveItem", mode, { targetId: "jay", item: "freezeRay" });
    use("giveItem", mode, { targetId: "ben", item: "shield" });
    use("giveItem", mode, { targetId: "maya", item: "mulligan" });
    use("rigBox", mode, { targetId: "jay", item: "inkSplat" });
    use("rigBox", mode, { targetId: "maya", item: "swap" });
    use("godMode", mode, { enabled: true });
    use("godMode", mode, { enabled: false });
  }
}

/** Every object key anywhere in a JSON-able value. */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, into));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysOf(v, into);
    }
  }
  return into;
}

describe("secrecy of the Admin", () => {
  const asMaya = playScriptedGame("maya");
  const asBen = playScriptedGame("ben");

  it("non-Admins observe exactly the same game whoever the Admin is", () => {
    expect(asMaya.snapshots).toEqual(asBen.snapshots);
    expect(asMaya.events).toEqual(asBen.events);
    // The script really did use powers in both modes and changed the scores.
    expect(asMaya.powerEvents.filter((p) => p.mode === "loud").length).toBeGreaterThan(0);
    expect(asMaya.powerEvents.filter((p) => p.mode === "stealth").length).toBeGreaterThan(0);
  });

  it("no synced state and no non-Admin event carries an admin flag or Admin Power marker", () => {
    for (const run of [asMaya, asBen]) {
      const keys = [...keysOf(run.snapshots.map((s) => JSON.parse(s))), ...keysOf(run.events)];
      expect(keys.filter((k) => /admin|stealth|loud|power|source/i.test(k))).toEqual([]);
      expect(run.events.some((e) => e.type === "adminResult" || e.type === "adminBundle")).toBe(false);
      expect(JSON.stringify(run.events)).not.toMatch(/admin/i);
    }
  });

  it("events caused by an Admin Power never name the Admin or use their id", () => {
    for (const [run, adminId] of [
      [asMaya, "maya"],
      [asBen, "ben"],
    ] as const) {
      for (const use of run.powerEvents) {
        // A use on the Admin themselves names them as the target, like anyone else; skip those.
        if (use.targetId === adminId) continue;
        const text = JSON.stringify(use.events);
        expect(text).not.toContain(NAMES[adminId]);
        expect(text).not.toContain(`"${adminId}"`);
      }
    }
  });

  it("Loud uses send the Golf Gods banner to everyone; Stealth uses send nothing at all", () => {
    for (const use of asMaya.powerEvents) {
      if (use.mode === "stealth") {
        // A Nuke is spectacular even in Stealth: its fx go to everyone (but never name anyone).
        if (use.power === "nuke") expect(use.events.every((e) => e.type === "fx")).toBe(true);
        // Give Item tells the recipient alone (their private `item` message); nothing else.
        else if (use.power === "giveItem") {
          expect(use.events.map((e) => e.type)).toEqual(["item"]);
          expect(use.events[0]!.audience).toEqual({ kind: "player", playerId: use.targetId });
        } else {
          // Nothing but ambient physics juice (a ball still rolling and clinking a wall), which happens without any power.
          const ambient = new Set(["putt", "wallHit", "nearMiss"]);
          expect(use.events.filter((e) => !(e.type === "fx" && ambient.has(e.payload.kind)))).toEqual([]);
        }
      } else {
        const banners = use.events.filter((e) => e.type === "banner");
        expect(banners).toHaveLength(1);
        expect(banners[0]!.audience).toEqual({ kind: "everyone" });
        expect(banners[0]!.payload).toMatchObject({ text: GOLF_GODS_BANNER });
      }
    }
  });

  it("x-ray data only ever goes to the Admin's audience", () => {
    for (const run of [asMaya, asBen]) {
      expect(run.events.some((e) => e.type === "xray")).toBe(false);
      expect(run.adminEvents.some((e) => e.type === "xray")).toBe(true);
      expect(run.adminEvents.filter((e) => e.type === "xray").every((e) => e.audience.kind === "admin")).toBe(true);
    }
  });

  it("the Admin gets a confirmation of every use, on the admin audience only", () => {
    expect(asMaya.adminEvents.filter((e) => e.type === "adminResult")).toHaveLength(asMaya.powerEvents.length);
  });
});
