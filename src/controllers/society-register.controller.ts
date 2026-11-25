import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";
import {
  premisesFields,
  premisesData,
  memberData,
  memberInclude,
  presentPremises,
  documentFields,
  documentSelect,
  documentStatus,
  presentDocument,
  meetingFields,
  meetingInclude,
  presentMeeting,
  registerLists,
} from "../services/society-register.service.js";

export async function portfolio(_req: Request, res: Response) {
  res.json(await registerLists(res.locals.atelier.workspaceId));
}
const scope = (req: Request, res: Response) => ({
  id: String(req.params.recordId),
  societyNumber: Number(res.locals.societyNumber),
});
const version = (input: unknown) => new Date(z.iso.datetime().parse(input));
function payload(req: Request) {
  if (!req.is("multipart/form-data")) return req.body;
  try {
    return JSON.parse(z.string().parse(req.body?.record));
  } catch {
    throw new HttpError(400, "Include valid record details with the upload.");
  }
}
export async function listPremises(_req: Request, res: Response) {
  res.json(
    (
      await db.pmcPremises.findMany({
        where: { societyNumber: res.locals.societyNumber },
        include: memberInclude,
        orderBy: [{ wing: "asc" }, { premisesNumber: "asc" }],
      })
    ).map(presentPremises),
  );
}
export async function getPremises(req: Request, res: Response) {
  res.json(
    presentPremises(
      await db.pmcPremises.findUniqueOrThrow({
        where: scope(req, res),
        include: memberInclude,
      }),
    ),
  );
}
export async function savePremises(req: Request, res: Response) {
  const { updatedAt, ...body } = req.body ?? {};
  const row = premisesFields.parse(body),
    data = premisesData(row),
    members = memberData(row.members);
  const saved =
    req.method === "POST"
      ? await db.pmcPremises.create({
          data: {
            ...data,
            societyNumber: res.locals.societyNumber,
            members: { create: members },
          },
          include: memberInclude,
        })
      : await db.$transaction(async (tx) => {
          const where = { ...scope(req, res), updatedAt: version(updatedAt) };
          const unit = await tx.pmcPremises.update({
            where,
            data: { ...data, updatedAt: new Date() },
            include: { members: true },
          });
          await tx.pmcMember.deleteMany({
            where: {
              premisesId: unit.id,
              nameKey: { notIn: members.map((m) => m.nameKey) },
            },
          });
          for (const member of members)
            await tx.pmcMember.upsert({
              where: {
                premisesId_nameKey: {
                  premisesId: unit.id,
                  nameKey: member.nameKey,
                },
              },
              create: { ...member, premisesId: unit.id },
              update: { name: member.name },
            });
          return tx.pmcPremises.findUniqueOrThrow({
            where: { id: unit.id },
            include: memberInclude,
          });
        });
  res.status(req.method === "POST" ? 201 : 200).json(presentPremises(saved));
}
export async function listDocuments(_req: Request, res: Response) {
  res.json(
    (
      await db.pmcDocument.findMany({
        where: { societyNumber: res.locals.societyNumber },
        select: documentSelect,
        orderBy: { createdAt: "desc" },
      })
    ).map(presentDocument),
  );
}
export async function getDocument(req: Request, res: Response) {
  res.json(
    presentDocument(
      await db.pmcDocument.findUniqueOrThrow({
        where: scope(req, res),
        select: documentSelect,
      }),
    ),
  );
}
function attachment(file: Express.Multer.File, extensions: RegExp) {
  const name = file.originalname
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(-200);
  if (!name || !extensions.test(name) || !file.size)
    throw new HttpError(400, "Choose a non-empty file in a supported format.");
  return {
    name,
    bytes: new Uint8Array(file.buffer),
    size: file.size,
    type: file.mimetype,
  };
}
export async function saveDocument(req: Request, res: Response) {
  const { updatedAt, ...body } = payload(req) ?? {};
  const row = documentFields.parse(body);
  const upload =
    req.file && attachment(req.file, /\.(pdf|docx|xlsx|jpe?g|png)$/i);
  const file = upload
    ? { filename: upload.name, bytes: upload.bytes }
    : undefined;
  const data = { ...row, status: documentStatus[row.status] };
  const actor = res.locals.atelier.name;
  if (req.method === "POST") {
    if (!file) throw new HttpError(400, "Choose the document to upload.");
    const record = await db.pmcDocument.create({
      data: {
        ...data,
        ...file,
        societyNumber: res.locals.societyNumber,
        uploadedBy: actor,
        reviewedBy: row.status === "Pending Review" ? "" : actor,
      },
      select: documentSelect,
    });
    res.status(201).json(presentDocument(record));
    return;
  }
  res.json(
    presentDocument(
      await db.pmcDocument.update({
        where: { ...scope(req, res), updatedAt: version(updatedAt) },
        data: { ...data, ...file, reviewedBy: actor },
        select: documentSelect,
      }),
    ),
  );
}
export async function documentFile(req: Request, res: Response) {
  const f = await db.pmcDocument.findUniqueOrThrow({
    where: scope(req, res),
    select: { bytes: true, filename: true },
  });
  res
    .attachment(f.filename)
    .type("application/octet-stream")
    .send(Buffer.from(f.bytes));
}
export async function listMeetings(_req: Request, res: Response) {
  res.json(
    (
      await db.pmcMeeting.findMany({
        where: { societyNumber: res.locals.societyNumber },
        include: meetingInclude,
        orderBy: { date: "desc" },
      })
    ).map(presentMeeting),
  );
}
export async function getMeeting(req: Request, res: Response) {
  res.json(
    presentMeeting(
      await db.pmcMeeting.findUniqueOrThrow({
        where: scope(req, res),
        include: meetingInclude,
      }),
    ),
  );
}
export async function saveMeeting(req: Request, res: Response) {
  const { updatedAt, ...body } = payload(req) ?? {};
  const { date, decisions, removeAttachments, ...row } =
    meetingFields.parse(body);
  const files = (Array.isArray(req.files) ? req.files : []).map((f) =>
    attachment(f, /\.(pdf|mp4|webm|mov|m4v|avi|mkv|ogv|mpeg|mpg|3gp)$/i),
  );
  const data = { ...row, date: new Date(date + "Z") };
  const items = decisions.map((d, position) => ({ ...d, position }));
  const saved =
    req.method === "POST"
      ? await db.pmcMeeting.create({
          data: {
            ...data,
            societyNumber: res.locals.societyNumber,
            decisions: { create: items },
            attachments: { create: files },
          },
          include: meetingInclude,
        })
      : await db.pmcMeeting.update({
          where: { ...scope(req, res), updatedAt: version(updatedAt) },
          data: {
            ...data,
            decisions: { deleteMany: {}, create: items },
            attachments: {
              deleteMany: { id: { in: removeAttachments } },
              create: files,
            },
          },
          include: meetingInclude,
        });
  res.status(req.method === "POST" ? 201 : 200).json(presentMeeting(saved));
}
export async function meetingFile(req: Request, res: Response) {
  const f = await db.pmcMeetingFile.findFirstOrThrow({
    where: { id: String(req.params.fileId), meeting: scope(req, res) },
    select: { name: true, bytes: true },
  });
  res
    .attachment(f.name)
    .type("application/octet-stream")
    .send(Buffer.from(f.bytes));
}
export async function removePremises(req: Request, res: Response) {
  await db.pmcPremises.delete({ where: scope(req, res), select: { id: true } });
  res.sendStatus(204);
}
export async function removeDocument(req: Request, res: Response) {
  await db.pmcDocument.delete({ where: scope(req, res), select: { id: true } });
  res.sendStatus(204);
}
export async function removeMeeting(req: Request, res: Response) {
  await db.pmcMeeting.delete({ where: scope(req, res), select: { id: true } });
  res.sendStatus(204);
}
