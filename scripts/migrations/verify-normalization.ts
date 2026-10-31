import "dotenv/config";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { db } from "../../src/config/database.js";
import { Prisma } from "../../src/generated/prisma/client.js";
import { moduleKinds, type Module } from "../../src/constants/modules.js";
import { findEntities } from "../../src/repositories/entity.repository.js";
import { getSetup } from "../../src/services/tender-setup.service.js";
import { getOrganization } from "../../src/services/organization.service.js";
import { listProjects } from "../../src/services/project.service.js";
// Compares against the pre-migration snapshot. Extra defaults are allowed; existing values must match.
const snapshot = JSON.parse(
  await fs.readFile(".local/backups/before-relational-refactor.json", "utf8"),
);
function subset(actual: any, expected: any, path: string) {
  if (expected === null || typeof expected !== "object") {
    assert.deepEqual(actual, expected, path);
    return;
  }
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, path + " length");
    expected.forEach((v, i) => subset(actual[i], v, path + "[" + i + "]"));
    return;
  }
  for (const [key, value] of Object.entries(expected))
    subset(actual[key], value, path + "." + key);
}
function time(value: any) {
  if (!value) return null;
  return new Date(
    typeof value === "string" && !/[Z+]|-\d\d:\d\d$/.test(value.slice(10))
      ? value + "Z"
      : value,
  ).getTime();
}
try {
  let verified = 0;
  for (const org of snapshot.tables.Organization) {
    const organization = await getOrganization(org.id);
    subset(organization.profile, org.profile, "organization.profile");
    assert.equal(organization.name, org.name);
    for (const module of Object.keys(moduleKinds) as Module[]) {
      const current = await findEntities(db, module, org.id);
      const old = snapshot.tables.Record.filter(
        (r: any) =>
          r.organizationId === org.id && r.kind === moduleKinds[module],
      );
      assert.equal(current.length, old.length, module + " count");
      for (const original of old) {
        const record = current.find((r) => r.id === original.id)!;
        assert.ok(record, module + " " + original.id);
        for (const [key, value] of Object.entries(original)) {
          if (key === "data")
            subset(
              JSON.parse(JSON.stringify(record.data)),
              value,
              module + ".data",
            );
          else if (["amount", "total", "paid"].includes(key))
            assert.ok(
              new Prisma.Decimal(String(record[key])).eq(String(value)),
              module + "." + key,
            );
          else if (["createdAt", "updatedAt", "dueDate"].includes(key))
            assert.equal(time(record[key]), time(value), module + "." + key);
          else assert.deepEqual(record[key], value, module + "." + key);
        }
        verified++;
      }
    }
    const projects = await listProjects(org.id);
    for (const original of snapshot.tables.Project.filter(
      (p: any) => p.organizationId === org.id,
    )) {
      const project = projects.find((p) => p.id === original.id)!;
      subset(
        project.coordinators,
        original.coordinators,
        "project.coordinators",
      );
      assert.equal(time(project.updatedAt), time(original.updatedAt));
    }
    const oldSetup = snapshot.tables.TenderSetup.find(
      (s: any) => s.organizationId === org.id,
    );
    if (oldSetup) {
      const setup = await getSetup(org.id);
      for (const key of [
        "regulation",
        "version",
        "unitTypes",
        "otherTerms",
        "sections",
      ] as const)
        subset(setup[key], oldSetup[key], "TenderSetup." + key);
      assert.equal(time((setup as any).updatedAt), time(oldSetup.updatedAt));
    }
  }
  // Check unchanged binary attachments, sessions, audit entries, payments and invitations using SQL JSON.
  for (const table of [
    "Payment",
    "File",
    "Comment",
    "Invitation",
    "Audit",
    "Session",
    "User",
  ]) {
    const rows = await db.$queryRawUnsafe<Array<{ row: any }>>(
      `SELECT row_to_json(t) AS row FROM "${table}" t`,
    );
    for (const original of snapshot.tables[table]) {
      const actual = rows.find((r) => r.row.id === original.id)?.row;
      assert.ok(actual, table + " id");
      const alias =
        table === "Payment"
          ? "invoiceId"
          : table === "File" || table === "Comment"
            ? "entityId"
            : null;
      for (const [key, value] of Object.entries(original))
        assert.deepEqual(
          actual[key === "recordId" && alias ? alias : key],
          value,
          table + "." + key,
        );
    }
  }
  console.log(
    `Verified ${verified} records: IDs, values, timestamps, versions, archives, content, and relationships preserved.`,
  );
  console.log(
    "Verified organization/profile, projects/coordinators, Tender Form rows/catalogs, file bytes, payments, comments, users, sessions, invitations and audit history.",
  );
} finally {
  await db.$disconnect();
}
