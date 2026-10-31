import "dotenv/config";
import fs from "node:fs/promises";
import { db } from "../src/config/database.js";
import { recordSchema } from "../src/validators/record.schema.js";
import type { Module } from "../src/constants/modules.js";
import {
  createEntity,
  findEntity,
} from "../src/repositories/entity.repository.js";
import type { Prisma } from "../src/generated/prisma/client.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Review reference imports in a local workspace first.");
const owner = await db.user.findUnique({
  where: { email: process.env.ADMIN_EMAIL || "" },
});
if (!owner) throw new Error("Seed the local owner account first.");
const reference = JSON.parse(
  await fs.readFile(
    new URL("../reference/legacy-reference.json", import.meta.url),
    "utf8",
  ),
);
let created = 0,
  skipped = 0;
function plain(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(?:p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
async function insert(module: Module, referenceId: string, payload: object) {
  const existing = await findEntity(db, module, owner!.organizationId, {
    reference: referenceId,
  });
  if (existing) {
    skipped++;
    return existing;
  }
  const p = recordSchema(module).parse(payload);
  const result = await db.$transaction((tx) =>
    createEntity(tx, module, owner!.organizationId, {
      ...p,
      reference: referenceId,
      data: JSON.parse(JSON.stringify(p.data)),
    }),
  );
  created++;
  return result;
}
for (const [i, p] of reference.permissions.entries()) {
  await insert("schemes", "LEGACY-PERM-" + String(i + 1).padStart(3, "0"), {
    title: p.title,
    status: p.status === "Inactive" ? "Inactive" : "Active",
    content:
      "Recovered from the legacy permission catalog on " +
      reference.capturedAt.slice(0, 10) +
      ". Original approval stage: " +
      (p.type || "not specified") +
      ".",
    data: {
      type: ["IOD", "CC", "OC"].includes(p.type) ? p.type : "Unclassified",
      scheme: p.schemes.join(" · ") || "Unspecified",
      documents: "",
    },
  });
}
for (const [i, t] of reference.templates.entries()) {
  const content = t.editors
    .map((e: { html: string }) => plain(e.html))
    .join("\n\n");
  await insert("templates", "LEGACY-TPL-" + String(i + 1).padStart(2, "0"), {
    title: "Legacy · " + t.title,
    status: "Draft",
    content,
    data: { category: t.category, header: "", footer: "", requirements: [] },
  });
}
const fields = reference.tenderFields as Array<{ name: string; value: string }>;
const sections = fields.filter((f) => /^header_name\[\d+\]$/.test(f.name));
const requirements = sections.flatMap((s) => {
  const index = s.name.match(/\[(\d+)\]/)![1];
  const list = (name: string) =>
    fields
      .filter((f) => f.name === name + "[" + index + "][]")
      .map((f) => f.value);
  const descriptions = list("description"),
    offers = list("regulation"),
    remarks = list("remark");
  return descriptions.map((description, i) => ({
    section: s.value,
    description,
    offer: offers[i] || "",
    remarks: remarks[i] || "",
  }));
});
await insert("templates", "LEGACY-TENDER-FORM", {
  title: "Legacy · Tender form",
  status: "Draft",
  content: requirements
    .map(
      (r, i) =>
        i +
        1 +
        ". " +
        r.section +
        "\n" +
        r.description +
        "\nOffer: " +
        r.offer +
        "\nRemarks: " +
        r.remarks,
    )
    .join("\n\n"),
  data: { category: "Tender form", header: "", footer: "", requirements },
});
const letterhead = await insert("templates", "LEGACY-LETTERHEAD", {
  title: "Legacy · Letterhead",
  status: "Draft",
  content:
    "Recovered header and footer images. Review the organization identity before using this letterhead.",
  data: { category: "Letterhead", header: "", footer: "", requirements: [] },
});
for (const name of ["header.png", "footer.png"]) {
  const existing = await db.file.findFirst({
    where: { entityId: letterhead.id, name },
  });
  if (existing) continue;
  const bytes = await fs.readFile(
    new URL("../reference/assets/" + name, import.meta.url),
  );
  if (bytes.subarray(1, 4).toString() !== "PNG")
    throw new Error("Expected PNG for " + name);
  await db.file.create({
    data: {
      organizationId: owner.organizationId,
      entityId: letterhead.id,
      name,
      mime: "image/png",
      size: bytes.length,
      bytes: new Uint8Array(bytes),
    },
  });
}
console.log(
  "Imported " +
    created +
    " reference records; preserved " +
    skipped +
    " existing records; " +
    requirements.length +
    " tender requirements.",
);
await db.$disconnect();
