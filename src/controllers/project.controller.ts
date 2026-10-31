import type { Request, Response } from "express";
import * as service from "../services/project.service.js";
import { param, version } from "../utils/request.js";
export async function list(req: Request, res: Response) {
  res.json(await service.listProjects(req.user.organizationId));
}
export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createProject(req.user, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(
    await service.updateProject(
      req.user,
      param(req, "id"),
      version(req),
      req.body,
    ),
  );
}
