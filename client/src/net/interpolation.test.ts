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

  it("keeps a steadily rolling ball steady when patches arrive with network jitter", () => {
    const buffer = new SnapshotBuffer();
    // The server sends every 50 ms; each patch takes 40-80 ms to arrive (in order). The ball rolls 10 px per patch.
    const delays = [52, 78, 41, 66, 80, 45, 59, 73, 40, 77, 48, 61, 79, 42, 70, 55, 44, 76, 63, 50, 80, 41, 68, 57];
    let lastArrival = 0;
    const arrivals = delays.map((d, i) => (lastArrival = Math.max(1000 + i * 50 + d, lastArrival)));
    const frames: number[] = [];
    let next = 0;
    for (let now = 1100; now < 1000 + delays.length * 50; now += 1000 / 60) {
      while (next < arrivals.length && arrivals[next]! <= now) buffer.push(arrivals[next]!, at(next++ * 10));
      frames.push(buffer.sample("maya", now)!.x);
    }
    // Once rolling, every frame moves it about 10 px / 50 ms * 16.7 ms = 3.3 px: no surges, no stops.
    const steps = frames.slice(1).map((x, i) => x - frames[i]!);
    const rolling = steps.slice(steps.findIndex((d) => d > 0) + 6, -6);
    expect(rolling.length).toBeGreaterThan(40);
    for (const d of rolling) {
      expect(d).toBeGreaterThan(3.33 * 0.6);
      expect(d).toBeLessThan(3.33 * 1.4);
    }
  });
});
