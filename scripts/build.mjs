import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.resolve(root, "dist");
if (path.dirname(dist) !== path.resolve(root) || path.basename(dist) !== "dist")
  throw new Error("Unexpected build output path");
for (const script of [
  "node_modules/prisma/build/index.js",
  "node_modules/typescript/bin/tsc",
]) {
  if (script.includes("typescript"))
    await fs.rm(dist, { recursive: true, force: true });
  const args = script.includes("prisma") ? [script, "generate"] : [script];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
