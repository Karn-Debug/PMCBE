import "dotenv/config";
import pg from "pg";
import fs from "node:fs/promises";
const snapshot = JSON.parse(
  await fs.readFile(".local/backups/before-relational-refactor.json", "utf8"),
);
const name = "pmc_normalization_check_" + Date.now();
const target = new URL(process.env.DATABASE_URL);
target.pathname = "/" + name;
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
const c = new pg.Client({ connectionString: target.toString() });
await c.connect();
await fs.writeFile(
  ".local/normalization-rehearsal.json",
  JSON.stringify({ name, status: "running" }),
);
try {
  for (const migration of snapshot.migrations)
    await c.query(
      await fs.readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
    );
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!rows.length) continue;
    await c.query(
      `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}",$1::jsonb)`,
      [JSON.stringify(rows)],
    );
  }
  await c.query(
    await fs.readFile(
      "prisma/migrations/202610290001_normalized_entities/migration.sql",
      "utf8",
    ),
  );
  await fs.writeFile(
    ".local/normalization-rehearsal.json",
    JSON.stringify({ name, status: "passed" }),
  );
  console.log(
    "Migration rehearsal succeeded on an isolated copy of all existing data.",
  );
  console.log(
    JSON.stringify(
      (await c.query(`SELECT count(*)::int AS business_entities FROM "Entity"`))
        .rows,
    ),
  );
} catch (e) {
  console.error("Migration rehearsal failed:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
