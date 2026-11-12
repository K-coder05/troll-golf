// Builds the admin client bundle (src/admin) on its own, into dist-admin/,
// outside the public dist/. The game server serves it only to an
// authenticated Admin session (server/src/admin/bundle.ts); nothing in the
// public client imports it. Keep the options in step with that file.
import { build } from "esbuild";

await build({
  entryPoints: ["src/admin/index.ts"],
  outfile: "dist-admin/admin.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  minify: true,
});
