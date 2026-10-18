// Build-time switch: flips the Prisma datasource from SQLite (the committed
// default used for local dev + tests) to PostgreSQL for serverless deploys
// (Vercel). Runs on the ephemeral build machine — it does not change the repo.
// The schema is provider-portable, so only the provider line needs swapping.
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url);
const src = readFileSync(SCHEMA, "utf8");

if (src.includes('provider = "postgresql"')) {
  console.log("[use-postgres] already postgresql — nothing to do");
  process.exit(0);
}

const out = src.replace('provider = "sqlite"', 'provider = "postgresql"');
if (out === src) {
  console.error('[use-postgres] could not find `provider = "sqlite"` in schema.prisma');
  process.exit(1);
}

writeFileSync(SCHEMA, out);
console.log("[use-postgres] datasource provider set to postgresql for this build");
