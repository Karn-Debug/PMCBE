import type { Request, Response } from "express";
import { updateOrganization } from "../services/organization.service.js";
export async function update(req: Request, res: Response) {
  res.json(await updateOrganization(req.user.organizationId, req.body));
}
