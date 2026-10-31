import { Prisma } from "../generated/prisma/client.js";
import { db } from "../config/database.js";
import { moduleKinds, type Module } from "../constants/modules.js";
import type { Actor } from "../types/context.js";
import { HttpError } from "../utils/http-error.js";
import { calculateTotals } from "../utils/money.js";
import { sanitizeDocument } from "../utils/document-html.js";
import { recordSchema } from "../validators/record.schema.js";
import { audit } from "./audit.service.js";
import * as records from "../repositories/entity.repository.js";

export function requireFinancialRole(actor: Actor, module: Module) {
  if (
    [
      "invoices",
      "work-orders",
      "quotes",
      "tenders",
      "templates",
      "developers",
      "schemes",
    ].includes(module) &&
    !["OWNER", "MANAGER"].includes(actor.role)
  )
    throw new HttpError(403, "A manager role is required");
}
export function parseRecord(module: Module, body: unknown) {
  const value = recordSchema(module).parse(body);
  const data = JSON.parse(JSON.stringify(value.data)) as Record<
    string,
    unknown
  >;
  let amount = new Prisma.Decimal(0),
    total = amount;
  if (module === "invoices" || module === "work-orders") {
    const billing = value.data as {
      items: Array<{ quantity: number; rate: number; tax: number }>;
      tds: number;
      retention: number;
    };
    ({ amount, total } = calculateTotals(
      billing.items,
      billing.tds,
      billing.retention,
    ));
  }
  if (module === "quotes") {
    amount = new Prisma.Decimal(Number(data.amount));
    total = amount;
  }
  const content =
    ["templates", "documents"].includes(module) && data.format === "html"
      ? sanitizeDocument(value.content)
      : value.content;
  return { ...value, content, data, amount, total };
}
async function validateRelations(
  tx: records.Database,
  actor: Actor,
  input: {
    projectId?: string | null;
    assigneeId?: string | null;
    parentId?: string | null;
  },
  module: Module,
) {
  const organizationId = actor.organizationId;
  if (
    input.projectId &&
    !(await tx.project.findFirst({
      where: { id: input.projectId, organizationId, archived: false },
    }))
  )
    throw new HttpError(400, "Project not found");
  if (
    input.assigneeId &&
    !(await tx.user.findFirst({
      where: { id: input.assigneeId, organizationId, active: true },
    }))
  )
    throw new HttpError(400, "Team member not found");
  if (input.parentId) {
    if (!["quotes", "invoices"].includes(module))
      throw new HttpError(400, "This module does not support parent records");
    const parent = await records.findEntity(
      tx,
      module === "quotes" ? "tenders" : "work-orders",
      organizationId,
      { id: input.parentId, archived: false },
    );
    if (!parent || parent.projectId !== (input.projectId || null))
      throw new HttpError(400, "Parent must belong to the same project");
  }
  if (module === "quotes" && !input.parentId)
    throw new HttpError(400, "Choose a tender for this quotation");
}
export async function getRecord(
  actor: Actor,
  module: Module,
  id: string,
  tx: records.Database = db,
) {
  const record = await records.findEntity(tx, module, actor.organizationId, {
    id,
    archived: false,
  });
  if (!record) throw new HttpError(404, "Record not found");
  return record;
}
export async function listRecords(
  actor: Actor,
  module: Module,
  input: records.EntityFilter & { page: number; limit: number },
) {
  const { page, limit, ...filter } = input;
  const [items, total] = await Promise.all([
    records.findEntities(db, module, actor.organizationId, filter, {
      skip: (page - 1) * limit,
      take: limit,
    }),
    records.countEntities(db, module, actor.organizationId, filter),
  ]);
  return { items, total, page };
}
export async function createRecord(
  actor: Actor,
  module: Module,
  body: unknown,
) {
  requireFinancialRole(actor, module);
  const input = parseRecord(module, body);
  if (module === "quotes" && input.status === "Accepted")
    throw new HttpError(400, "Use Award quotation to accept a proposal");
  if (module === "invoices" && ["Part paid", "Paid"].includes(input.status))
    throw new HttpError(400, "Record a payment to change payment status");
  return db.$transaction(async (tx) => {
    await validateRelations(tx, actor, input, module);
    const record = await records.createEntity(
      tx,
      module,
      actor.organizationId,
      input,
    );
    await audit(tx, actor, "created", module, record.id, record.title);
    return record;
  });
}
export async function updateRecord(
  actor: Actor,
  module: Module,
  id: string,
  expected: number,
  body: unknown,
) {
  requireFinancialRole(actor, module);
  const input = parseRecord(module, body);
  return db.$transaction(async (tx) => {
    await records.lockEntity(tx, module, actor.organizationId, id);
    const old = await getRecord(actor, module, id, tx);
    await validateRelations(tx, actor, input, module);
    if (
      module === "quotes" &&
      input.status === "Accepted" &&
      old.status !== "Accepted"
    )
      throw new HttpError(400, "Use Award quotation to accept a proposal");
    if (module === "quotes" && old.parentId !== (input.parentId || null))
      throw new HttpError(400, "A quotation cannot be moved to another tender");
    if (
      old.paid.gt(0) &&
      (input.amount.toString() !== old.amount.toString() ||
        input.total.toString() !== old.total.toString() ||
        input.projectId !== old.projectId ||
        input.status === "Cancelled")
    )
      throw new HttpError(
        400,
        "Paid records cannot be moved, cancelled, or have their amounts changed",
      );
    if (
      module === "invoices" &&
      ["Part paid", "Paid"].includes(input.status) &&
      input.status !== old.status
    )
      throw new HttpError(400, "Use Record payment to change payment status");
    if (module === "invoices" && old.paid.gt(0))
      input.status = old.paid.gte(old.total) ? "Paid" : "Part paid";
    const result = await records.updateEntities(
      tx,
      module,
      actor.organizationId,
      { id, version: expected, archived: false },
      { ...input, version: { increment: 1 } },
    );
    if (!result.count)
      throw new HttpError(409, "This record changed. Refresh before saving.");
    await audit(tx, actor, "updated", module, id, input.title);
    return getRecord(actor, module, id, tx);
  });
}
export async function archiveRecord(actor: Actor, module: Module, id: string) {
  await db.$transaction(async (tx) => {
    await records.lockEntity(tx, module, actor.organizationId, id);
    const old = await getRecord(actor, module, id, tx);
    if (old.paid.gt(0))
      throw new HttpError(400, "Records with payments must be retained");
    await records.updateEntities(
      tx,
      module,
      actor.organizationId,
      { id },
      { archived: true, version: { increment: 1 } },
    );
    await audit(tx, actor, "archived", module, id, old.title);
  });
  return { ok: true };
}
export async function restoreRecord(actor: Actor, module: Module, id: string) {
  const result = await records.updateEntities(
    db,
    module,
    actor.organizationId,
    { id, archived: true },
    { archived: false, version: { increment: 1 } },
  );
  if (!result.count) throw new HttpError(404, "Archived record not found");
  return { ok: true };
}
export async function addComment(
  actor: Actor,
  module: Module,
  id: string,
  content: string,
) {
  await getRecord(actor, module, id);
  const { entityId, ...comment } = await db.comment.create({
    data: { entityId: id, author: actor.name, content },
  });
  return { ...comment, recordId: entityId };
}
export async function allRecords(organizationId: string) {
  return (
    await Promise.all(
      (Object.keys(moduleKinds) as Module[]).map((module) =>
        records.findEntities(db, module, organizationId, { archived: false }),
      ),
    )
  ).flat();
}
