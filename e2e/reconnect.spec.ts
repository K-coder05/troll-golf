/**
 * Dropped connections and late joiners, as the screens show them: the
 * dropped Player sees "reconnecting", everyone else sees their ball greyed
 * out with an "offline" badge; it all clears when they're back. A Player who
 * joins mid-Hole spectates until the next one; a reload rejoins as the same Player.
 */
import { expect, test } from "@playwright/test";
import { ballOf, createRoom, joinRoom, newPlayer, probe, startGame, waitForPhase } from "./helpers";

test("a dropped connection shows offline, then reconnects; a late joiner spectates", async ({ browser }, info) => {
  const maya = await newPlayer(browser, "Maya");
  const jay = await newPlayer(browser, "Jay");
  const code = await createRoom(maya, { swatch: 0 });
  await joinRoom(jay, code, { swatch: 5 });
  await startGame(maya, [maya, jay]);
  const jayId = (await probe(jay)).sessionId;
  expect((await ballOf(maya, jayId)).offline).toBe(false);

  // The SDK only auto-reconnects a room that has been up 5 s; the countdown already took 3.
  await jay.page.waitForTimeout(2500);
  await jay.page.evaluate(() => (window as unknown as { __e2eNet: { drop(): void } }).__e2eNet.drop());
  await expect(jay.page.locator("#connection")).toBeVisible();
  await expect.poll(async () => (await ballOf(maya, jayId)).offline).toBe(true);
  expect((await ballOf(maya, jayId)).alpha).toBeCloseTo(0.35);
  await expect(maya.page.locator("#standings tr.offline")).toContainText("Jay");
  await expect(maya.page.locator("#standings tr.offline .badge")).toHaveText("offline");
  await maya.page.screenshot({ path: info.outputPath("offline-badge.png") });
  await jay.page.screenshot({ path: info.outputPath("reconnecting-banner.png") });

  await jay.page.evaluate(() => (window as unknown as { __e2eNet: { restore(): void } }).__e2eNet.restore());
  await expect(jay.page.locator("#connection")).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => (await ballOf(maya, jayId)).offline).toBe(false);
  expect((await probe(jay)).sessionId).toBe(jayId);
  await expect(maya.page.locator("#standings tr.offline")).toHaveCount(0);

  // A reload mid-game comes back as the same Player, straight into the game.
  // (After the reconnect above, so the seat saved then must hold the new reconnection token.)
  await jay.page.reload();
  await waitForPhase(jay, "playing");
  expect((await probe(jay)).sessionId).toBe(jayId);
  await expect(jay.page.locator("#hud")).toBeVisible();
  await expect(maya.page.locator("#player-count")).toHaveText("2 players");

  // A late joiner: in the room, but spectating until the next Hole; their ball isn't on the course.
  const bo = await newPlayer(browser, "Bo");
  await bo.page.goto(`/?room=${code}`);
  await expect(bo.page.locator("#join-screen")).toBeVisible();
  await expect(bo.page.locator("#code")).toHaveValue(code);
  await bo.page.locator("#name").fill("Bo");
  await bo.page.getByRole("button", { name: "Join room" }).click();
  await waitForPhase(bo, "playing");
  await expect(bo.page.locator("#lobby-screen")).toBeHidden();
  await expect(bo.page.locator("#spectate")).toBeVisible();
  await expect(bo.page.locator("#spectate")).toContainText("You joined mid-game: you'll play from the next Hole");
  await expect(bo.page.locator("#spectate")).toContainText(/Watching (Maya|Jay)/);
  const boId = (await probe(bo)).sessionId;
  await expect.poll(async () => (await ballOf(maya, boId)).visible).toBe(false);
  await expect(maya.page.locator("#standings tr.waiting")).toContainText("Bo");
  await bo.page.screenshot({ path: info.outputPath("late-joiner.png") });

  for (const p of [maya, bo]) expect(p.errors).toEqual([]);
  // Jay's page logged the refused reconnection attempts while the network was down; nothing else.
  expect(jay.errors.filter((e) => !/WebSocket|ws:\/\/127\.0\.0\.1:9|ERR_CONNECTION_REFUSED/.test(e))).toEqual([]);
});
