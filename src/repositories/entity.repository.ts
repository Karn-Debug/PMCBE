import { Prisma } from "../generated/prisma/client.js";
import type { Module } from "../constants/modules.js";
import { entityMap, type FieldMapping } from "./entity-map.js";

export type Database = Prisma.TransactionClient;
type Values = Record<string, unknown>;
export interface StoredEntity extends Values {
  id: string;
  organizationId: string;
  kind: string;
  title: string;
  status: string;
  reference: string | null;
  projectId: string | null;
  assigneeId: string | null;
  priority: string;
  dueDate: Date | null;
  content: string;
  amount: Prisma.Decimal;
  total: Prisma.Decimal;
  paid: Prisma.Decimal;
  archived: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  entity?: { files: Values[]; comments: Values[] };
}
export interface EntityDto extends StoredEntity {
  parentId: string | null;
  data: Values;
  project: { id: string; name: string; code: string } | null;
  assignee: { id: string; name: string } | null;
  files: Values[];
  comments: Values[];
  payments: Values[];
}
interface Delegate {
  findMany(args: Values): Promise<StoredEntity[]>;
  findFirst(args: Values): Promise<StoredEntity | null>;
  create(args: Values): Promise<StoredEntity>;
  updateMany(args: Values): Promise<{ count: number }>;
  deleteMany(args: Values): Promise<{ count: number }>;
  upsert(args: Values): Promise<StoredEntity>;
  count(args: Values): Promise<number>;
}
// Prisma gives each model a different delegate signature. This one boundary describes
// their common CRUD subset; all request data is validated before reaching it.
function delegate(db: Database, name: string): Delegate {
  return (db as unknown as Record<string, Delegate>)[name];
}
const fileSelect = {
  id: true,
  name: true,
  mime: true,
  size: true,
  createdAt: true,
};
function relations(module: Module) {
  return {
    project: { select: { id: true, name: true, code: true } },
    assignee: { select: { id: true, name: true } },
    entity: {
      include: {
        files: { select: fileSelect },
        comments: { orderBy: { createdAt: "asc" } },
      },
    },
    ...Object.fromEntries(
      entityMap[module].children.map((c) => [
        c.api,
        { orderBy: { position: "asc" } },
      ]),
    ),
    ...(module === "invoices" ? { payments: true } : {}),
  };
}
function publicFields(row: Values, fields: FieldMapping[]) {
  return Object.fromEntries(
    fields.map((f) => [
      f.api,
      f.numeric ? Number(row[f.column]) : row[f.column],
    ]),
  );
}
const common = [
  "id",
  "organizationId",
  "kind",
  "projectId",
  "assigneeId",
  "title",
  "reference",
  "status",
  "priority",
  "dueDate",
  "content",
  "amount",
  "total",
  "paid",
  "archived",
  "version",
  "createdAt",
  "updatedAt",
];
export function toEntityDto(module: Module, row: StoredEntity): EntityDto {
  const map = entityMap[module];
  const data = publicFields(row, map.fields);
  for (const child of map.children)
    data[child.api] = ((row[child.api] || []) as Values[]).map((r) =>
      child.strings ? r.name : publicFields(r, child.fields),
    );
  return {
    ...(Object.fromEntries(
      common.map((key) => [key, row[key]]),
    ) as StoredEntity),
    parentId: map.parent ? (row[map.parent] as string | null) : null,
    data,
    project: row.project,
    assignee: row.assignee,
    files: row.entity?.files || [],
    comments: (row.entity?.comments || []).map(({ entityId, ...c }) => ({
      ...c,
      recordId: entityId,
    })),
    payments: ((row.payments || []) as Values[]).map(({ invoiceId, ...p }) => ({
      ...p,
      recordId: invoiceId,
    })),
  } as EntityDto;
}
function databaseFields(data: Values, fields: FieldMapping[]) {
  return Object.fromEntries(
    fields
      .filter((f) => data[f.api] !== undefined)
      .map((f) => [
        f.column,
        f.date && data[f.api] ? new Date(String(data[f.api])) : data[f.api],
      ]),
  );
}
function scalarData(module: Module, input: Values) {
  const map = entityMap[module];
  const result: Values = Object.fromEntries(
    common
      .filter(
        (k) =>
          !["id", "organizationId", "kind"].includes(k) &&
          input[k] !== undefined,
      )
      .map((k) => [k, input[k]]),
  );
  if (map.parent && input.parentId !== undefined)
    result[map.parent] = input.parentId;
  if (input.data)
    Object.assign(result, databaseFields(input.data as Values, map.fields));
  return result;
}
export interface EntityFilter {
  id?: string;
  projectId?: string;
  parentId?: string;
  status?: string;
  category?: string;
  reference?: string;
  q?: string;
  archived?: boolean;
  version?: number;
  excludeId?: string;
}
function whereFor(
  module: Module,
  organizationId: string,
  filter: EntityFilter,
) {
  const { parentId, category, q, excludeId, projectId, status, ...rest } =
    filter;
  const map = entityMap[module];
  return {
    organizationId,
    ...rest,
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(parentId
      ? map.parent
        ? { [map.parent]: parentId }
        : { id: { in: [] } }
      : {}),
    ...(category
      ? map.fields.some((f) => f.column === "category")
        ? { category }
        : { id: { in: [] } }
      : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
}
export async function findEntities(
  db: Database,
  module: Module,
  organizationId: string,
  filter: EntityFilter = {},
  page?: { skip: number; take: number },
) {
  const rows = await delegate(db, entityMap[module].delegate).findMany({
    where: whereFor(module, organizationId, filter),
    include: relations(module),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    ...page,
  });
  return rows.map((row) => toEntityDto(module, row));
}
export async function findEntity(
  db: Database,
  module: Module,
  organizationId: string,
  filter: EntityFilter,
) {
  const row = await delegate(db, entityMap[module].delegate).findFirst({
    where: whereFor(module, organizationId, filter),
    include: relations(module),
  });
  return row ? toEntityDto(module, row) : null;
}
export function countEntities(
  db: Database,
  module: Module,
  organizationId: string,
  filter: EntityFilter,
) {
  return delegate(db, entityMap[module].delegate).count({
    where: whereFor(module, organizationId, filter),
  });
}
export async function createEntity(
  db: Database,
  module: Module,
  organizationId: string,
  input: Values,
) {
  const map = entityMap[module];
  const identity = await db.entity.create({
    data: {
      organizationId,
      kind: map.kind as Prisma.EntityCreateInput["kind"],
      ...(input.id ? { id: String(input.id) } : {}),
    },
  });
  const data = (input.data as Values) || {};
  const children = Object.fromEntries(
    map.children.map((c) => [
      c.api,
      {
        create: ((data[c.api] || []) as unknown[]).map((r, position) => ({
          position,
          ...databaseFields(c.strings ? { name: r } : (r as Values), c.fields),
        })),
      },
    ]),
  );
  const row = await delegate(db, map.delegate).create({
    data: {
      ...scalarData(module, input),
      id: identity.id,
      organizationId,
      ...children,
    },
    include: relations(module),
  });
  return toEntityDto(module, row);
}
// Caller owns the transaction: the version check and child-row writes commit together.
export async function updateEntities(
  db: Database,
  module: Module,
  organizationId: string,
  filter: EntityFilter,
  input: Values,
) {
  const result = await delegate(db, entityMap[module].delegate).updateMany({
    where: whereFor(module, organizationId, filter),
    data: scalarData(module, input),
  });
  if (result.count && input.data && filter.id) {
    const data = input.data as Values;
    for (const c of entityMap[module].children) {
      if (!Array.isArray(data[c.api])) continue;
      const entries = data[c.api] as unknown[];
      const child = delegate(db, c.delegate);
      await child.deleteMany({
        where: { [c.owner]: filter.id, position: { gte: entries.length } },
      });
      for (const [position, value] of entries.entries()) {
        const fields = databaseFields(
          c.strings ? { name: value } : (value as Values),
          c.fields,
        );
        await child.upsert({
          where: {
            [c.owner + "_position"]: { [c.owner]: filter.id, position },
          },
          create: { [c.owner]: filter.id, position, ...fields },
          update: fields,
        });
      }
    }
  }
  return result;
}
export async function lockEntity(
  db: Database,
  module: Module,
  organizationId: string,
  id: string,
) {
  // Table names come only from the static map; values remain parameterized.
  const table = entityMap[module].table;
  await db.$queryRawUnsafe(
    `SELECT id FROM "${table}" WHERE id=$1 AND "organizationId"=$2 FOR UPDATE`,
    id,
    organizationId,
  );
}
