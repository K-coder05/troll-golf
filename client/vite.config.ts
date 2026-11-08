import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
  // Phaser alone is ~1.5 MB minified; one chunk is fine for a game page.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
