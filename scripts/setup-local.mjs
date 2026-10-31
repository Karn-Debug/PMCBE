import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const configPath = fileURLToPath(new URL("../.env", import.meta.url));
if (fs.existsSync(configPath)) {
  console.log("Existing backend configuration preserved.");
} else {
  const password = crypto.randomBytes(24).toString("hex");
  const lines = [
    "DATABASE_URL=postgresql://pmc:" + password + "@127.0.0.1:55432/pmc",
    "LOCAL_DB_PASSWORD=" + password,
    "PORT=4000",
    "HOST=127.0.0.1",
    "APP_URL=http://localhost:5173",
    "NODE_ENV=development",
    "SEED_DEMO=true",
    "ADMIN_EMAIL=owner@stallion.local",
    "ADMIN_PASSWORD=StallionLocal!2026",
  ];
  fs.writeFileSync(configPath, lines.join("\n") + "\n", { mode: 0o600 });
  console.log("Local configuration created.");
}
