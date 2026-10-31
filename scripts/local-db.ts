import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
if (process.env.NODE_ENV === "production")
  throw new Error("Use a managed PostgreSQL database in production.");
if (!process.env.LOCAL_DB_PASSWORD)
  throw new Error("Run npm run setup:local first");
const databaseDir = path.resolve(".local/postgres");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "pmc",
  password: process.env.LOCAL_DB_PASSWORD,
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (m) => console.error(String(m)),
});
if (!fs.existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = 'pmc'",
);
await client.end();
if (!result.rowCount) await pg.createDatabase("pmc");
console.log(
  "Local PostgreSQL listening on 127.0.0.1:55432. Data persists in backend/.local/postgres.",
);
const timer = setInterval(() => {}, 60000);
async function stop() {
  clearInterval(timer);
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
