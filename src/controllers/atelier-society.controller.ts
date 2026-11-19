import type { Request, Response } from "express";
import {
  listSocieties,
  createSociety,
  updateSocieties,
  findSociety,
  societyNumber,
  present,
} from "../services/atelier-society.service.js";
export async function list(_req: Request, res: Response) {
  res.json(await listSocieties(res.locals.atelier.workspaceId));
}
export async function get(req: Request, res: Response) {
  res.json(
    present(
      await findSociety(
        res.locals.atelier.workspaceId,
        societyNumber(req.params.id),
      ),
    ),
  );
}
export async function create(req: Request, res: Response) {
  res
    .status(201)
    .json(await createSociety(res.locals.atelier.workspaceId, req.body));
}
export async function update(req: Request, res: Response) {
  res.json(await updateSocieties(res.locals.atelier.workspaceId, req.body));
}
