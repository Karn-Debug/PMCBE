import type { Request, Response } from "express";
import * as service from "../services/dashboard.service.js";
export async function dashboard(req: Request, res: Response) {
  res.json(await service.dashboard(req.user.organizationId));
}
export async function activity(req: Request, res: Response) {
  res.json(await service.activity(req.user.organizationId));
}
