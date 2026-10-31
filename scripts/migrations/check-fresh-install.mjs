import "dotenv/config";
import pg from "pg";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
const name = "pmc_fresh_check_" + Date.now();
const target = new URL(process.env.DATABASE_URL);
target.pathname = "/" + name;
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
await fs.writeFile(".local/fresh-install-check.json", JSON.stringify({ name }));
const env = { ...process.env, DATABASE_URL: target.toString() };
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ["--import", "tsx", "prisma/seed.ts"],
  ["--import", "tsx", "scripts/import-reference.ts"],
  ["--import", "tsx", "scripts/import-parity.ts"],
  ["--import", "tsx", "scripts/import-reference.ts"],
  ["--import", "tsx", "scripts/import-parity.ts"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const c = new pg.Client({ connectionString: target.toString() });
await c.connect();
console.log("Fresh migration + seed + repeatable reference imports passed.");
console.log(
  JSON.stringify(
    (
      await c.query(
        `SELECT (SELECT count(*) FROM "Entity")::int AS entities,(SELECT count(*) FROM "TenderSetupRow")::int AS tender_form_rows,(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL)::int AS applied_migrations`,
      )
    ).rows,
  ),
);
await c.end();
