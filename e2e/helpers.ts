import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** Matches ADMIN_SECRET in playwright.config.ts. */
export const ADMIN_SECRET = "e2e-hunter2";

/** What `window.__trollGolf.probe()` returns (client/src/scenes/HoleScene.ts, e2e builds only). */
export interface Probe {
  sessionId: string;
  phase: string | null;
  holeDrawn: boolean;
  cup: { x: number; y: number; screen: { x: number; y: number } } | null;
  balls: {
    id: string;
    name: string;
    x: number;
    y: number;
    screen: { x: number; y: number };
    visible: boolean;
    alpha: number;
    offline: boolean;
    effects: string;
    iced: boolean;
    shielded: boolean;
  }[];
}

export interface Player {
  context: BrowserContext;
  page: Page;
  name: string;
  /** Console errors and uncaught exceptions seen on this page. */
  errors: string[];
  /** Every URL the page requested. */
  requests: string[];
}

/**
 * Wraps the page's WebSocket so a test can drop the connection like a flaky
 * network would (`__e2eNet.drop()`: close with a "may reconnect" code and
 * refuse new sockets) and bring it back (`__e2eNet.restore()`).
 */
function installNetworkSwitch(): void {
  const Native = window.WebSocket;
  const sockets: WebSocket[] = [];
  let blocked = false;
  class SwitchableWebSocket extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(blocked ? "ws://127.0.0.1:9/" : url, protocols);
      sockets.push(this);
    }
  }
  window.WebSocket = SwitchableWebSocket;
  (window as unknown as { __e2eNet: unknown }).__e2eNet = {
    drop() {
      blocked = true;
      for (const s of sockets) if (s.readyState <= 1) s.close(4010, "e2e drop");
    },
    restore() {
      blocked = false;
    },
  };
}

/**
 * Delay every server-to-browser WebSocket message by a random latency in
 * [min, max] ms, keeping order: a bumpy home internet connection.
 */
async function addJitter(page: Page, [min, max]: [number, number]): Promise<void> {
  await page.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    let lastAt = 0;
    server.onMessage((message) => {
      const at = Math.max(Date.now() + min + Math.random() * (max - min), lastAt);
      lastAt = at;
      setTimeout(() => ws.send(message), at - Date.now());
    });
    ws.onMessage((message) => server.send(message));
  });
}

/** Every browser context a test opened, closed after it so finished games don't keep rendering. */
const openContexts: BrowserContext[] = [];
base.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map((c) => c.close()));
});

export async function newPlayer(browser: Browser, name: string, opts: { jitterMs?: [number, number] } = {}): Promise<Player> {
  const context = await browser.newContext();
  openContexts.push(context);
  const page = await context.newPage();
  await page.addInitScript(installNetworkSwitch);
  if (opts.jitterMs) await addJitter(page, opts.jitterMs);
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => requests.push(r.url()));
  return { context, page, name, errors, requests };
}

/** Title -> Create/Join, fill the nickname and pick a swatch; optionally the hidden passphrase. */
async function fillJoinForm(p: Player, opts: { swatch?: number; secret?: string }): Promise<void> {
  const { page } = p;
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("#join-screen")).toBeVisible();
  await page.locator("#name").fill(p.name);
  await page.locator("#swatches .swatch").nth(opts.swatch ?? 0).click();
  if (opts.secret) {
    await page.locator("#name").blur();
    await page.keyboard.press("Backquote");
    await expect(page.locator("#secret")).toBeVisible();
    await page.locator("#secret").fill(opts.secret);
  }
}

export async function createRoom(p: Player, opts: { swatch?: number; secret?: string } = {}): Promise<string> {
  await fillJoinForm(p, opts);
  await p.page.getByRole("button", { name: "Create room" }).click();
  await expect(p.page.locator("#lobby-screen")).toBeVisible();
  const code = (await p.page.locator("#lobby-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  return code;
}

export async function joinRoom(p: Player, code: string, opts: { swatch?: number; secret?: string } = {}): Promise<void> {
  await fillJoinForm(p, opts);
  await p.page.locator("#code").fill(code.toLowerCase());
  await p.page.getByRole("button", { name: "Join room" }).click();
  await expect(p.page.locator("#lobby-screen")).toBeVisible();
}

/** The room creator picks a Course and starts; everyone waits for play to begin. */
export async function startGame(creator: Player, everyone: Player[], courseId = "placeholder"): Promise<void> {
  await creator.page.locator("#lobby-course").selectOption(courseId);
  await creator.page.getByRole("button", { name: "Start game" }).click();
  for (const p of everyone) await waitForPhase(p, "playing", 15_000);
}

export async function probe(p: Player): Promise<Probe> {
  return p.page.evaluate(() => (window as unknown as { __trollGolf: { probe(): Probe } }).__trollGolf.probe());
}

export async function waitForPhase(p: Player, phase: string, timeout = 10_000): Promise<void> {
  await expect
    .poll(async () => p.page.evaluate(() => (window as { __trollGolf?: { probe(): { phase: string | null } } }).__trollGolf?.probe().phase ?? null), {
      timeout,
    })
    .toBe(phase);
}

export async function ballOf(p: Player, id?: string): Promise<Probe["balls"][number]> {
  const state = await probe(p);
  const ball = state.balls.find((b) => b.id === (id ?? state.sessionId));
  if (!ball) throw new Error(`no ball ${id ?? "(mine)"} on ${p.name}'s screen`);
  return ball;
}

/** Wait until the camera has settled on this Player's own ball (it eases in after the countdown). */
export async function waitForSteadyBall(p: Player): Promise<Probe["balls"][number]> {
  let last = { x: NaN, y: NaN };
  await expect
    .poll(
      async () => {
        const b = await ballOf(p);
        const steady = Math.abs(b.screen.x - last.x) < 0.5 && Math.abs(b.screen.y - last.y) < 0.5;
        last = b.screen;
        return steady && b.visible;
      },
      { intervals: [200], timeout: 10_000 },
    )
    .toBe(true);
  return ballOf(p);
}

/** Slingshot: press on your ball, drag back by (dx, dy) px on screen, release. The ball goes the other way. */
export async function shoot(p: Player, dx: number, dy: number): Promise<void> {
  const ball = await waitForSteadyBall(p);
  const { mouse } = p.page;
  await mouse.move(ball.screen.x, ball.screen.y);
  await mouse.down();
  await mouse.move(ball.screen.x + dx, ball.screen.y + dy, { steps: 8 });
  await mouse.up();
}

/** Samples a ball's drawn position on every animation frame for `ms`. */
export async function sampleBall(p: Player, id: string, ms: number): Promise<{ t: number; x: number; y: number }[]> {
  return p.page.evaluate(
    ([id, ms]) =>
      new Promise<{ t: number; x: number; y: number }[]>((resolve) => {
        const out: { t: number; x: number; y: number }[] = [];
        const start = performance.now();
        const tick = (now: number) => {
          const ball = (window as unknown as { __trollGolf: { probe(): Probe } }).__trollGolf.probe().balls.find((b) => b.id === id);
          if (ball) out.push({ t: now - start, x: ball.x, y: ball.y });
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    [id, ms] as const,
  );
}
