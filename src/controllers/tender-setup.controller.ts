import type { Request, Response } from "express";
import { z } from "zod";
import * as service from "../services/tender-setup.service.js";
export async function get(req: Request, res: Response) {
  res.json(await service.getSetup(req.user.organizationId));
}
export async function save(req: Request, res: Response) {
  const expected = z.coerce
    .number()
    .int()
    .min(0)
    .parse(req.headers["if-match"]);
  res.json(await service.saveSetup(req.user, expected, req.body));
}
