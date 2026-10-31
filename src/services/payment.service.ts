import { z } from "zod";
import { db } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/context.js";
import { paymentSchema } from "../validators/payment.schema.js";
import { HttpError } from "../utils/http-error.js";
import { getRecord } from "./record.service.js";
import {
  lockEntity,
  updateEntities,
} from "../repositories/entity.repository.js";
import { audit } from "./audit.service.js";
export async function recordPayment(
  actor: Actor,
  id: string,
  input: z.infer<typeof paymentSchema>,
) {
  return db.$transaction(async (tx) => {
    await lockEntity(tx, "invoices", actor.organizationId, id);
    const invoice = await getRecord(actor, "invoices", id, tx);
    if (!["Issued", "Part paid"].includes(invoice.status))
      throw new HttpError(400, "Issue the invoice before recording payment");
    const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
    if (amount.lte(0) || amount.gt(invoice.total.sub(invoice.paid)))
      throw new HttpError(400, "Payment exceeds the outstanding balance");
    await tx.payment.create({
      data: { ...input, invoiceId: id, amount, date: input.date || new Date() },
    });
    const paid = invoice.paid.add(amount);
    await updateEntities(
      tx,
      "invoices",
      actor.organizationId,
      { id },
      {
        paid,
        status: paid.eq(invoice.total) ? "Paid" : "Part paid",
        version: { increment: 1 },
      },
    );
    await audit(
      tx,
      actor,
      "recorded payment for",
      "invoices",
      id,
      invoice.title,
    );
    return getRecord(actor, "invoices", id, tx);
  });
}
