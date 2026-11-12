/**
 * Against the real production build (client/dist, as `npm run build && npm start`
 * serves it): two browsers create and join one room by code, see each other in
 * the lobby and in the game, and nothing admin ever reaches them.
 */
import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, newPlayer } from "./helpers";

test("two browsers play in one room on the production build", async ({ browser }, info) => {
  const maya = await newPlayer(browser, "Maya");
  const jay = await newPlayer(browser, "Jay");

  const code = await createRoom(maya, { swatch: 0 });
  await expect(maya.page).toHaveURL(new RegExp(`\\?room=${code}$`));

  // A wrong code is refused with a message.
  await jay.page.goto("/");
  await jay.page.getByRole("button", { name: "Play" }).click();
  await jay.page.locator("#name").fill("Jay");
  await jay.page.locator("#code").fill("ZZZZ");
  await jay.page.getByRole("button", { name: "Join room" }).click();
  await expect(jay.page.locator("#error")).toContainText("Couldn't join that room");
  jay.errors.length = 0; // the refused join logs its own error

  await joinRoom(jay, code, { swatch: 5 });

  // Both lobbies list both Players, with their colours; only the creator gets the controls.
  for (const p of [maya, jay]) {
    await expect(p.page.locator("#lobby-players li")).toHaveCount(2);
    await expect(p.page.locator("#lobby-count")).toHaveText("2/8 players");
    await expect(p.page.locator("#lobby-code")).toHaveText(code);
  }
  await expect(maya.page.locator("#lobby-players li").filter({ hasText: "Maya" })).toContainText("you · room creator");
  await expect(jay.page.locator("#lobby-players li").filter({ hasText: "Jay" })).toContainText("you");
  await expect(jay.page.locator("#lobby-players li").filter({ hasText: "Maya" }).locator(".dot")).toHaveCSS(
    "background-color",
    "rgb(255, 51, 102)",
  );
  await expect(maya.page.locator("#lobby-players li").filter({ hasText: "Jay" }).locator(".dot")).toHaveCSS(
    "background-color",
    "rgb(77, 166, 255)",
  );
  await expect(maya.page.locator("#start")).toBeVisible();
  await expect(jay.page.locator("#start")).toBeHidden();
  await expect(jay.page.locator("#lobby-wait")).toHaveText("Waiting for Maya to start…");
  await maya.page.screenshot({ path: info.outputPath("lobby-creator.png") });
  await jay.page.screenshot({ path: info.outputPath("lobby-joiner.png") });

  // The creator picks the Practice Box and starts: a 3-2-1, then both are playing.
  await maya.page.locator("#lobby-course").selectOption("placeholder");
  await expect(jay.page.locator("#lobby-course-name")).toHaveText("Course: Practice Box (1 Hole)");
  await maya.page.getByRole("button", { name: "Start game" }).click();
  for (const p of [maya, jay]) {
    await expect(p.page.locator("#lobby-screen")).toBeHidden();
    await expect(p.page.locator("#banner")).toHaveText(/^[123]$/);
  }
  for (const p of [maya, jay]) {
    await expect(p.page.locator("#timer")).toBeVisible({ timeout: 6000 });
    await expect(p.page.locator("#hole-info")).toContainText("Hole 1/1 · Box · Par 3");
    await expect(p.page.locator("#player-count")).toHaveText("2 players");
    await expect(p.page.locator("#standings")).toContainText("Maya");
    await expect(p.page.locator("#standings")).toContainText("Jay");
    await expect(p.page.locator("#game canvas")).toBeVisible();
  }
  await maya.page.waitForTimeout(800);
  await maya.page.screenshot({ path: info.outputPath("playing-maya.png") });
  await jay.page.screenshot({ path: info.outputPath("playing-jay.png") });

  // Non-Admin pages: no test hook, no admin bundle requested, no admin UI.
  for (const p of [maya, jay]) {
    expect(await p.page.evaluate(() => "__trollGolf" in window)).toBe(false);
    expect(p.requests.filter((u) => u.includes("admin"))).toEqual([]);
    await p.page.keyboard.press("Backquote");
    await expect(p.page.locator(".tga-console")).toHaveCount(0);
    await p.page.locator("#game canvas").click({ button: "right", position: { x: 300, y: 300 } });
    await expect(p.page.locator(".tga-radial")).toHaveCount(0);
    expect(p.errors).toEqual([]);
  }
});
