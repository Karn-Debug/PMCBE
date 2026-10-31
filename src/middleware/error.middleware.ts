import type express from "express";
import { z } from "zod";
import multer from "multer";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../utils/http-error.js";
export const errorHandler = (
  error: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; "),
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "Files must be 15 MB or smaller"
          : "Upload failed",
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "This reference or email already exists" });
      return;
    }
    if (error.code === "P2034") {
      res
        .status(409)
        .json({ error: "A concurrent update occurred. Please retry." });
      return;
    }
  }
  console.error(error instanceof Error ? error.message : "Unknown error");
  res
    .status(500)
    .json({ error: "Unable to complete the request. Please retry." });
};
