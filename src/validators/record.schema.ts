import { z } from "zod";
import { statuses, type Module } from "../constants/modules.js";
import { date, text, money } from "./common.schema.js";
const line = z.object({
  description: text.min(1),
  quantity: z.coerce.number().positive().max(1000000),
  rate: money,
  tax: z.coerce.number().min(0).max(100),
});
const billing = z.object({
  developerName: text.default(""),
  items: z.array(line).min(1).max(200),
  tds: z.coerce.number().min(0).max(100).default(0),
  retention: z.coerce.number().min(0).max(100).default(0),
  terms: z.string().max(20000).default(""),
});
const dataSchemas: Record<Module, z.ZodType> = {
  tenders: z.object({
    regulation: text.default("33(9)"),
    unitTypes: z
      .array(z.object({ name: text }))
      .max(200)
      .default([]),
    otherTerms: z
      .array(z.object({ name: z.string().max(2000) }))
      .max(200)
      .default([]),
    requirements: z
      .array(
        z.object({
          section: text,
          sectionSerial: z.string().max(50).default(""),
          serial: z.string().max(50).default(""),
          description: z.string().max(5000),
          offer: z.string().max(2000),
          remarks: z.string().max(2000),
        }),
      )
      .max(300)
      .default([]),
    units: z.string().max(5000).default(""),
    terms: z.string().max(10000).default(""),
  }),
  quotes: z.object({
    developerName: text.min(2),
    amount: money,
    additionalArea: money.default(0),
    rent: money.default(0),
    corpus: money.default(0),
    completionMonths: z.coerce.number().int().min(1).max(240).default(36),
  }),
  "work-orders": billing,
  invoices: billing,
  permissions: z.object({
    type: z.enum(["IOD", "CC", "OC", "Unclassified"]),
    scheme: text.default("33(9)"),
    authority: text.default(""),
    expiry: date,
    flagged: z.boolean().default(false),
    documents: z.string().max(5000).default(""),
  }),
  tasks: z.object({ topic: text.default("General") }),
  topics: z.object({ members: z.array(text).default([]) }),
  documents: z.object({
    format: z.enum(["plain", "html"]).default("plain"),
    category: z
      .enum([
        "Legal",
        "Feasibility",
        "Drawing",
        "Society AGM",
        "Construction",
        "General",
      ])
      .default("General"),
    revision: text.default("1"),
  }),
  templates: z.object({
    format: z.enum(["plain", "html"]).default("plain"),
    requirements: z
      .array(
        z.object({
          section: z.string().max(600),
          description: z.string().max(5000),
          offer: z.string().max(2000),
          remarks: z.string().max(2000),
        }),
      )
      .max(300)
      .default([]),
    category: z.enum([
      "Work order",
      "Invoice",
      "Terms & conditions",
      "Legal draft",
      "Letterhead",
      "Tender form",
    ]),
    header: z.string().max(3000).default(""),
    footer: z.string().max(3000).default(""),
  }),
  feasibility: z.object({
    plotArea: money.default(0),
    fsi: z.coerce.number().min(0).max(30).default(1),
    saleRate: money.default(0),
    constructionRate: money.default(0),
    otherCost: money.default(0),
  }),
  meetings: z.object({
    location: text.default(""),
    attendees: z.string().max(2000).default(""),
    agenda: z.string().max(10000).default(""),
    minutes: z.string().max(20000).default(""),
  }),
  progress: z.object({
    percent: z.coerce.number().min(0).max(100),
    videoUrl: z
      .union([z.url().refine((s) => /^https?:/.test(s)), z.literal("")])
      .default(""),
  }),
  developers: z.object({
    email: z.union([z.email(), z.literal("")]).default(""),
    phone: text.default(""),
    contact: text.default(""),
    address: z.string().max(2000).default(""),
  }),
  schemes: z.object({
    type: z.enum(["IOD", "CC", "OC", "Unclassified"]),
    scheme: text,
    documents: z.string().max(10000).default(""),
  }),
};
export function recordSchema(module: Module) {
  return z
    .object({
      title: text.min(2),
      reference: text.nullable().optional(),
      status: z
        .string()
        .refine((v) => statuses[module].includes(v), "Invalid status"),
      projectId: z.string().nullable().optional(),
      parentId: z.string().nullable().optional(),
      assigneeId: z.string().nullable().optional(),
      priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
      dueDate: date,
      content: z.string().max(1500000).default(""),
      data: dataSchemas[module],
    })
    .strict();
}
