import { z } from "zod";
export const date = z
  .union([z.iso.datetime(), z.iso.date()])
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => !v || !isNaN(v.getTime()), "Invalid date");
export const text = z.string().trim().max(600),
  money = z.coerce.number().finite().min(0).max(100000000000);
