import { z } from "zod";
const entry = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(2000),
    sortOrder: z.number().int().min(0).max(9999),
    type: z.enum(["Global", "Custom"]),
    status: z.enum(["Active", "Inactive"]),
  })
  .strict();
const row = z
  .object({
    id: z.string().min(1).max(100),
    serial: z.string().max(50),
    description: z.string().max(10000),
    offer: z.string().max(5000),
    remarks: z.string().max(5000),
  })
  .strict();
const section = z
  .object({
    id: z.string().min(1).max(100),
    serial: z.string().max(50),
    title: z.string().max(2000),
    rows: z.array(row).max(300),
  })
  .strict();
export const tenderSetupSchema = z
  .object({
    regulation: z.enum(["33(8)", "33(9)"]),
    unitTypes: z.array(entry).max(200),
    otherTerms: z.array(entry).max(200),
    sections: z.array(section).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = [
      ...v.unitTypes,
      ...v.otherTerms,
      ...v.sections,
      ...v.sections.flatMap((s) => s.rows),
    ].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Each entry must have a unique identifier",
      });
    if (v.sections.reduce((n, s) => n + s.rows.length, 0) > 500)
      ctx.addIssue({
        code: "custom",
        message: "A tender form may contain at most 500 description rows",
      });
  });
export const emptyTenderSetup = {
  regulation: "33(9)",
  unitTypes: [],
  otherTerms: [],
  sections: [],
  version: 0,
};
