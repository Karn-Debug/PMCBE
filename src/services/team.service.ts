import bcrypt from "bcryptjs";
import { db } from "../config/database.js";
import {
  teamCreateSchema,
  teamUpdateSchema,
} from "../validators/account.schema.js";
import type { Actor } from "../types/context.js";
import { HttpError } from "../utils/http-error.js";
import { audit } from "./audit.service.js";
const safeUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;
export function listTeam(organizationId: string) {
  return db.user.findMany({
    where: { organizationId },
    select: safeUser,
    orderBy: { createdAt: "asc" },
  });
}
export async function createMember(actor: Actor, body: unknown) {
  const { password, ...input } = teamCreateSchema.parse(body);
  return db.user.create({
    data: {
      ...input,
      organizationId: actor.organizationId,
      passwordHash: await bcrypt.hash(password, 12),
    },
    select: safeUser,
  });
}
export async function updateMember(actor: Actor, id: string, body: unknown) {
  const input = teamUpdateSchema.parse(body);
  const target = await db.user.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!target || target.role === "OWNER")
    throw new HttpError(400, "Owner access cannot be changed here");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: input });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, actor, "updated", "team", id, input.name);
  });
  return { ok: true };
}
