import "dotenv/config";
import {
  findEntity,
  updateEntities,
} from "../src/repositories/entity.repository.js";
import { createSetup } from "../src/repositories/tender-setup.repository.js";
import fs from "node:fs/promises";
import { db } from "../src/config/database.js";
import { sanitizeDocument } from "../src/utils/document-html.js";
import { tenderSetupSchema } from "../src/validators/tender-setup.schema.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Review imports locally before production use.");
const owner = await db.user.findUniqueOrThrow({
  where: { email: process.env.ADMIN_EMAIL || "" },
});
const r = JSON.parse(
  await fs.readFile(
    new URL("../reference/legacy-parity.json", import.meta.url),
    "utf8",
  ),
);
const fields = r.description as { name: string; value: string }[];
const sections = fields
  .filter((f) => /^header_name\[\d+\]$/.test(f.name))
  .map((h, i) => {
    const index = h.name.match(/\[(\d+)\]/)![1];
    const list = (name: string) =>
      fields
        .filter((f) => f.name === name + "[" + index + "][]")
        .map((f) => f.value);
    const descriptions = list("description"),
      serials = list("trans_work_srno"),
      offers = list("regulation"),
      remarks = list("remark");
    return {
      id: "legacy-section-" + i,
      serial:
        fields.find((f) => f.name === "header_srno[" + index + "]")?.value ||
        String(i + 1),
      title: h.value,
      rows: descriptions.map((description, j) => ({
        id: "legacy-row-" + i + "-" + j,
        serial: serials[j] || String(j + 1),
        description,
        offer: offers[j] || "",
        remarks: remarks[j] || "",
      })),
    };
  });
const catalog = (items: string[][], prefix: string) =>
  items
    .filter((i) => i[1])
    .map((v, i) => ({
      id: prefix + i,
      name: v[1],
      sortOrder: Number(v[2]) || i + 1,
      type: v[3] === "Global" ? "Global" : "Custom",
      status: v[4] === "Inactive" ? "Inactive" : "Active",
    }));
const input = tenderSetupSchema.parse({
  regulation: "33(9)",
  unitTypes: catalog(r.units, "unit-"),
  otherTerms: catalog(r.terms, "term-"),
  sections,
});
if (
  !(await db.tenderSetup.findUnique({
    where: { organizationId: owner.organizationId },
  }))
)
  await db.$transaction((tx) => createSetup(tx, owner.organizationId, input));
for (const [i, t] of r.templates.entries()) {
  const reference = "LEGACY-TPL-" + String(i + 1).padStart(2, "0");
  const record = await findEntity(db, "templates", owner.organizationId, {
    reference,
  });
  if (
    record &&
    record.version === 1 &&
    (record.data as Record<string, unknown>).format !== "html"
  )
    await db.$transaction((tx) =>
      updateEntities(
        tx,
        "templates",
        owner.organizationId,
        { id: record.id },
        {
          content: sanitizeDocument(t.html),
          data: { ...record.data, format: "html" },
        },
      ),
    );
}
console.log(
  "Tender Form: " +
    input.unitTypes.length +
    " unit types, " +
    input.otherTerms.length +
    " terms, " +
    input.sections.length +
    " sections / " +
    input.sections.reduce((n, s) => n + s.rows.length, 0) +
    " rows. Original rich templates restored where not edited.",
);
await db.$disconnect();
