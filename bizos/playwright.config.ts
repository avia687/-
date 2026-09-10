import { defineConfig, devices } from "@playwright/test";

// E2E against a production build with a seeded throwaway DB. Uses the
// pre-installed Chromium (PLAYWRIGHT_BROWSERS_PATH) — no browser download.
const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "he-IL",
    ...devices["Desktop Chrome"],
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: `bash -c "DATABASE_URL=file:./e2e.db npx prisma db push --skip-generate --accept-data-loss && DATABASE_URL=file:./e2e.db npx tsx prisma/seed.ts && DATABASE_URL=file:./e2e.db npx next start -p ${PORT}"`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: "file:./e2e.db", NEXTAUTH_SECRET: "e2e-secret", NEXTAUTH_URL: `http://localhost:${PORT}` },
  },
});
