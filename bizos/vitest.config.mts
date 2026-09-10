import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./test.db",
      NEXTAUTH_SECRET: "test-secret",
    },
    globalSetup: ["./src/test/global-setup.ts"],
    include: ["src/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
