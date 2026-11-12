import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./roomCode";

describe("room codes", () => {
  it("are 4 letters from the code alphabet", () => {
    let seed = 0;
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 50; i++) expect(isValidRoomCode(generateRoomCode(random))).toBe(true);
  });

  it("accept what a Player typed in lower case with spaces", () => {
    expect(normalizeRoomCode("  golf ")).toBe("GOLF");
    expect(isValidRoomCode("GOLF")).toBe(true);
    expect(isValidRoomCode("GOL")).toBe(false);
    expect(isValidRoomCode("GO1F")).toBe(false);
  });
});
