import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html"],
    },
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://127.0.0.1:4173/",
      },
    },
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup/test-env.ts"],
    testTimeout: 30_000,
  },
});
