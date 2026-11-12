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

    const events = t.drain().filter((e) => e.type === "feed");
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

  it("sends the Hole's layout only to the Player who joined", () => {
    const t = new TestGame();
    t.join("maya");
    t.drain();
    t.join("ben");

    const holes = t.drain().filter((e) => e.type === "hole");
    expect(holes).toHaveLength(1);
    expect(holes[0]!.audience).toEqual({ kind: "player", playerId: "ben" });
    expect(holes[0]!.payload).toMatchObject({ holeIndex: 0, hole: { id: "box", tee: { x: 160, y: 320 } } });
  });
});
