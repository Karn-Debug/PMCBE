import "dotenv/config";
import pg from "pg";
import fs from "node:fs/promises";
const tables = [
  "Organization",
  "User",
  "Session",
  "Project",
  "Record",
  "Payment",
  "File",
  "Comment",
  "Invitation",
  "Audit",
  "TenderSetup",
];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
if (
  !(await c.query(`SELECT to_regclass('public."Record"') AS name`)).rows[0].name
) {
  await c.end();
  throw new Error(
    "This one-time snapshot command is only for the pre-normalization schema.",
  );
}
await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
const snapshot = {
  createdAt: new Date().toISOString(),
  tables: {},
  migrations: [],
};
for (const table of tables)
  snapshot.tables[table] = (
    await c.query(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY id`)
  ).rows.map((x) => x.row);
snapshot.migrations = (
  await c.query(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
  )
).rows.map((x) => x.migration_name);
await c.query("COMMIT");
await fs.mkdir(".local/backups", { recursive: true });
await fs.writeFile(
  ".local/backups/before-relational-refactor.json",
  JSON.stringify(snapshot),
  { mode: 0o600, flag: "wx" },
);
await c.end();
console.log(
  "Consistent database snapshot saved locally; excluded from source packages.",
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(snapshot.tables).map(([t, r]) => [t, r.length]),
    ),
  ),
);
