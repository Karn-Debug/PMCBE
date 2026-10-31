import type { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import { tenderSetupSchema } from "../validators/tender-setup.schema.js";
export type TenderSetupInput = z.infer<typeof tenderSetupSchema>;
export const setupInclude = {
  unitTypes: { orderBy: { position: "asc" as const } },
  otherTerms: { orderBy: { position: "asc" as const } },
  sections: {
    orderBy: { position: "asc" as const },
    include: { rows: { orderBy: { position: "asc" as const } } },
  },
};
export type StoredSetup = Prisma.TenderSetupGetPayload<{
  include: typeof setupInclude;
}>;
export function setupDto(setup: StoredSetup) {
  const entry = ({
    id,
    name,
    sortOrder,
    type,
    status,
  }: StoredSetup["unitTypes"][number]) => ({
    id,
    name,
    sortOrder,
    type,
    status,
  });
  return {
    id: setup.id,
    organizationId: setup.organizationId,
    regulation: setup.regulation,
    version: setup.version,
    updatedAt: setup.updatedAt,
    unitTypes: setup.unitTypes.map(entry),
    otherTerms: setup.otherTerms.map(entry),
    sections: setup.sections.map(({ id, serial, title, rows }) => ({
      id,
      serial,
      title,
      rows: rows.map(({ id, serial, description, offer, remarks }) => ({
        id,
        serial,
        description,
        offer,
        remarks,
      })),
    })),
  };
}
export function setupRelations(
  input: TenderSetupInput,
  previous?: StoredSetup,
) {
  const created = new Map<string, Date>(
    [
      ...(previous?.unitTypes || []),
      ...(previous?.otherTerms || []),
      ...(previous?.sections || []),
      ...(previous?.sections.flatMap((s) => s.rows) || []),
    ].map((r) => [r.id, r.createdAt]),
  );
  const stamp = (id: string) =>
    created.has(id) ? { createdAt: created.get(id)! } : {};
  return {
    unitTypes: {
      create: input.unitTypes.map((r, position) => ({
        ...r,
        position,
        ...stamp(r.id),
      })),
    },
    otherTerms: {
      create: input.otherTerms.map((r, position) => ({
        ...r,
        position,
        ...stamp(r.id),
      })),
    },
    sections: {
      create: input.sections.map(({ rows, ...s }, position) => ({
        ...s,
        position,
        ...stamp(s.id),
        rows: {
          create: rows.map((r, position) => ({
            ...r,
            position,
            ...stamp(r.id),
          })),
        },
      })),
    },
  };
}
export function createSetup(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: TenderSetupInput,
) {
  return tx.tenderSetup.create({
    data: {
      organizationId,
      regulation: input.regulation,
      ...setupRelations(input),
    },
    include: setupInclude,
  });
}
