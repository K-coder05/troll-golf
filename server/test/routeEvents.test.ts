import { describe, expect, it } from "vitest";
import { recipientsFor } from "../src/room/routeEvents";
import { everyone, toAdmin, toPlayer, type GameEvent } from "../src/simulation";

const feed = (audience: GameEvent["audience"]): GameEvent => ({ type: "feed", payload: { text: "x" }, audience });

describe("routing drained events by audience", () => {
  const sessions = ["maya", "ben", "jay"];
  const withAdmin = (admin?: string) => ({
    all: sessions,
    forPlayer: (id: string) => sessions.find((s) => s === id),
    admin: () => admin,
  });

  it("sends everyone-events to every connection", () => {
    expect(recipientsFor(feed(everyone), withAdmin())).toEqual(sessions);
  });

  it("sends a Player's event only to that Player", () => {
    expect(recipientsFor(feed(toPlayer("ben")), withAdmin())).toEqual(["ben"]);
    expect(recipientsFor(feed(toPlayer("gone")), withAdmin())).toEqual([]);
  });

  it("sends admin-only events to the Admin's connection and nowhere else", () => {
    expect(recipientsFor(feed(toAdmin), withAdmin("jay"))).toEqual(["jay"]);
    expect(recipientsFor(feed(toAdmin), withAdmin(undefined))).toEqual([]);
  });
});
