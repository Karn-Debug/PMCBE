import type { Request, Response } from "express";
import { z } from "zod";
import * as service from "../services/record.service.js";
import { recordPayment } from "../services/payment.service.js";
import { paymentSchema } from "../validators/payment.schema.js";
import { param, moduleOf, version } from "../utils/request.js";
import { HttpError } from "../utils/http-error.js";
const querySchema = z.object({
  q: z.string().max(200).optional(),
  projectId: z.string().optional(),
  parentId: z.string().optional(),
  status: z.string().optional(),
  category: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  archived: z.enum(["true", "false"]).optional(),
});
export async function list(req: Request, res: Response) {
  const input = querySchema.parse(req.query);
  res.json(
    await service.listRecords(req.user, moduleOf(param(req, "module")), {
      ...input,
      archived: input.archived === "true",
    }),
  );
}
export async function detail(req: Request, res: Response) {
  res.json(
    await service.getRecord(
      req.user,
      moduleOf(param(req, "module")),
      param(req, "id"),
    ),
  );
}
export async function create(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await service.createRecord(
        req.user,
        moduleOf(param(req, "module")),
        req.body,
      ),
    );
}
export async function update(req: Request, res: Response) {
  res.json(
    await service.updateRecord(
      req.user,
      moduleOf(param(req, "module")),
      param(req, "id"),
      version(req),
      req.body,
    ),
  );
}
export async function archive(req: Request, res: Response) {
  res.json(
    await service.archiveRecord(
      req.user,
      moduleOf(param(req, "module")),
      param(req, "id"),
    ),
  );
}
export async function restore(req: Request, res: Response) {
  res.json(
    await service.restoreRecord(
      req.user,
      moduleOf(param(req, "module")),
      param(req, "id"),
    ),
  );
}
export async function comment(req: Request, res: Response) {
  const { content } = z
    .object({ content: z.string().trim().min(1).max(5000) })
    .parse(req.body);
  res
    .status(201)
    .json(
      await service.addComment(
        req.user,
        moduleOf(param(req, "module")),
        param(req, "id"),
        content,
      ),
    );
}
export async function payment(req: Request, res: Response) {
  if (moduleOf(param(req, "module")) !== "invoices")
    throw new HttpError(400, "Payments are recorded against invoices");
  res
    .status(201)
    .json(
      await recordPayment(
        req.user,
        param(req, "id"),
        paymentSchema.parse(req.body),
      ),
    );
}
