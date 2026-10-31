import { db } from "../config/database.js";
import type { Actor } from "../types/context.js";
import { HttpError } from "../utils/http-error.js";
import {
  tenderSetupSchema,
  emptyTenderSetup,
} from "../validators/tender-setup.schema.js";
import {
  setupInclude,
  setupDto,
  setupRelations,
  createSetup,
} from "../repositories/tender-setup.repository.js";
import { audit } from "./audit.service.js";
export async function getSetup(organizationId: string) {
  const setup = await db.tenderSetup.findUnique({
    where: { organizationId },
    include: setupInclude,
  });
  return setup ? setupDto(setup) : emptyTenderSetup;
}
export async function saveSetup(actor: Actor, expected: number, body: unknown) {
  const input = tenderSetupSchema.parse(body);
  return db.$transaction(async (tx) => {
    if (expected === 0) {
      const created = await createSetup(tx, actor.organizationId, input);
      await audit(
        tx,
        actor,
        "created",
        "tender-form",
        created.id,
        "Tender Form setup",
      );
      return setupDto(created);
    }
    const changed = await tx.tenderSetup.updateMany({
      where: { organizationId: actor.organizationId, version: expected },
      data: { regulation: input.regulation, version: { increment: 1 } },
    });
    if (!changed.count)
      throw new HttpError(409, "Tender Form changed. Reload before saving.");
    const previous = await tx.tenderSetup.findUniqueOrThrow({
      where: { organizationId: actor.organizationId },
      include: setupInclude,
    });
    await tx.tenderSetupUnit.deleteMany({ where: { setupId: previous.id } });
    await tx.tenderSetupTerm.deleteMany({ where: { setupId: previous.id } });
    await tx.tenderSetupSection.deleteMany({ where: { setupId: previous.id } });
    const result = await tx.tenderSetup.update({
      where: { id: previous.id },
      data: setupRelations(input, previous),
      include: setupInclude,
    });
    await audit(
      tx,
      actor,
      "updated",
      "tender-form",
      result.id,
      "Tender Form setup",
    );
    return setupDto(result);
  });
}
