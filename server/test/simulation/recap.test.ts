import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Recap } from "@troll-golf/shared";
import { afterEach, describe, expect, it } from "vitest";
import { sessionLogDir, writeSessionLog } from "../../src/room/sessionLog";
import {
  computeRecap,
  sessionLogText,
  type EffectLogEntry,
  type ItemLogEntry,
} from "../../src/simulation";
import { TestGame } from "../harness";

const PLAYERS = [
  { id: "maya", name: "Maya" },
  { id: "ben", name: "Ben" },
  { id: "jay", name: "Jay" },
];

const frozenEnd = (targetId: string, lastedMs: number): EffectLogEntry => ({
  kind: "end",
  at: 1,
  holeIndex: 0,
  effectId: 1,
  effect: "frozen",
  sourceId: "jay",
  targetId,
  why: "expired",
  lastedMs,
});
const hit = (playerId: string, targetId: string, item: "freezeRay" | "golfGun" = "freezeRay"): ItemLogEntry => ({
  kind: "hit",
  at: 1,
  holeIndex: 0,
  playerId,
  targetId,
  item,
});

describe("computeRecap", () => {
  const base = { players: PLAYERS, adminLog: [], adminId: null, reveal: false };

  it("sums Freeze time per Player and counts Item Hits taken", () => {
    const recap = computeRecap({
      ...base,
      effectLog: [frozenEnd("ben", 6000), frozenEnd("jay", 2500), frozenEnd("ben", 3000)],
      itemLog: [hit("jay", "ben"), hit("jay", "ben"), hit("ben", "jay", "golfGun"), hit("maya", "jay", "golfGun")],
    });
    expect(recap.frozen).toEqual([
      { playerId: "ben", name: "Ben", value: 9000 },
      { playerId: "jay", name: "Jay", value: 2500 },
    ]);
    expect(recap.hitsTaken).toEqual([
      { playerId: "ben", name: "Ben", value: 2 },
      { playerId: "jay", name: "Jay", value: 2 },
    ].sort((a, b) => b.value - a.value));
    const byId = Object.fromEntries(recap.highlights.map((h) => [h.id, h.text]));
    expect(byId.longestFrozen).toContain("Ben");
    expect(byId.longestFrozen).toContain("9.0s");
    expect(byId.mostHitsTaken).toBe("Ben & Jay took 2 Item Hits");
    expect(byId.mostSniped).toContain("Jay got shot 2 times");
    expect(recap.reveal).toBeUndefined();
  });

  it("ignores start entries and Effects other than Frozen", () => {
    const recap = computeRecap({
      ...base,
      effectLog: [{ ...frozenEnd("ben", 5000), effect: "inked" }, { ...frozenEnd("ben", 100), kind: "start", durationMs: 1 } as never],
      itemLog: [],
    });
    expect(recap.frozen).toEqual([]);
    expect(recap.highlights).toEqual([]);
  });

  it("leaves out God Mode blocks entirely and counts Shield blocks", () => {
    const blocked = (by: "god" | "shield"): ItemLogEntry => ({ kind: "blocked", at: 1, holeIndex: 0, playerId: "jay", targetId: "maya", item: "freezeRay", by });
    const withGod = computeRecap({ ...base, effectLog: [], itemLog: [blocked("god"), blocked("god")] });
    expect(withGod).toEqual(computeRecap({ ...base, effectLog: [], itemLog: [] }));
    const withShield = computeRecap({ ...base, effectLog: [], itemLog: [blocked("shield")] });
    expect(withShield.highlights.map((h) => h.id)).toEqual(["shieldMaster"]);
  });
});

/** A 2-Hole game on the placeholder course: Maya is the Admin; Jay freezes Ben twice. */
function playGame(options: { reveal?: boolean; extra?: (t: TestGame) => void } = {}): TestGame {
  const t = new TestGame({ seed: 3 });
  t.joinAsAdmin("maya", "Maya");
  t.join("ben", "Ben");
  t.join("jay", "Jay");
  t.startPlaying();
  t.drain();
  for (let i = 0; i < 2; i++) {
    expect(t.adminPower("maya", "giveItem", { targetId: "jay", item: "freezeRay" })).toEqual({ ok: true });
    expect(t.send("jay", { type: "useItem", targetId: "ben" })).toEqual({ ok: true });
    t.advance(7000);
  }
  options.extra?.(t);
  if (options.reveal) expect(t.send("maya", { type: "reveal", enabled: true })).toEqual({ ok: true });
  return t;
}

function finish(t: TestGame): Recap {
  t.advanceUntilPhase("gameEnd", 2_000_000);
  const events = t.drain();
  const recaps = events.filter((e) => e.type === "recap");
  expect(recaps).toHaveLength(1);
  expect(recaps[0]!.audience).toEqual({ kind: "everyone" });
  return recaps[0]!.payload as Recap;
}

describe("Troll Recap through the simulation", () => {
  it("is sent to everyone at game end with the longest Freeze and the most Item Hits", () => {
    const t = playGame();
    const recap = finish(t);
    expect(recap.frozen).toHaveLength(1);
    expect(recap.frozen[0]).toMatchObject({ playerId: "ben", name: "Ben" });
    expect(recap.frozen[0]!.value).toBeGreaterThan(11_800);
    expect(recap.frozen[0]!.value).toBeLessThan(12_100);
    expect(recap.hitsTaken).toEqual([{ playerId: "ben", name: "Ben", value: 2 }]);
    expect(recap.highlights.map((h) => h.id)).toEqual(["longestFrozen", "mostHitsTaken", "topTroll"]);
    expect(recap).toEqual(t.game.getRecap());
  });

  it("without reveal carries nothing about the Admin, rigged boxes or Item gifts", () => {
    const t = playGame({
      extra: (g) => {
        g.adminPower("maya", "rigBox", { targetId: "ben", item: "inkSplat" });
        g.adminPower("maya", "invertControls", { targetId: "jay" }, "stealth");
        g.adminPower("maya", "godMode", { enabled: true });
        g.advance(1000);
      },
    });
    const recap = finish(t);
    expect(recap.reveal).toBeUndefined();
    const text = JSON.stringify(recap);
    expect(text).not.toMatch(/maya|admin|rig|god|golf gods|invert|power|stealth|loud/i);
  });

  it("a God Mode block and a hidden Invert Controls leave the Recap exactly as without them", () => {
    const plain = finish(playGame());
    const t = playGame({
      extra: (g) => {
        g.adminPower("maya", "invertControls", { targetId: "ben" }, "stealth");
        g.adminPower("maya", "godMode", { enabled: true });
        g.adminPower("maya", "giveItem", { targetId: "jay", item: "freezeRay" });
        // Jay's Freeze Ray at the Admin is turned away by God Mode.
        expect(g.send("jay", { type: "useItem", targetId: "maya" })).toEqual({ ok: true });
        expect(g.game.getItemLog().some((e) => e.kind === "blocked" && e.by === "god")).toBe(true);
        g.adminPower("maya", "godMode", { enabled: false });
      },
    });
    expect(finish(t)).toEqual(plain);
  });

  it("with reveal lists every Admin Power use with its Hole number and target", () => {
    const t = playGame({
      reveal: true,
      extra: (g) => {
        g.adminPower("maya", "scoreboardEdit", { targetId: "ben", delta: 2 }, "loud");
        g.adminPower("maya", "lipOut", { targetId: "jay" });
      },
    });
    const recap = finish(t);
    expect(recap.reveal?.adminName).toBe("Maya");
    const log = t.game.getAdminLog();
    expect(recap.reveal?.entries).toHaveLength(log.length);
    expect(recap.reveal?.entries.map((e) => e.power)).toEqual(["giveItem", "giveItem", "scoreboardEdit", "lipOut"]);
    expect(recap.reveal?.entries[2]).toMatchObject({ holeNumber: 1, mode: "loud", targetName: "Ben" });
    expect(recap.reveal?.entries[3]).toMatchObject({ holeNumber: 1, targetName: "Jay" });
  });

  it("only the Admin can flip the reveal, and a flip after the game ends re-sends the Recap", () => {
    const t = playGame();
    t.drain();
    expect(t.send("ben", { type: "reveal", enabled: true })).toEqual({ ok: false, reason: "not_admin" });
    expect(t.drain()).toEqual([]);
    expect(t.send("maya", { type: "reveal", enabled: "yes" })).toEqual({ ok: false, reason: "invalid_payload" });
    t.drain();
    expect(finish(t).reveal).toBeUndefined();

    expect(t.send("maya", { type: "reveal", enabled: true })).toEqual({ ok: true });
    const flip = t.drain();
    expect(flip.filter((e) => e.type === "revealState").map((e) => e.audience)).toEqual([{ kind: "admin" }]);
    const resent = flip.filter((e) => e.type === "recap");
    expect(resent).toHaveLength(1);
    expect(resent[0]!.audience).toEqual({ kind: "everyone" });
    expect((resent[0]!.payload as Recap).reveal?.adminName).toBe("Maya");

    // Same value again: nothing is re-sent. Off again: the reveal is withdrawn.
    t.send("maya", { type: "reveal", enabled: true });
    expect(t.drain().some((e) => e.type === "recap")).toBe(false);
    t.send("maya", { type: "reveal", enabled: false });
    expect((t.drain().find((e) => e.type === "recap")!.payload as Recap).reveal).toBeUndefined();
  });

  it("gives the Admin, and only the Admin, the full session log at game end", () => {
    const t = playGame();
    t.advanceUntilPhase("gameEnd", 2_000_000);
    const events = t.drain();
    const logs = events.filter((e) => e.type === "sessionLog");
    expect(logs).toHaveLength(1);
    expect(logs[0]!.audience).toEqual({ kind: "admin" });
    const lines = (logs[0]!.payload as { text: string }).text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ source: "session", room: "TEST", adminId: "maya", complete: true });
    expect(lines.filter((l) => l.source === "admin")).toHaveLength(2);
    expect(lines.some((l) => l.source === "item" && l.entry.kind === "hit")).toBe(true);
    expect(lines.some((l) => l.source === "effect" && l.entry.effect === "frozen")).toBe(true);
    const times = lines.slice(1).map((l) => l.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("session log files", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("writes JSON lines to the configured directory, creating it", () => {
    const root = mkdtempSync(path.join(tmpdir(), "troll-golf-log-"));
    dirs.push(root);
    const dir = path.join(root, "nested", "logs");
    const t = playGame();
    t.advanceUntilPhase("gameEnd", 2_000_000);
    const text = sessionLogText(t.game.getSessionLog());
    const file = writeSessionLog(dir, "AB/CD", text, 123);
    expect(path.dirname(file)).toBe(dir);
    expect(readdirSync(dir)).toEqual(["AB_CD-123.jsonl"]);
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(() => writeSessionLog(dir, "AB/CD", text, 123)).toThrow(); // never overwrites
  });

  it("takes the directory from SESSION_LOG_DIR, defaulting to ./logs", () => {
    expect(sessionLogDir("/var/tg")).toBe("/var/tg");
    expect(sessionLogDir(undefined)).toBe(path.resolve("logs"));
    expect(sessionLogDir("  ")).toBe(path.resolve("logs"));
  });
});

