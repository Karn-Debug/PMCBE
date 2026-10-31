import type { Request, Response, NextFunction } from "express";
import { origins } from "../config/http.js";
import { HttpError } from "../utils/http-error.js";
export function checkOrigin(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    !origins.includes(req.headers.origin)
  )
    throw new HttpError(403, "Request origin is not allowed");
  next();
}
