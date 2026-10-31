import { db } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import { allRecords } from "./record.service.js";
import { listProjects } from "./project.service.js";
export function activity(organizationId: string, take = 50) {
  return db.audit.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
export async function dashboard(organizationId: string) {
  const [projects, records, events] = await Promise.all([
    listProjects(organizationId),
    allRecords(organizationId),
    activity(organizationId, 8),
  ]);
  const invoices = records.filter(
    (r) => r.kind === "INVOICE" && !["Draft", "Cancelled"].includes(r.status),
  );
  const billed = invoices.reduce(
    (sum, r) => sum.add(r.total),
    new Prisma.Decimal(0),
  );
  const paid = invoices.reduce(
    (sum, r) => sum.add(r.paid),
    new Prisma.Decimal(0),
  );
  return {
    projects,
    records,
    activity: events,
    billed,
    paid,
    outstanding: billed.sub(paid),
  };
}
