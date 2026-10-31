import { randomBytes } from "node:crypto";
import { db } from "../config/database.js";
import { origin } from "../config/http.js";
import type { Actor } from "../types/context.js";
import { hash } from "../utils/crypto.js";
import { HttpError } from "../utils/http-error.js";
import { publicQuoteSchema } from "../validators/payment.schema.js";
import {
  createEntity,
  findEntity,
  lockEntity,
  updateEntities,
} from "../repositories/entity.repository.js";
import { audit } from "./audit.service.js";
export async function getInvitation(token: string) {
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hash(token) },
    include: { tender: true },
  });
  if (
    !invitation ||
    invitation.expiresAt < new Date() ||
    invitation.tender.archived ||
    !["Floated", "Under review"].includes(invitation.tender.status)
  )
    throw new HttpError(404, "This invitation is invalid or expired");
  const tender = await findEntity(
    db,
    "tenders",
    invitation.tender.organizationId,
    { id: invitation.tenderId, archived: false },
  );
  if (!tender)
    throw new HttpError(404, "This invitation is invalid or expired");
  return {
    developerName: invitation.developerName,
    submitted: !!invitation.submittedAt,
    title: tender.title,
    project: tender.project?.name,
    dueDate: tender.dueDate,
    content: tender.content,
    data: tender.data,
  };
}
export async function submitQuotation(token: string, body: unknown) {
  const input = publicQuoteSchema.parse(body);
  await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash: hash(token) },
      include: { tender: true },
    });
    if (!invitation) throw new HttpError(404, "Invitation expired");
    await lockEntity(
      tx,
      "tenders",
      invitation.tender.organizationId,
      invitation.tenderId,
    );
    const tender = await tx.tender.findUniqueOrThrow({
      where: { id: invitation.tenderId },
    });
    if (
      invitation.expiresAt < new Date() ||
      tender.archived ||
      !["Floated", "Under review"].includes(tender.status)
    )
      throw new HttpError(404, "Invitation expired");
    if (invitation.submittedAt)
      throw new HttpError(409, "A quotation has already been submitted");
    if (tender.dueDate && tender.dueDate < new Date())
      throw new HttpError(400, "The tender deadline has passed");
    const changed = await tx.invitation.updateMany({
      where: { id: invitation.id, submittedAt: null },
      data: { submittedAt: new Date() },
    });
    if (changed.count !== 1) throw new HttpError(409, "Already submitted");
    const { content, ...data } = input;
    await createEntity(tx, "quotes", tender.organizationId, {
      projectId: tender.projectId,
      parentId: tender.id,
      title: invitation.developerName + " quotation",
      status: "Received",
      content,
      data: { ...data, developerName: invitation.developerName },
      amount: input.amount,
      total: input.amount,
    });
  });
  return { message: "Quotation received" };
}
export async function createInvitation(
  actor: Actor,
  id: string,
  developerName: string,
) {
  const tender = await findEntity(db, "tenders", actor.organizationId, {
    id,
    archived: false,
  });
  if (!tender || !["Floated", "Under review"].includes(tender.status))
    throw new HttpError(400, "Float the tender before creating invitations");
  const token = randomBytes(32).toString("hex");
  await db.invitation.create({
    data: {
      tenderId: id,
      developerName,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  return { url: origin + "/portal/" + token, expiresInDays: 7 };
}
export async function awardQuotation(actor: Actor, id: string) {
  await db.$transaction(async (tx) => {
    const quote = await findEntity(tx, "quotes", actor.organizationId, {
      id,
      archived: false,
    });
    if (!quote || !quote.parentId)
      throw new HttpError(404, "Quotation not found");
    await lockEntity(tx, "tenders", actor.organizationId, quote.parentId);
    const tender = await findEntity(tx, "tenders", actor.organizationId, {
      id: quote.parentId,
      archived: false,
    });
    if (!tender || ["Closed", "Draft"].includes(tender.status))
      throw new HttpError(400, "This tender is not open for an award");
    await updateEntities(
      tx,
      "quotes",
      actor.organizationId,
      { parentId: tender.id, status: "Accepted", excludeId: id },
      { status: "Rejected", version: { increment: 1 } },
    );
    const changed = await updateEntities(
      tx,
      "quotes",
      actor.organizationId,
      { id, archived: false },
      { status: "Accepted", version: { increment: 1 } },
    );
    if (!changed.count)
      throw new HttpError(409, "Quotation changed. Reload before awarding.");
    await updateEntities(
      tx,
      "tenders",
      actor.organizationId,
      { id: tender.id },
      { status: "Awarded", version: { increment: 1 } },
    );
    await audit(tx, actor, "awarded", "tenders", tender.id, tender.title);
  });
  return { ok: true };
}
