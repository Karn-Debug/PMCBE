import type { Request, Response } from "express";
import { z } from "zod";
import * as service from "../services/tender.service.js";
import { param } from "../utils/request.js";
export async function portal(req: Request, res: Response) {
  res.json(await service.getInvitation(param(req, "token")));
}
export async function submit(req: Request, res: Response) {
  res
    .status(201)
    .json(await service.submitQuotation(param(req, "token"), req.body));
}
export async function invite(req: Request, res: Response) {
  const { developerName } = z
    .object({ developerName: z.string().trim().min(2).max(200) })
    .parse(req.body);
  res
    .status(201)
    .json(
      await service.createInvitation(req.user, param(req, "id"), developerName),
    );
}
export async function award(req: Request, res: Response) {
  res.json(await service.awardQuotation(req.user, param(req, "id")));
}
