import type { Request, Response, NextFunction } from "express";
import type { Role } from "../generated/prisma/client.js";
import type {} from "../types/context.js";
import { db } from "../config/database.js";
import { hash } from "../utils/crypto.js";
import { HttpError } from "../utils/http-error.js";
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.pmc_session;
  if (!token) throw new HttpError(401, "Please sign in to continue");
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    throw new HttpError(401, "Your session has expired. Please sign in.");
  const { id, organizationId, email, name, role } = session.user;
  req.user = { id, organizationId, email, name, role };
  next();
}
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role))
      throw new HttpError(403, "Your role does not allow this action");
    next();
  };
export const managers = authorize("OWNER", "MANAGER");
export const writers = authorize("OWNER", "MANAGER", "MEMBER");
