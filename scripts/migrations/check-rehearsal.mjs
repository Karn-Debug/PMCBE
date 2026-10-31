import "dotenv/config";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
const { name, status } = JSON.parse(
  await fs.readFile(".local/normalization-rehearsal.json", "utf8"),
);
if (status !== "passed")
  throw new Error("The latest migration rehearsal did not pass");
if (!/^pmc_normalization_check_\d+$/.test(name))
  throw new Error("Expected the isolated rehearsal database");
const target = new URL(process.env.DATABASE_URL);
target.pathname = "/" + name;
const env = { ...process.env, DATABASE_URL: target.toString() };
for (const args of [
  ["--import", "tsx", "scripts/migrations/verify-normalization.ts"],
  ["--import", "tsx", "--test", "test/integration.test.ts"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
