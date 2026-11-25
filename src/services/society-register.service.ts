import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { db } from "../config/database.js";
import { societyRef } from "./atelier-society.service.js";
import { HttpError } from "../utils/http-error.js";

export const categories = [
  "Society Registration Records",
  "Property & Title Records",
  "PMC Appointment Documents",
  "Survey & Feasibility Documents",
  "Meetings & Resolutions",
  "Developer Selection Records",
  "Development Agreements",
  "Statutory Approvals",
  "Construction Records",
  "Handover Documents",
] as const;
const short = z.string().trim().max(500);
const required = short.min(1);
const notes = z.string().trim().max(8000);
export const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();
export const unitKey = (wing: string, number: string) =>
  JSON.stringify([normalized(wing), normalized(number)]);
const area = z
  .string()
  .trim()
  .regex(
    /^(?:\d{1,12}(?:\.\d{1,4})?)?$/,
    "Enter an area in square feet with up to four decimal places.",
  );
export const premisesFields = z.strictObject({
  premisesNumber: required,
  wing: short.default(""),
  floor: short.default(""),
  premisesType: z
    .enum(["Residential", "Commercial", "Unspecified"])
    .default("Unspecified"),
  existingArea: area.default(""),
  proposedArea: area.default(""),
  status: z.enum(["Pending Review", "Verified"]).default("Pending Review"),
  members: z.array(required).max(100).default([]),
});
export function premisesData(row: z.output<typeof premisesFields>) {
  const { members, existingArea, proposedArea, status, ...fields } = row;
  return {
    ...fields,
    unitKey: unitKey(row.wing, row.premisesNumber),
    existingArea: existingArea || null,
    proposedArea: proposedArea || null,
    status:
      status === "Verified" ? ("Verified" as const) : ("Pending" as const),
  };
}
export const memberInclude = {
  members: {
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" as const },
  },
};
export function memberData(names: string[]) {
  const keys = new Set<string>();
  return names.map((name) => {
    const nameKey = normalized(name);
    if (keys.has(nameKey))
      throw new HttpError(400, "A member is listed twice for this premises.");
    keys.add(nameKey);
    return { name, nameKey };
  });
}
export function presentPremises(
  p: Prisma.PmcPremisesGetPayload<{ include: typeof memberInclude }>,
) {
  const { societyNumber, unitKey: _key, ...row } = p;
  return {
    ...row,
    societyId: societyRef(societyNumber),
    memberName: p.members.map((m) => m.name).join(", "),
    existingArea: p.existingArea?.toString() ?? "",
    proposedArea: p.proposedArea?.toString() ?? "",
    status: p.status === "Verified" ? "Verified" : "Pending Review",
  };
}
export const documentFields = z.strictObject({
  title: required,
  category: z.enum(categories),
  version: required.default("1.0"),
  remarks: notes.default(""),
  status: z
    .enum(["Pending Review", "Verified", "Needs Clarification"])
    .default("Pending Review"),
});
export const documentStatus = {
  "Pending Review": "Pending",
  Verified: "Verified",
  "Needs Clarification": "Clarification",
} as const;
export const documentSelect = {
  id: true,
  societyNumber: true,
  title: true,
  category: true,
  filename: true,
  version: true,
  remarks: true,
  status: true,
  uploadedBy: true,
  reviewedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;
export function presentDocument(
  d: Prisma.PmcDocumentGetPayload<{ select: typeof documentSelect }>,
) {
  const { societyNumber, ...row } = d;
  return {
    ...row,
    societyId: societyRef(societyNumber),
    fileType: d.filename.split(".").pop()?.toUpperCase(),
    uploadedDate: d.createdAt.toISOString().slice(0, 10),
    status:
      d.status === "Pending"
        ? "Pending Review"
        : d.status === "Clarification"
          ? "Needs Clarification"
          : "Verified",
  };
}
export const meetingFields = z.strictObject({
  meetingType: z.enum([
    "Managing Committee Meeting",
    "Special General Body Meeting",
    "Developer Presentation",
    "PMC Review Meeting",
    "Construction Progress Meeting",
  ]),
  date: z.iso
    .datetime({ local: true })
    .refine((s) => !s.endsWith("Z"), "Use local meeting time."),
  venue: required,
  agenda: notes.min(1),
  attendance: short.default(""),
  quorum: notes.default(""),
  minutesStatus: z
    .enum(["Not Started", "Draft", "Pending Review", "Recorded"])
    .default("Not Started"),
  resolutionStatus: z
    .enum([
      "Pending Review",
      "Draft",
      "Recorded for review",
      "Clarification Required",
    ])
    .default("Pending Review"),
  decisions: z
    .array(
      z.strictObject({
        decision: notes.min(1),
        votingSummary: notes.default(""),
      }),
    )
    .max(150)
    .default([]),
  removeAttachments: z.array(z.string()).max(20).default([]),
});
export const meetingInclude = {
  decisions: {
    select: { id: true, decision: true, votingSummary: true },
    orderBy: { position: "asc" as const },
  },
  attachments: {
    select: { id: true, name: true, type: true, size: true },
    orderBy: { id: "asc" as const },
  },
};
export function presentMeeting(
  m: Prisma.PmcMeetingGetPayload<{ include: typeof meetingInclude }>,
) {
  const { societyNumber, ...row } = m;
  return {
    ...row,
    societyId: societyRef(societyNumber),
    date: m.date.toISOString().slice(0, 16),
  };
}
export async function registerLists(workspaceId: string, number?: number) {
  const where = { society: { workspaceId }, societyNumber: number };
  const [premises, documents, meetings] = await Promise.all([
    db.pmcPremises.findMany({
      where,
      include: memberInclude,
      orderBy: [{ wing: "asc" }, { premisesNumber: "asc" }],
    }),
    db.pmcDocument.findMany({
      where,
      select: documentSelect,
      orderBy: { createdAt: "desc" },
    }),
    db.pmcMeeting.findMany({
      where,
      include: meetingInclude,
      orderBy: { date: "desc" },
    }),
  ]);
  return {
    premises: premises.map(presentPremises),
    documents: documents.map(presentDocument),
    meetings: meetings.map(presentMeeting),
  };
}
