import type { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/context.js";
export function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  title: string,
) {
  return tx.audit.create({
    data: {
      organizationId: actor.organizationId,
      actor: actor.name,
      action,
      entity,
      entityId,
      title,
    },
  });
}
