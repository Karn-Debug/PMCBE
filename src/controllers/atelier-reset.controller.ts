import type { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";
import { hash } from "../utils/crypto.js";

function localResetCode() {
  const otp =
    process.env.PMC_LOCAL_RESET_OTP || process.env.ATELIER_LOCAL_RESET_OTP;
  const local = (host: string) =>
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (
    process.env.NODE_ENV !== "development" ||
    !local(process.env.HOST || "") ||
    !local(new URL(process.env.DATABASE_URL!).hostname) ||
    !otp ||
    !/^\d{6}$/.test(otp)
  )
    throw new HttpError(
      503,
      "Password recovery is unavailable in this environment.",
    );
  return otp;
}
export async function beginReset(req: Request, res: Response) {
  // localResetCode();
  const email = z.email().toLowerCase().parse(req.body?.email);
  const user = await db.atelierUser.findFirst({
    where: { email, active: true },
    select: { id: true },
  });
  const challenge = randomBytes(32).toString("hex");
  if (user) {
    const data = {
      tokenHash: hash(challenge),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      attempts: 0,
    };
    await db.atelierReset.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
  }
  res.json({ challenge });
}
export async function finishReset(req: Request, res: Response) {
  const expected = localResetCode();
  const { challenge, code, password } = z
    .object({
      challenge: z.string().regex(/^[a-f0-9]{64}$/),
      code: z.string().regex(/^\d{6}$/),
      password: z
        .string()
        .min(10)
        .max(72)
        .refine(
          (p) => Buffer.byteLength(p) <= 72,
          "Use at most 72 UTF-8 bytes.",
        ),
    })
    .parse(req.body);
  const validCode = timingSafeEqual(Buffer.from(code), Buffer.from(expected));
  const tokenHash = hash(challenge);
  const where = {
    tokenHash,
    expiresAt: { gt: new Date() },
    attempts: { lt: 5 },
    user: { active: true },
  };
  if (!validCode) {
    await db.atelierReset.updateMany({
      where,
      data: { attempts: { increment: 1 } },
    });
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const changed = await db.$transaction(async (tx) => {
      const entry = await tx.atelierReset.findFirst({ where });
      if (!entry || !(await tx.atelierReset.deleteMany({ where })).count)
        return false;
      await tx.atelierUser.update({
        where: { id: entry.userId },
        data: { passwordHash },
      });
      await tx.atelierSession.deleteMany({ where: { userId: entry.userId } });
      return true;
    });
    if (changed) {
      res.sendStatus(204);
      return;
    }
  }
  throw new HttpError(
    400,
    "The code is incorrect or expired. Try again or request a new code.",
  );
}
