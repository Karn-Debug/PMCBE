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
import { importFeasibilityPdf } from "../services/feasibility-pdf.service.js";
import {
  buildFeasibilityReport,
  type FeasibilityReport,
} from "../services/feasibility-report.service.js";
import { prepareReadingView } from "../services/feasibility-reading-view.js";

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
  const stored = revision.statement as unknown as StoredStatement & {
    report?: FeasibilityReport;
  };
  const workbook = stored.format === 2 ? stored : stored.workbook;
  if (workbook && stored.report?.version === 1 && !stored.report.readingView) {
    res.json({
      ...revision,
      statement: {
        ...stored,
        report: prepareReadingView(workbook, stored.report),
      },
    });
    return;
  }
  res.json(revision);
}
export async function upload(req: Request, res: Response) {
  const row = await society(req, res);
  if (!req.file)
    throw new HttpError(400, "Choose an Excel workbook or PDF report.");
  const { buffer, originalname } = req.file;
  if (!/\.(?:xls[xmb]?|pdf)$/i.test(originalname))
    throw new HttpError(400, "Choose an Excel workbook or PDF report.");
  const { statement: source, meta } = /\.pdf$/i.test(originalname)
    ? await importFeasibilityPdf(buffer, originalname)
    : await importSpreadsheet(buffer, originalname);
  const parsed = source as unknown as StoredStatement;
  const workbook = parsed.format === 2 ? parsed : parsed.workbook;
  if (!workbook)
    throw new HttpError(422, "The source worksheets could not be read.");
  // Existing Excel imports can still use the portal's worksheet view without an AI key.
  const statement = process.env.OPENAI_API_KEY?.trim()
    ? { ...source, report: await buildFeasibilityReport(workbook) }
    : source;
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
        filename: originalname.slice(0, 255),
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
