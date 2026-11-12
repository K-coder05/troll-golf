import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The admin client bundle (client/src/admin), served only to an
 * authenticated Admin session. It is built separately from the public client
 * (client/build-admin.mjs -> client/dist-admin/admin.js), which is never
 * served as static files and never referenced by the public bundle.
 *
 * When a session authenticates, the room issues a one-time token and tells
 * that session (and only it) the path "/admin-bundle/<token>.js". The HTTP
 * route redeems the token once; any other request gets a plain 404.
 */

/** How long an issued token can be redeemed. */
export const ADMIN_BUNDLE_TOKEN_TTL_MS = 60_000;
export const ADMIN_BUNDLE_ROUTE = "/admin-bundle";

const tokens = new Map<string, number>();

/** A fresh one-time token for the admin bundle. */
export function issueAdminBundleToken(now = Date.now()): string {
  for (const [token, expiresAt] of tokens) if (expiresAt <= now) tokens.delete(token);
  const token = randomBytes(24).toString("hex");
  tokens.set(token, now + ADMIN_BUNDLE_TOKEN_TTL_MS);
  return token;
}

/** The path the Admin's client fetches the bundle from. */
export const adminBundlePath = (token: string) => `${ADMIN_BUNDLE_ROUTE}/${token}.js`;

/** True once per issued, unexpired token. */
export function redeemAdminBundleToken(token: string, now = Date.now()): boolean {
  const expiresAt = tokens.get(token);
  if (expiresAt === undefined) return false;
  tokens.delete(token);
  return expiresAt > now;
}

// This file runs from server/src/admin (dev, tsx) or inside server/dist/index.js
// (production), at different depths, so look for the client folder upwards.
function clientDir(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "client");
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * The admin bundle's JavaScript. In production it is the prebuilt file
 * (ADMIN_BUNDLE_PATH, or client/dist-admin/admin.js). In development and
 * tests it is built from source on demand, so it's always current.
 */
export async function adminBundleSource(): Promise<string | null> {
  const client = clientDir();
  const builtPath = process.env.ADMIN_BUNDLE_PATH ?? (client ? path.join(client, "dist-admin", "admin.js") : null);
  const entry = client ? path.join(client, "src", "admin", "index.ts") : null;

  if (process.env.NODE_ENV !== "production" && entry && existsSync(entry)) {
    const { build } = await import("esbuild");
    const result = await build({ ...ADMIN_BUILD_OPTIONS, entryPoints: [entry], write: false, minify: false });
    return result.outputFiles[0]?.text ?? null;
  }
  if (builtPath && existsSync(builtPath)) return readFile(builtPath, "utf8");
  return null;
}

/** Keep in step with client/build-admin.mjs. */
const ADMIN_BUILD_OPTIONS = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
} as const;
