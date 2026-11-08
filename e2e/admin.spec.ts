/**
 * The Admin: joins through the hidden passphrase field, gets the admin bundle
 * (nobody else does), and uses the console, hotbar, Caps Lock toggle, radial
 * menu and x-ray. Give Item hands out a Freeze Ray and a Shield, so Items land:
 * badges on the ball, the kill feed and the target picker.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_SECRET, ballOf, createRoom, joinRoom, newPlayer, probe, startGame, waitForSteadyBall, type Player } from "./helpers";

/** Sets the Caps Lock state the page sees (Playwright's keyboard does not latch it). */
async function capsLock(page: Page, on: boolean): Promise<void> {
  await page.evaluate((on) => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "CapsLock", code: "CapsLock", modifierCapsLock: on } as KeyboardEventInit));
  }, on);
}

async function giveItem(admin: Player, targetName: string, itemLabel: string): Promise<void> {
  const page = admin.page;
  const console = page.locator(".tga-console");
  if (await console.isHidden()) await page.keyboard.press("Backquote");
  await console.getByRole("button", { name: "🎁 Give Item" }).click();
  const panel = console.locator(".tga-panel");
  await panel.locator("label", { hasText: "Player" }).locator("select").selectOption({ label: targetName });
  await panel.locator("label", { hasText: "Item" }).locator("select").selectOption({ label: itemLabel });
  await panel.getByRole("button", { name: "Give Item" }).click();
  await expect(console.locator(".tga-results li").first()).toContainText("Gave");
  await expect(console.locator(".tga-results .tga-error")).toHaveCount(0);
  await page.keyboard.press("Backquote"); // close it again
  await expect(console).toBeHidden();
}

/** Right-click a world point on the Admin's canvas and return the radial menu's labels. */
async function radialAt(page: Page, screen: { x: number; y: number }): Promise<{ centre: string; items: string[] }> {
  await page.mouse.click(screen.x, screen.y, { button: "right" });
  const menu = page.locator(".tga-radial"); // a zero-size anchor; its centre label and buttons are what show
  await expect(menu.locator(".tga-radial-centre")).toBeVisible();
  const centre = (await menu.locator(".tga-radial-centre").textContent()) ?? "";
  const items = await menu.locator(".tga-radial-item small").allTextContents();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  return { centre, items };
}

test("the Admin's console, hotbar, Caps Lock, radial menu, x-ray, and Items landing", async ({ browser }, info) => {
  const admin = await newPlayer(browser, "Kim");
  const jay = await newPlayer(browser, "Jay");
  const maya = await newPlayer(browser, "Maya");

  // A wrong passphrase is just a normal Player; the right one makes the Admin. Nothing on screen says so.
  const code = await createRoom(admin, { secret: ADMIN_SECRET, swatch: 2 });
  await joinRoom(jay, code, { swatch: 5 });
  await joinRoom(maya, code, { secret: "not-the-secret", swatch: 0 });
  await expect(admin.page.locator("#lobby-players li")).toHaveCount(3);
  await expect.poll(() => admin.requests.filter((u) => /\/admin-bundle\/[0-9a-f]{48}\.js$/.test(u)).length).toBe(1);
  for (const p of [jay, maya]) expect(p.requests.filter((u) => u.includes("admin"))).toEqual([]);
  await expect(admin.page.locator("#lobby-players")).not.toContainText(/admin/i);

  await startGame(admin, [admin, jay, maya]);

  // ---- Console and hotbar (Admin only) ----
  const consoleBox = admin.page.locator(".tga-console");
  await expect(consoleBox).toBeHidden();
  await admin.page.keyboard.press("Backquote");
  await expect(consoleBox).toBeVisible();
  await expect(consoleBox.locator(".tga-slot")).toHaveCount(9);
  await expect(consoleBox.locator(".tga-mode")).toHaveText("🥷 STEALTH");
  await admin.page.keyboard.press("Digit3"); // slot 3: Nuke by default
  await expect(consoleBox.locator(".tga-slot").nth(2)).toHaveClass(/tga-on/);
  await expect(consoleBox.locator(".tga-name.tga-on")).toHaveText("☢️ Nuke");
  await admin.page.keyboard.press("Digit1");
  await expect(consoleBox.locator(".tga-name.tga-on")).toContainText("Scoreboard Edit");
  await capsLock(admin.page, true);
  await expect(consoleBox.locator(".tga-mode")).toHaveText("👑 LOUD");
  await expect(consoleBox).toHaveClass(/tga-loud/);
  await admin.page.screenshot({ path: info.outputPath("admin-console-loud.png") });
  await capsLock(admin.page, false);
  await expect(consoleBox.locator(".tga-mode")).toHaveText("🥷 STEALTH");
  await admin.page.keyboard.press("Backquote");
  await expect(consoleBox).toBeHidden();
  for (const p of [jay, maya]) {
    await p.page.keyboard.press("Backquote");
    await capsLock(p.page, true);
    await p.page.keyboard.press("Digit3");
    await expect(p.page.locator(".tga-console, .tga-mode, .tga-radial")).toHaveCount(0);
    await capsLock(p.page, false);
  }

  // ---- Radial menu on right-click: a ball, the Cup, the terrain ----
  await waitForSteadyBall(admin);
  const jayId = (await probe(jay)).sessionId;
  const jayBall = await ballOf(admin, jayId);
  const onBall = await radialAt(admin.page, jayBall.screen);
  expect(onBall.centre).toBe("Jay's ball");
  expect(onBall.items.sort()).toEqual(
    ["Scoreboard Edit", "Ball Grab", "Nuke", "Lip-Out", "Give Item", "Rig the Box", "Invert Controls"].sort(),
  );
  // Tab zooms out to the whole Hole, so the Cup is on screen.
  await admin.page.keyboard.down("Tab");
  await admin.page.waitForTimeout(1200);
  const cup = (await probe(admin)).cup!.screen;
  // Tab also shows the scoreboard: nobody has finished the Hole, so nobody is under or over Par yet.
  const board = admin.page.locator("#scoreboard");
  await expect(board).toBeVisible();
  await expect(board.locator("tbody tr:not(.par) td:last-child")).toHaveText(["–", "–", "–"]);
  await expect(board.locator("td.under, td.over")).toHaveCount(0);
  const onCup = await radialAt(admin.page, cup);
  expect(onCup.centre).toBe("The Cup");
  expect(onCup.items.sort()).toEqual(["Nuke", "Move the Cup", "Cup Size", "Magnet/Repel"].sort());
  const onTerrain = await radialAt(admin.page, { x: cup.x - 120, y: cup.y + 150 });
  expect(onTerrain.centre).toBe("Terrain");
  expect(onTerrain.items.sort()).toEqual(["Nuke", "Move the Cup", "Terrain Paint"].sort());
  await admin.page.mouse.click(jayBall.screen.x, jayBall.screen.y, { button: "right" });
  await admin.page.screenshot({ path: info.outputPath("admin-radial.png") });
  await admin.page.keyboard.press("Escape");
  await admin.page.keyboard.up("Tab");

  // ---- Items landing: a Shield for Jay, then Freeze Rays from the Admin ----
  await giveItem(admin, "Jay", "🛡️ Shield");
  await expect(jay.page.locator("#item-name")).toHaveText("Shield");
  await jay.page.keyboard.press("Space");
  for (const p of [admin, jay, maya]) {
    await expect(p.page.locator("#kill-feed")).toContainText("Jay raised a Shield");
    await expect.poll(async () => (await ballOf(p, jayId)).shielded).toBe(true);
    await expect.poll(async () => (await ballOf(p, jayId)).effects).toContain("🛡");
  }

  // The target picker: hold Space with an opponent Item.
  await giveItem(admin, "Kim (you)", "🧊 Freeze Ray");
  await expect(admin.page.locator("#item-name")).toHaveText("Freeze Ray");
  await admin.page.keyboard.down("Space");
  const picker = admin.page.locator("#target-picker");
  await expect(picker).toBeVisible();
  await expect(picker.locator("button")).toHaveCount(2);
  await expect(picker).toContainText("Jay");
  await expect(picker).toContainText("Maya");
  await admin.page.screenshot({ path: info.outputPath("target-picker.png") });
  // Pick Jay: the Shield eats it.
  await picker.locator("button", { hasText: "Jay" }).dispatchEvent("mousedown");
  await admin.page.keyboard.up("Space");
  await expect(picker).toBeHidden();
  for (const p of [admin, jay, maya]) {
    await expect(p.page.locator("#kill-feed .line.block")).toContainText("Jay's Shield ate a Freeze Ray");
    await expect.poll(async () => (await ballOf(p, jayId)).shielded).toBe(false);
  }

  // Another Freeze Ray, at Maya this time (press 1-8 in the picker to choose).
  const mayaId = (await probe(maya)).sessionId;
  await giveItem(admin, "Kim (you)", "🧊 Freeze Ray");
  await admin.page.keyboard.down("Space");
  await expect(picker).toBeVisible();
  const mayaKey = await picker.locator("button", { hasText: "Maya" }).locator(".key").textContent();
  await admin.page.keyboard.press(`Digit${mayaKey}`);
  await admin.page.keyboard.up("Space");
  for (const p of [admin, jay, maya]) {
    await expect(p.page.locator("#kill-feed .line.hit")).toContainText("Maya got frozen");
    await expect.poll(async () => (await ballOf(p, mayaId)).iced).toBe(true);
    await expect.poll(async () => (await ballOf(p, mayaId)).effects).toContain("🧊");
  }
  await expect(maya.page.locator("#frozen-hint")).toBeVisible();
  await maya.page.screenshot({ path: info.outputPath("frozen-maya.png") });
  await jay.page.screenshot({ path: info.outputPath("kill-feed-jay.png") });

  // ---- X-ray (Alt+X), Admin only ----
  const xray = admin.page.locator("body > canvas");
  await expect(xray).toBeHidden();
  await admin.page.keyboard.press("Alt+KeyX");
  await expect(xray).toBeVisible();
  // It draws a label per ball: count drawn pixels.
  await expect
    .poll(() =>
      admin.page.evaluate(() => {
        const c = document.querySelector("body > canvas") as HTMLCanvasElement;
        const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
        return n;
      }),
    )
    .toBeGreaterThan(1000);
  await admin.page.screenshot({ path: info.outputPath("xray.png") });
  await admin.page.keyboard.press("Alt+KeyX");
  await expect(xray).toBeHidden();
  for (const p of [jay, maya]) {
    await p.page.keyboard.press("Alt+KeyX");
    await expect(p.page.locator("body > canvas")).toHaveCount(0);
    expect(p.requests.filter((u) => u.includes("admin"))).toEqual([]);
  }

  for (const p of [admin, jay, maya]) expect(p.errors).toEqual([]);
});
