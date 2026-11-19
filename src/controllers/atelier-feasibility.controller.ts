import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";
import {
  findSociety,
  societyNumber,
  societyRef,
} from "../services/atelier-society.service.js";
import { writeWorkbook } from "../services/atelier-workbook.service.js";

import {
  importSpreadsheet,
  exportSpreadsheet,
  type StoredStatement,
} from "../services/atelier-spreadsheet.service.js";
const metadata = {
  id: true,
  version: true,
  filename: true,
  consultant: true,
  preparedDate: true,
  status: true,
  remarks: true,
  createdAt: true,
} as const;
const statuses = {
  "Pending Review": "PENDING_REVIEW",
  Reviewed: "REVIEWED",
  Superseded: "SUPERSEDED",
} as const;
const society = (req: Request, res: Response) =>
  findSociety(res.locals.atelier.workspaceId, societyNumber(req.params.id));
export async function list(req: Request, res: Response) {
  const row = await society(req, res);
  res.json(
    await db.atelierRevision.findMany({
      where: { societyNumber: row.number },
      select: metadata,
      orderBy: { version: "desc" },
    }),
  );
}
export async function get(req: Request, res: Response) {
  const row = await society(req, res);
  const revision = await db.atelierRevision.findFirst({
    where: { societyNumber: row.number, id: String(req.params.revision) },
    select: { ...metadata, statement: true },
  });
  if (!revision) throw new HttpError(404, "Revision not found.");
  res.json(revision);
}
export async function upload(req: Request, res: Response) {
  const row = await society(req, res);
  if (!req.file) throw new HttpError(400, "Choose an Excel workbook.");
  const { statement, meta } = await importSpreadsheet(
    req.file.buffer,
    req.file.originalname,
  );
  const revision = await db.$transaction(async (tx) => {
    const { revisionCount } = await tx.atelierSociety.update({
      where: { number: row.number },
      data: { revisionCount: { increment: 1 } },
      select: { revisionCount: true },
    });
    return tx.atelierRevision.create({
      data: {
        societyNumber: row.number,
        uploadedById: res.locals.atelier.id,
        version: revisionCount,
        filename: req.file!.originalname.slice(0, 255),
        consultant: meta.consultant || res.locals.atelier.name,
        preparedDate: new Date(meta.preparedDate),
        status: statuses[meta.status],
        remarks: meta.remarks,
        statement,
      },
      select: metadata,
    });
  });
  res.status(201).json(revision);
}
export async function download(req: Request, res: Response) {
  const row = await society(req, res);
  const latest = await db.atelierRevision.findFirst({
    where: { societyNumber: row.number },
    orderBy: { version: "desc" },
  });
  const statement = latest?.statement as StoredStatement | undefined;
  const studyId =
    (statement?.format === 1 ? statement.studyId : undefined) ??
    String(req.query.layout || "mahim-fp37");
  const meta = latest
    ? {
        preparedDate: latest.preparedDate.toISOString().slice(0, 10),
        consultant: latest.consultant,
        status: (
          {
            PENDING_REVIEW: "Pending Review",
            REVIEWED: "Reviewed",
            SUPERSEDED: "Superseded",
          } as const
        )[latest.status],
        remarks: latest.remarks,
      }
    : undefined;
  const original = statement?.format === 2 ? statement : statement?.workbook;
  const file = original
    ? await exportSpreadsheet(
        original,
        statement?.format === 1 ? meta : undefined,
      )
    : await writeWorkbook(
        studyId,
        row.societyName + " — Feasibility report",
        statement?.format === 1 ? statement : undefined,
        meta,
      );
  res
    .attachment(
      societyRef(row.number) +
        "-" +
        (latest ? "revision-" + latest.version : "template") +
        ".xlsx",
    )
    .send(file);
}
export async function remarks(req: Request, res: Response) {
  const row = await society(req, res);
  const body = z
    .object({ remarks: z.string().max(8000), previous: z.string().max(8000) })
    .parse(req.body);
  const result = await db.atelierRevision.updateMany({
    where: {
      societyNumber: row.number,
      id: String(req.params.revision),
      remarks: body.previous,
    },
    data: { remarks: body.remarks },
  });
  if (!result.count)
    throw new HttpError(409, "This revision changed. Reopen it before saving.");
  res.sendStatus(204);
}
