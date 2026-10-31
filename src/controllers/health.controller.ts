import type { Request, Response } from "express";
import { db } from "../config/database.js";
export async function health(_req: Request, res: Response) {
  await db.$queryRawUnsafe("SELECT 1");
  res.json({ status: "ok", database: "postgresql" });
}
