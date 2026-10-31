import { z } from "zod";
import { date, text } from "./common.schema.js";
export const projectSchema = z
  .object({
    name: text.min(2),
    code: text.min(2).max(30),
    location: text.min(2),
    address: z.string().max(2000).default(""),
    city: text.default("Mumbai"),
    state: text.default("Maharashtra"),
    society: text.default(""),
    tower: text.default(""),
    status: z.enum(["Active", "On hold", "Completed"]).default("Active"),
    stage: z
      .enum([
        "Planning",
        "Feasibility",
        "Tendering",
        "Approvals",
        "Construction",
        "Handover",
      ])
      .default("Planning"),
    progress: z.coerce.number().int().min(0).max(100).default(0),
    startDate: date,
    targetDate: date,
    description: z.string().max(10000).default(""),
    coordinators: z
      .array(z.object({ name: text, mobile: text }))
      .max(50)
      .default([]),
  })
  .strict()
  .refine((p) => !p.startDate || !p.targetDate || p.targetDate >= p.startDate, {
    message: "Target date must be after the start date",
    path: ["targetDate"],
  });
