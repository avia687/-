import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Provisions a throwaway SQLite database for the integration tests.
export default function setup() {
  const url = "file:./test.db";
  try {
    rmSync("prisma/test.db", { force: true });
    rmSync("prisma/test.db-journal", { force: true });
  } catch {
    /* ignore */
  }
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url },
  });
}
