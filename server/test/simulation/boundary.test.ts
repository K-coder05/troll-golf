import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSeededRng } from "../../src/simulation";

const simulationDir = fileURLToPath(new URL("../../src/simulation", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("the Game simulation module", () => {
  it("imports no networking or rendering framework", () => {
    const forbidden = /from\s+["'](colyseus|@colyseus\/[^"']+|phaser|express|ws)["']/;
    const offenders = sourceFiles(simulationDir).filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("gets the same rolls from the same seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const rollsA = Array.from({ length: 5 }, () => a.next());
    const rollsB = Array.from({ length: 5 }, () => b.next());
    expect(rollsA).toEqual(rollsB);
    expect(rollsA.every((r) => r >= 0 && r < 1)).toBe(true);
    expect(createSeededRng(43).next()).not.toBe(rollsA[0]);
  });
});
