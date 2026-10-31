import type { Request, Response } from "express";
import * as service from "../services/file.service.js";
import { param, moduleOf } from "../utils/request.js";
export async function upload(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await service.uploadFile(
        req.user,
        moduleOf(param(req, "module")),
        param(req, "id"),
        req.file,
      ),
    );
}
export async function preview(req: Request, res: Response) {
  const file = await service.getFile(req.user, param(req, "id"));
  const bytes = service.previewBytes(file);
  res.setHeader("Content-Type", file.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  res.send(bytes);
}
export async function download(req: Request, res: Response) {
  const file = await service.getFile(req.user, param(req, "id"));
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename*=UTF-8''" + encodeURIComponent(file.name),
  );
  res.send(Buffer.from(file.bytes));
}
