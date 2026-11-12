import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (e2e/): real headless Chromium against the production server.
 * Run with `npm run test:browser`, which builds first. Two servers:
 * - "prod" serves the real production client (client/dist), exactly what
 *   `npm run build && npm start` ships;
 * - "e2e" serves the same client built with `--mode e2e` (client/dist-e2e),
 *   which adds the read-only `window.__trollGolf.probe()` the canvas specs use.
 * Both have an Admin secret so the specs can join as the Admin.
 */
export const ADMIN_SECRET = "e2e-hunter2";
const PROD_PORT = 4517;
const E2E_PORT = 4518;

const server = (port: number, clientDir: string) => ({
  command: "node --enable-source-maps server/dist/index.js",
  url: `http://127.0.0.1:${port}/health`,
  reuseExistingServer: false,
  stdout: "ignore" as const,
  stderr: "pipe" as const,
  env: {
    NODE_ENV: "production",
    PORT: String(port),
    ADMIN_SECRET,
    CLIENT_DIR: clientDir,
    SESSION_LOG_DIR: "test-results/session-logs",
  },
});

export default defineConfig({
  testDir: "e2e",
  // Every spec plays a real-time game against one server: keep them apart.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Headless Chromium renders WebGL in software (~15 fps with four game pages
    // open), too slow to judge smooth motion. On a Mac, use the GPU.
    launchOptions: process.platform === "darwin" ? { args: ["--use-angle=metal", "--enable-gpu"] } : {},
  },
  projects: [
    { name: "prod", testMatch: /prod\..*\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${PROD_PORT}` } },
    { name: "e2e", testIgnore: /prod\..*\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${E2E_PORT}` } },
  ],
  webServer: [server(PROD_PORT, "client/dist"), server(E2E_PORT, "client/dist-e2e")],
});
