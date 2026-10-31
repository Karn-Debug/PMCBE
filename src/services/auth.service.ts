import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "../config/database.js";
import { cookieOptions } from "../config/http.js";
import { hash } from "../utils/crypto.js";
import { HttpError } from "../utils/http-error.js";
import { loginSchema, passwordSchema } from "../validators/account.schema.js";
import type { Actor } from "../types/context.js";
import { audit } from "./audit.service.js";
export async function login(body: unknown, previousToken?: string) {
  const input = loginSchema.parse(body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  if (
    !user ||
    !user.active ||
    !(await bcrypt.compare(input.password, user.passwordHash))
  )
    throw new HttpError(401, "Email or password is incorrect");
  await logout(previousToken);
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: hash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + cookieOptions.maxAge),
    },
  });
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}
export async function logout(token?: string) {
  if (token) await db.session.deleteMany({ where: { id: hash(token) } });
}
export async function changePassword(actor: Actor, body: unknown) {
  const input = passwordSchema.parse(body);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
    throw new HttpError(400, "Current password is incorrect");
  if (input.currentPassword === input.newPassword)
    throw new HttpError(400, "Choose a different password");
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, actor, "changed password for", "team", user.id, user.name);
  });
}
