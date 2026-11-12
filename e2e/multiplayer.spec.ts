/**
 * Four Players in one room: a shot made by mouse drag on one screen moves that
 * ball on everyone's screen, and the remote copies glide (interpolated ~100 ms
 * behind) instead of jumping from patch to patch.
 */
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ballOf, createRoom, joinRoom, newPlayer, probe, sampleBall, shoot, startGame, waitForSteadyBall } from "./helpers";

test("a drag-shot moves the ball smoothly on every other screen (4 Players, one on a jittery connection)", async ({ browser }, info) => {
  // Jay is on a bumpy connection: every message from the server arrives 40–80 ms late, in order.
  const players = await Promise.all(
    ["Maya", "Jay", "Ana", "Bo"].map((n) => newPlayer(browser, n, n === "Jay" ? { jitterMs: [40, 80] } : {})),
  );
  const [maya, jay, ana, bo] = players as [(typeof players)[number], (typeof players)[number], (typeof players)[number], (typeof players)[number]];
  const code = await createRoom(maya, { swatch: 0 });
  await joinRoom(jay, code, { swatch: 5 });
  await joinRoom(ana, code, { swatch: 3 });
  await joinRoom(bo, code, { swatch: 6 });
  await expect(maya.page.locator("#lobby-players li")).toHaveCount(4);

  await startGame(maya, players);
  const mayaId = (await probe(maya)).sessionId;
  for (const p of players) {
    const seen = await probe(p);
    expect(seen.balls.map((b) => b.name).sort()).toEqual(["Ana", "Bo", "Jay", "Maya"]);
    expect(seen.balls.every((b) => b.visible)).toBe(true);
  }
  await waitForSteadyBall(jay);
  const before = await ballOf(jay, mayaId);

  // Maya drags back down-left from her ball: it goes up-right. Jay samples her ball every frame meanwhile.
  await waitForSteadyBall(maya);
  const samples = sampleBall(jay, mayaId, 4000);
  await shoot(maya, -90, 60);
  const path = await samples;
  writeFileSync(info.outputPath("remote-ball-path.json"), JSON.stringify(path));
  await jay.page.screenshot({ path: info.outputPath("remote-ball-moving.png") });

  // Everyone sees the ball leave the Tee, the same way.
  for (const p of [jay, ana, bo]) {
    await expect.poll(async () => (await ballOf(p, mayaId)).x - before.x).toBeGreaterThan(40);
    expect((await ballOf(p, mayaId)).y).toBeLessThan(before.y);
  }
  await expect(maya.page.locator("#hole-info")).toContainText("1 stroke");

  // Smoothness on Jay's screen: while it rolls, the ball moves every frame (no stalls), and no
  // 50 ms stretch runs faster or slower than both its neighbours (surging to a patch, rubber-banding).
  // Real changes of speed (a wall, sand) are steps, not spikes, so they pass.
  const steps = path.slice(1).map((s, i) => ({
    t: s.t,
    dt: s.t - path[i]!.t,
    d: Math.hypot(s.x - path[i]!.x, s.y - path[i]!.y),
  }));
  const moving = steps.filter((s) => s.d > 0.05);
  expect(path.length).toBeGreaterThan(120);
  expect(moving.length).toBeGreaterThan(30);
  const during = steps.slice(steps.indexOf(moving[0]!), steps.indexOf(moving.at(-1)!) + 1);
  const stalls = during.filter((s) => s.d === 0).length;
  // Speed (px/ms) over each 50 ms window, one patch's worth: a patch arriving late or early shows up at this scale.
  const windows = new Map<number, { d: number; dt: number }>();
  for (const s of during) {
    const w = windows.get(Math.floor(s.t / 50)) ?? { d: 0, dt: 0 };
    w.d += s.d;
    w.dt += s.dt;
    windows.set(Math.floor(s.t / 50), w);
  }
  // (Not the first window, which holds the moment it left rest, nor the last, which is cut short.)
  const speeds = [...windows.values()].slice(1, -1).map((w) => w.d / w.dt);
  let worstSpike = 1;
  for (let i = 1; i + 1 < speeds.length; i++) {
    const [prev, v, next] = [speeds[i - 1]!, speeds[i]!, speeds[i + 1]!];
    if (Math.min(prev, v, next) < 0.08) continue; // crawling to a stop (under 80 px/s): too slow to see
    worstSpike = Math.max(worstSpike, v / Math.max(prev, next), Math.min(prev, next) / Math.max(v, 1e-3));
  }
  const fps = (during.length / (during.at(-1)!.t - during[0]!.t)) * 1000;
  console.log(
    `smoothness on Jay's screen: ${during.length} frames at ~${fps.toFixed(0)} fps, max step ${Math.max(...during.map((s) => s.d)).toFixed(1)} px, worst spike ${worstSpike.toFixed(2)}x, stalls ${stalls}`,
  );
  // Software WebGL (headless without a GPU) renders too few frames to judge; see playwright.config.ts.
  if (fps >= 50) {
    expect(stalls).toBeLessThanOrEqual(1);
    expect(worstSpike).toBeLessThan(1.6);
  } else {
    info.annotations.push({ type: "skipped smoothness", description: `only ${fps.toFixed(0)} fps` });
  }

  for (const p of players) expect(p.errors).toEqual([]);
});
