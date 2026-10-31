import { z } from "zod";
import { date } from "./common.schema.js";
const text = z.string().trim().max(600),
  money = z.coerce.number().finite().min(0).max(100000000000);
export const paymentSchema = z
  .object({
    amount: money.refine((n) => n > 0, "Enter a positive payment"),
    date,
    reference: text.min(2),
    method: z.enum(["Bank transfer", "UPI", "Cheque", "Cash"]),
  })
  .strict();
export const publicQuoteSchema = z
  .object({
    amount: money,
    additionalArea: money.default(0),
    rent: money.default(0),
    corpus: money.default(0),
    completionMonths: z.coerce.number().int().min(1).max(240),
    content: z.string().max(5000),
  })
  .strict();
