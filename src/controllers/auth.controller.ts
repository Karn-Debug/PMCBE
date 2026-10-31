import type { Request, Response } from "express";
import * as service from "../services/auth.service.js";
import { getOrganization } from "../services/organization.service.js";
import { cookieOptions } from "../config/http.js";
export async function login(req: Request, res: Response) {
  const result = await service.login(req.body, req.cookies?.pmc_session);
  res.cookie("pmc_session", result.token, cookieOptions);
  res.json({ user: result.user });
}
export async function logout(req: Request, res: Response) {
  await service.logout(req.cookies?.pmc_session);
  res.clearCookie("pmc_session", { ...cookieOptions, maxAge: undefined });
  res.sendStatus(204);
}
export async function me(req: Request, res: Response) {
  res.json({
    user: req.user,
    organization: await getOrganization(req.user.organizationId),
  });
}
export async function password(req: Request, res: Response) {
  await service.changePassword(req.user, req.body);
  res.clearCookie("pmc_session", { ...cookieOptions, maxAge: undefined });
  res.json({ message: "Password changed. Sign in again." });
}
