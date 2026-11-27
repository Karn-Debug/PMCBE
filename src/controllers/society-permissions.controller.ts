import type { Request, Response } from "express";
import {
  findSociety,
  societyNumber,
} from "../services/atelier-society.service.js";
import {
  getProposalData,
  searchCitizenProjects,
} from "../services/society-permissions.service.js";
import { HttpError } from "../utils/http-error.js";

function society(req: Request, res: Response) {
  return findSociety(
    res.locals.atelier.workspaceId,
    societyNumber(req.params.id),
  );
}
export async function candidates(req: Request, res: Response) {
  const row = await society(req, res);
  if (row.proposalNumber)
    throw new HttpError(
      409,
      "This society already has a linked proposal. Reload its permissions.",
    );
  res.json(await searchCitizenProjects(req.body));
}
export async function project(req: Request, res: Response) {
  const row = await society(req, res);
  res.json(await getProposalData("search-projects", row.proposalNumber));
}
export async function structure(req: Request, res: Response) {
  const row = await society(req, res);
  res.json(await getProposalData("permissions", row.proposalNumber));
}
