import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/src/**/*.test.ts", "server/test/**/*.test.ts", "client/src/**/*.test.ts"],
  },
});
