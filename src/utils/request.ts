import type { Request } from "express";
import { z } from "zod";
import { moduleKinds, type Module } from "../constants/modules.js";
import { HttpError } from "./http-error.js";
export const param = (req: Request, key: string) => String(req.params[key]);
export function moduleOf(value: string): Module {
  if (!Object.hasOwn(moduleKinds, value))
    throw new HttpError(404, "Module not found");
  return value as Module;
}
export const version = (req: Request) =>
  z.coerce.number().int().positive().parse(req.headers["if-match"]);
