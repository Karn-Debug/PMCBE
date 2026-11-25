import "dotenv/config";
import fs from "node:fs";
import pg from "pg";
import { parse } from "dotenv";
import { randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";
if (!process.env.LOCAL_DB_PASSWORD)
  throw new Error(
    "Set LOCAL_DB_PASSWORD for the local PMC PostgreSQL instance.",
  );
const url = new URL("postgresql://pmc@127.0.0.1:55432/pmc");
url.password = process.env.LOCAL_DB_PASSWORD;
// A legacy Windows cluster can use WIN1252, which cannot store the workbook's
// Unicode units, Marathi names or calculation text in JSONB.
const sourceUrl = url.href;
const source = new pg.Client({ connectionString: sourceUrl });
await source.connect();
let copyLocal = false;
try {
  const { rows } = await source.query("SHOW server_encoding");
  if (rows[0].server_encoding !== "UTF8") {
    const exists = await source.query(
      "SELECT 1 FROM pg_database WHERE datname='pmc_atelier_utf8'",
    );
    if (!exists.rowCount) {
      await source.query(
        "CREATE DATABASE pmc_atelier_utf8 TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C' LC_CTYPE 'C'",
      );
    }
    url.pathname = "/pmc_atelier_utf8";
    const target = new pg.Client({ connectionString: url.href });
    await target.connect();
    try {
      const probe = await target.query(
        "SELECT to_regclass('public.\"AtelierWorkspace\"') AS existing",
      );
      copyLocal =
        !probe.rows[0].existing ||
        !(await target.query('SELECT 1 FROM "AtelierWorkspace" LIMIT 1'))
          .rowCount;
    } finally {
      await target.end();
    }
  }
} finally {
  await source.end();
}
const env = { ...process.env, DATABASE_URL: url.href, NODE_ENV: "development" };
function run(args) {
  const p = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (p.status !== 0) process.exit(p.status ?? 1);
}
run(["node_modules/prisma/build/index.js", "generate"]);
run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
if (copyLocal) {
  // Both databases must have the same schema for the verified copy.
  const destination = env.DATABASE_URL;
  env.DATABASE_URL = sourceUrl;
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  env.DATABASE_URL = destination;
  env.SOURCE_DATABASE_URL = sourceUrl;
  run(["scripts/migrations/transfer-database.mjs", "--apply"]);
  const target = new pg.Client({ connectionString: destination });
  await target.connect();
  try {
    await target.query(
      `SELECT setval(pg_get_serial_sequence('"AtelierSociety"', 'number'), COALESCE(MAX(number),1), MAX(number) IS NOT NULL) FROM "AtelierSociety"`,
    );
  } finally {
    await target.end();
  }
}
run([
  "--import",
  "tsx",
  "scripts/atelier-account.ts",
  ...process.argv.slice(2),
]);
const previousFile = fs.existsSync(".env.pmc.local")
  ? ".env.pmc.local"
  : ".env.atelier.local";
const prior = fs.existsSync(previousFile)
  ? parse(fs.readFileSync(previousFile))
  : {};
fs.writeFileSync(
  ".env.pmc.local",
  [
    "DATABASE_URL=" + url.href,
    "NODE_ENV=development",
    "HOST=127.0.0.1",
    "PORT=" + (prior.PORT || "4011"),
    "PMC_LOCAL_RESET_OTP=" +
      (process.env.PMC_LOCAL_RESET_OTP ||
        process.env.ATELIER_LOCAL_RESET_OTP ||
        prior.PMC_LOCAL_RESET_OTP ||
        prior.ATELIER_LOCAL_RESET_OTP ||
        String(randomInt(100000, 1000000))),
    "APP_URL=http://localhost:3000",
    "OPENAI_API_KEY=" + (prior.OPENAI_API_KEY || ""),
    "OPENAI_PDF_MODEL=" + (prior.OPENAI_PDF_MODEL || "gpt-4.1"),
  ].join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Stallion PMC is ready on the local PostgreSQL database. Start the API with npm run pmc:dev.",
);
