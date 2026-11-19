import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "../config/database.js";
import { cookieOptions } from "../config/http.js";
import { hash } from "../utils/crypto.js";
import { HttpError } from "../utils/http-error.js";

// Keep previously issued sessions usable through the original API during rollout.
function sessionCookie(req: Request) {
  const legacy = req.baseUrl === "/api/atelier";
  return {
    cookie: legacy ? "atelier_session" : "pmc_session",
    options: { ...cookieOptions, path: legacy ? "/api/atelier" : "/api/pmc" },
  };
}
const publicFields = {
  role: true,
  id: true,
  email: true,
  name: true,
  workspaceId: true,
} as const;
export async function login(req: Request, res: Response) {
  const { cookie, options } = sessionCookie(req);
  const input = z
    .object({
      email: z.email().toLowerCase(),
      password: z.string().min(1).max(128),
    })
    .parse(req.body);
  const user = await db.atelierUser.findUnique({
    where: { email: input.email },
  });
  if (
    !user?.active ||
    !(await bcrypt.compare(input.password, user.passwordHash))
  )
    throw new HttpError(401, "Email or password is incorrect.");
  const token = randomBytes(32).toString("hex");
  await db.$transaction([
    db.atelierSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          { id: hash(req.cookies[cookie] || "") },
        ],
      },
    }),
    db.atelierSession.create({
      data: {
        id: hash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + options.maxAge),
      },
    }),
  ]);
  res.cookie(cookie, token, options).json({
    role: user.role,
    id: user.id,
    name: user.name,
    email: user.email,
    workspaceId: user.workspaceId,
  });
}
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { cookie } = sessionCookie(req);
  const token = req.cookies[cookie];
  if (typeof token !== "string")
    throw new HttpError(401, "Sign in to continue.");
  const session = await db.atelierSession.findFirst({
    where: {
      id: hash(token),
      expiresAt: { gt: new Date() },
      user: { active: true },
    },
    select: { user: { select: publicFields } },
  });
  if (!session)
    throw new HttpError(401, "Your session has expired. Sign in again.");
  res.locals.atelier = session.user;
  next();
}
export async function logout(req: Request, res: Response) {
  const { cookie, options } = sessionCookie(req);
  if (req.cookies[cookie])
    await db.atelierSession.deleteMany({
      where: { id: hash(req.cookies[cookie]) },
    });
  res
    .clearCookie(cookie, {
      path: options.path,
      secure: options.secure,
      httpOnly: true,
      sameSite: options.sameSite,
    })
    .sendStatus(204);
}
