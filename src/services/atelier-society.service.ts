import { z } from "zod";
import type { AtelierSociety } from "../generated/prisma/client.js";
import { db } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";

const stageKeys = {
  "Society Enquiry": "SOCIETY_ENQUIRY",
  "PMC Appointment": "PMC_APPOINTMENT",
  "Document Collection & Surveys": "DOCUMENT_COLLECTION_AND_SURVEYS",
  "Feasibility Report": "FEASIBILITY_REPORT",
  "Society Meetings & Decisions": "SOCIETY_MEETINGS_AND_DECISIONS",
  "Developer Tendering": "DEVELOPER_TENDERING",
  "Developer Selection": "DEVELOPER_SELECTION",
  Agreements: "AGREEMENTS",
  "Statutory Approvals": "STATUTORY_APPROVALS",
  "Construction Monitoring": "CONSTRUCTION_MONITORING",
  "OC & Handover": "OC_AND_HANDOVER",
} as const;
const engagementKeys = {
  Active: "ACTIVE",
  Prospective: "PROSPECTIVE",
  "On hold": "ON_HOLD",
  Completed: "COMPLETED",
} as const;
const label = (map: Record<string, string>, key: string) =>
  Object.keys(map).find((name) => map[name] === key);
const short = z.string().trim().max(500);
const count = z.number().int().nonnegative().max(2147483647);
const date = z
  .union([z.iso.date(), z.literal("")])
  .transform((s) => (s ? new Date(s + "T00:00:00Z") : null));
const area = z
  .string()
  .max(32)
  .refine(
    (v) => !v || (/^\d+(\.\d+)?$/.test(v) && Number(v) > 0),
    "Enter a positive area.",
  );
const fields = z
  .object({
    societyName: short.min(3),
    city: short,
    projectStatus: z.enum(["Active", "Inactive"]),
    projectAssignments: z
      .array(
        z.object({
          userId: short.min(1),
          role: z.enum(["pmc", "liaisoner", "designer"]),
        }),
      )
      .max(200),
    numberOfUnits: count.nullable(),
    registrationDate: date,
    enquiryDate: date,
    appointmentDate: date,
    csNumber: short,
    googleMapsUrl: z.union([z.url({ protocol: /^https$/ }), z.literal("")]),
    occupiedSocietyArea: area,
    societyType: short,
    landTenure: short,
    committeeSize: short,
    secretaryName: short,
    treasurerName: short,
    architectName: short,
    locality: short,
    pmcManager: short,
    nextAction: z.string().max(8000),
    plotArea: area,
    societyRegistrationNumber: short,
    societyAddress: z.string().max(8000),
    primaryContactName: short,
    contactNumber: short,
    emailAddress: z.union([z.email(), z.literal("")]),
    ctsNumber: short,
    proposalNumber: z.string().trim().min(1).max(300).nullable(),
    planningAuthority: short,
    redevelopmentType: short,
    engagementReference: short,
    internalRemarks: z.string().max(8000),
    buildings: count,
    wings: count,
    residentialPremises: count,
    commercialPremises: count,
  })
  .partial()
  .extend({
    redevelopmentStage: z
      .enum(
        Object.keys(stageKeys) as [
          keyof typeof stageKeys,
          ...(keyof typeof stageKeys)[],
        ],
      )
      .transform((k) => stageKeys[k])
      .optional(),
    engagementStatus: z
      .enum(
        Object.keys(engagementKeys) as [
          keyof typeof engagementKeys,
          ...(keyof typeof engagementKeys)[],
        ],
      )
      .transform((k) => engagementKeys[k])
      .optional(),
  })
  .strict();
export function societyNumber(raw: unknown) {
  const m = /^SOC-(\d{4,10})$/.exec(String(raw));
  if (!m || Number(m[1]) > 2147483647)
    throw new HttpError(404, "Society not found.");
  return Number(m[1]);
}
export const societyRef = (n: number) => "SOC-" + String(n).padStart(4, "0");
export const newSocietyFields = fields.required({ societyName: true });
export function present(row: AtelierSociety) {
  const { number, workspaceId, revisionCount, updatedAt, createdAt, ...rest } =
    row;
  const id = societyRef(number);
  return {
    ...rest,
    id,
    societyReference: id,
    lastUpdated: updatedAt.toISOString().slice(0, 10),
    updatedAt: updatedAt.toISOString(),
    registrationDate: row.registrationDate?.toISOString().slice(0, 10) ?? "",
    appointmentDate: row.appointmentDate?.toISOString().slice(0, 10) ?? "",
    enquiryDate: row.enquiryDate?.toISOString().slice(0, 10) ?? "",
    engagementStatus: label(engagementKeys, row.engagementStatus),
    redevelopmentStage: label(stageKeys, row.redevelopmentStage),
  };
}
export async function findSociety(workspaceId: string, number: number) {
  const row = await db.atelierSociety.findFirst({
    where: { workspaceId, number },
  });
  if (!row) throw new HttpError(404, "Society not found.");
  return row;
}
export async function listSocieties(workspaceId: string) {
  return (
    await db.atelierSociety.findMany({
      where: { workspaceId },
      orderBy: { number: "asc" },
    })
  ).map(present);
}
export async function createSociety(workspaceId: string, input: unknown) {
  const data = newSocietyFields.parse(input);
  return present(
    await db.atelierSociety.create({ data: { ...data, workspaceId } }),
  );
}
export async function updateSocieties(workspaceId: string, input: unknown) {
  const changes = z
    .array(z.object({ id: z.string(), updatedAt: z.iso.datetime(), fields }))
    .min(1)
    .max(500)
    .parse(input);
  return db.$transaction(async (tx) => {
    const results = [];
    for (const change of [...changes].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const result = await tx.atelierSociety.updateManyAndReturn({
        where: {
          workspaceId,
          number: societyNumber(change.id),
          updatedAt: new Date(change.updatedAt),
        },
        data: change.fields,
      });
      if (!result[0])
        throw new HttpError(409, "The society changed. Refresh before saving.");
      results.push(present(result[0]));
    }
    return results;
  });
}
