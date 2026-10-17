import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pick up the local stack keys from .env.local (Node built-in; real env vars win).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    alias: {
      // src/server/* modules import "server-only", which throws outside React Server.
      "server-only": fileURLToPath(new URL("./tests/integration/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
