import { describe, expect, it } from "vitest";
import { INTERPOLATION_DELAY_MS, SnapshotBuffer } from "./interpolation";

const at = (x: number, y = 0) => new Map([["maya", { x, y }]]);

describe("SnapshotBuffer", () => {
  it("draws a ball 100 ms behind, between the two patches around that moment", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(1000, at(0));
    buffer.push(1050, at(10));
    buffer.push(1100, at(20));
    expect(buffer.sample("maya", 1100 + 0)).toEqual({ x: 0, y: 0 });
    expect(buffer.sample("maya", 1125)).toEqual({ x: 5, y: 0 });
    expect(buffer.sample("maya", 1175)).toEqual({ x: 15, y: 0 });
    expect(INTERPOLATION_DELAY_MS).toBe(100);
  });

  it("holds the newest patch instead of guessing ahead, and the oldest before that", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(1000, at(0));
    buffer.push(1050, at(10));
    expect(buffer.sample("maya", 1500)).toEqual({ x: 10, y: 0 });
    expect(buffer.sample("maya", 900)).toEqual({ x: 0, y: 0 });
    expect(buffer.sample("ben", 1500)).toBeUndefined();
  });

  it("snaps across a long jump instead of sliding", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(1000, at(0));
    buffer.push(1050, at(500));
    expect(buffer.sample("maya", 1125)).toEqual({ x: 0, y: 0 });
    expect(buffer.sample("maya", 1150)).toEqual({ x: 500, y: 0 });
  });

  it("smooths over a late patch", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(1000, at(0));
    buffer.push(1050, at(10));
    // The next patch is 40 ms late and the one after early.
    buffer.push(1140, at(20));
    buffer.push(1150, at(30));
    const xs = [1150, 1170, 1190, 1210, 1230, 1250].map((t) => buffer.sample("maya", t)!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
  });
});
