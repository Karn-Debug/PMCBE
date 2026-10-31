import type { Request, Response } from "express";
import * as service from "../services/team.service.js";
import { param } from "../utils/request.js";
export async function list(req: Request, res: Response) {
  res.json(await service.listTeam(req.user.organizationId));
}
export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createMember(req.user, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await service.updateMember(req.user, param(req, "id"), req.body));
}
