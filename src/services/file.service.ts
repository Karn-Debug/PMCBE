import { db } from "../config/database.js";
import type { Actor } from "../types/context.js";
import type { Module } from "../constants/modules.js";
import { moduleKinds } from "../constants/modules.js";
import { getRecord } from "./record.service.js";
import { HttpError } from "../utils/http-error.js";
const allowed = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/acad",
  "image/vnd.dwg",
  "application/octet-stream",
];
export async function uploadFile(
  actor: Actor,
  module: Module,
  id: string,
  file?: Express.Multer.File,
) {
  await getRecord(actor, module, id);
  if (!file) throw new HttpError(400, "Choose a file");
  if (!allowed.includes(file.mimetype))
    throw new HttpError(400, "This file format is not supported");
  return db.file.create({
    data: {
      organizationId: actor.organizationId,
      entityId: id,
      name: file.originalname
        .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
        .slice(0, 200),
      mime: file.mimetype,
      size: file.size,
      bytes: new Uint8Array(file.buffer),
    },
    select: { id: true, name: true, size: true, mime: true },
  });
}
export async function getFile(actor: Actor, id: string) {
  const file = await db.file.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { entity: { select: { kind: true } } },
  });
  if (!file) throw new HttpError(404, "File not found");
  const module = (Object.keys(moduleKinds) as Module[]).find(
    (m) => moduleKinds[m] === file.entity.kind,
  )!;
  await getRecord(actor, module, file.entityId);
  return file;
}
export function previewBytes(file: { bytes: Uint8Array; mime: string }) {
  const bytes = Buffer.from(file.bytes);
  const valid =
    (file.mime === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.mime === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (file.mime === "image/webp" &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP");
  if (!valid)
    throw new HttpError(
      400,
      "Only PNG, JPEG, and WebP images can be previewed",
    );
  return bytes;
}
