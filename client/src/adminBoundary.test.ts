/**
 * The admin client code (src/admin) must never end up in the public bundle
 * (docs/adr/0001). The public client may only refer to it through the
 * type-only seam in adminHost.ts and load it at runtime from the server.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(src, "../dist");

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full, ext) : ext.test(e.name) ? [full] : [];
  });
}

describe("the public client", () => {
  it("never imports the admin bundle's code", () => {
    const publicFiles = files(src, /\.ts$/).filter((f) => !f.startsWith(path.join(src, "admin") + path.sep));
    const offenders = publicFiles.filter((f) => {
      const code = readFileSync(f, "utf8");
      // Any import that reaches into src/admin, or a value import of the host seam.
      return /from\s+["'][^"']*\/admin(\/[^"']*)?["']/.test(code) || /^import\s+(?!type)[^;]*["'][^"']*adminHost["']/m.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it.skipIf(!existsSync(dist))("build output holds no admin console code", () => {
    const built = files(dist, /\.(js|html)$/).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const marker of ["tga-console", "Scoreboard Edit", "STEALTH", "adminResult"]) expect(built).not.toContain(marker);
  });
});
