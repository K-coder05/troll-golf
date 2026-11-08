import { describe, expect, it } from "vitest";
import { TestGame } from "../harness";

describe("joining a room", () => {
  it("Maya and Ben join and both appear in state, with a feed line for everyone", () => {
    const t = new TestGame({ code: "GOLF" });

    expect(t.join("maya", "Maya", "#ff3366")).toEqual({ ok: true });
    expect(t.join("ben", "Ben", "#3366ff")).toEqual({ ok: true });
    t.advance(100);

    expect(t.state.code).toBe("GOLF");
    expect(t.state.phase).toBe("lobby");
    expect(Object.values(t.state.players).map((p) => [p.name, p.color, p.connected])).toEqual([
      ["Maya", "#ff3366", true],
      ["Ben", "#3366ff", true],
    ]);

    const events = t.drain();
    expect(events).toEqual([
      { type: "feed", payload: { text: "Maya joined" }, audience: { kind: "everyone" } },
      { type: "feed", payload: { text: "Ben joined" }, audience: { kind: "everyone" } },
    ]);
    expect(t.drain()).toEqual([]);
  });

  it("refuses a 9th Player and leaves the first 8 untouched", () => {
    const t = new TestGame();
    for (let i = 1; i <= 8; i++) expect(t.join(`p${i}`).ok).toBe(true);

    expect(t.join("p9")).toEqual({ ok: false, reason: "room_full" });
    expect(Object.keys(t.state.players)).toHaveLength(8);
    expect(t.state.players.p9).toBeUndefined();
  });

  it("refuses joining twice from the same session", () => {
    const t = new TestGame();
    t.join("maya", "Maya");
    expect(t.join("maya", "Maya again")).toEqual({ ok: false, reason: "already_joined" });
    expect(t.state.players.maya?.name).toBe("Maya");
  });

  it("gives a Player with a blank name or bad colour a default", () => {
    const t = new TestGame();
    t.join("anon", "   ", "not-a-colour");
    const anon = t.state.players.anon!;
    expect(anon.name).toBe("Player 1");
    expect(anon.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("removes a Player who leaves the lobby and tells everyone", () => {
    const t = new TestGame();
    t.join("maya", "Maya");
    t.join("ben", "Ben");
    t.drain();

    expect(t.send("ben", { type: "leave" })).toEqual({ ok: true });
    expect(Object.keys(t.state.players)).toEqual(["maya"]);
    expect(t.drain()).toEqual([{ type: "feed", payload: { text: "Ben left" }, audience: { kind: "everyone" } }]);
  });
});

describe("cursor dots", () => {
  it("moves a Player's cursor and Ben sees it in state", () => {
    const t = new TestGame();
    t.join("maya", "Maya");
    t.join("ben", "Ben");
    expect(t.state.players.maya!.cursor.active).toBe(false);

    t.send("maya", { type: "cursor", x: 120, y: 340 });
    t.advance(16);

    expect(t.state.players.maya!.cursor).toEqual({ x: 120, y: 340, active: true });
    expect(t.state.players.ben!.cursor.active).toBe(false);
  });

  it("keeps the cursor on the Hole", () => {
    const t = new TestGame();
    t.join("maya");
    t.send("maya", { type: "cursor", x: -50, y: 99_999 });
    expect(t.state.players.maya!.cursor).toMatchObject({ x: 0, y: 640 });
  });

  it("rejects garbage coordinates and intents from unknown sessions", () => {
    const t = new TestGame();
    t.join("maya");
    t.send("maya", { type: "cursor", x: 10, y: 10 });

    expect(t.send("maya", { type: "cursor", x: Number.NaN, y: 5 })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(t.send("ghost", { type: "cursor", x: 1, y: 1 })).toEqual({ ok: false, reason: "unknown_player" });
    expect(t.state.players.maya!.cursor).toMatchObject({ x: 10, y: 10 });
  });
});
