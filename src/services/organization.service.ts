import { db } from "../config/database.js";
import { organizationSchema } from "../validators/account.schema.js";
import type { Prisma } from "../generated/prisma/client.js";
type OrganizationWithProfile = Prisma.OrganizationGetPayload<{
  include: { profile: true };
}>;
function toDto(org: OrganizationWithProfile) {
  const p = org.profile;
  return {
    ...org,
    profile: {
      email: p?.email || "",
      phone: p?.phone || "",
      address: p?.address || "",
      gstin: p?.gstin || "",
      website: p?.website || "",
      companySize: p?.companySize || "",
    },
  };
}
export async function getOrganization(id: string) {
  return toDto(
    await db.organization.findUniqueOrThrow({
      where: { id },
      include: { profile: true },
    }),
  );
}
export async function updateOrganization(id: string, body: unknown) {
  const { name, profile } = organizationSchema.parse(body);
  return toDto(
    await db.organization.update({
      where: { id },
      data: { name, profile: { upsert: { create: profile, update: profile } } },
      include: { profile: true },
    }),
  );
}
