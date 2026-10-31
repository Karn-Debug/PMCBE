import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "./http-error.js";
export function calculateTotals(
  items: Array<{ quantity: number; rate: number; tax: number }>,
  tds = 0,
  retention = 0,
) {
  const D = Prisma.Decimal;
  let amount = new D(0),
    tax = new D(0);
  for (const item of items) {
    const base = new D(item.quantity).mul(item.rate).toDecimalPlaces(2);
    amount = amount.add(base);
    tax = tax.add(base.mul(item.tax).div(100).toDecimalPlaces(2));
  }
  const withheld = amount
    .mul(tds)
    .div(100)
    .toDecimalPlaces(2)
    .add(amount.mul(retention).div(100).toDecimalPlaces(2));
  const total = amount.add(tax).sub(withheld);
  if (amount.gt("9999999999999999.99") || total.gt("9999999999999999.99"))
    throw new HttpError(400, "Invoice amount exceeds the supported maximum");
  if (total.lt(0))
    throw new HttpError(400, "Deductions exceed the invoice total");
  return { amount, total, tax, withheld };
}
