import bcrypt from "bcryptjs";
import { AtelierAccountRole } from "../src/generated/prisma/enums.js";
import { z } from "zod";
import fs from "node:fs";
import { db } from "../src/config/database.js";
import { createSociety } from "../src/services/atelier-society.service.js";
const host = new URL(process.env.DATABASE_URL!).hostname;
if (host !== "127.0.0.1")
  throw new Error("This setup is for local development only.");
const email = (
  process.env.PMC_EMAIL ||
  process.env.ATELIER_EMAIL ||
  process.env.ADMIN_EMAIL
)?.toLowerCase();
const role = z
  .enum(AtelierAccountRole)
  .parse(process.env.PMC_ROLE || process.env.ATELIER_ROLE || "pmc");
const password =
  process.env.PMC_PASSWORD ||
  process.env.ATELIER_PASSWORD ||
  process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 8)
  throw new Error(
    "Set PMC_EMAIL and PMC_PASSWORD or the existing local ADMIN credentials.",
  );
try {
  const workspaceId = "atelier-local";
  await db.atelierWorkspace.upsert({
    where: { id: workspaceId },
    create: { id: workspaceId },
    update: {},
  });
  const user = await db.atelierUser.upsert({
    where: { email },
    create: {
      workspaceId,
      role,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      name: process.env.PMC_NAME || process.env.ATELIER_NAME || "PMC Admin",
    },
    update: {},
  });
  if (
    process.argv.includes("--with-demo-societies") &&
    !(await db.atelierSociety.count({ where: { workspaceId } }))
  ) {
    for (const seed of JSON.parse(
      fs.readFileSync("reference/atelier-demo-societies.json", "utf8"),
    )) {
      const { id, societyReference, lastUpdated, ...data } = seed;
      for (const a of data.projectAssignments)
        if (a.userId === "pmc-admin") a.userId = user.id;
      await createSociety(workspaceId, data);
    }
  }
  console.log("Local portal account ready:", email);
} finally {
  await db.$disconnect();
}
