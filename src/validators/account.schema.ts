import { z } from "zod";
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  password: z.string().min(1).max(200),
});
export const passwordSchema = z
  .object({
    currentPassword: z.string().max(200),
    newPassword: z.string().min(12).max(200),
  })
  .strict();
export const teamCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().toLowerCase(),
    role: z.enum(["MANAGER", "MEMBER", "VIEWER"]),
    password: z.string().min(12).max(100),
  })
  .strict();
export const teamUpdateSchema = z
  .object({
    name: z.string().min(2).max(100),
    role: z.enum(["MANAGER", "MEMBER", "VIEWER"]),
    active: z.boolean(),
  })
  .strict();
export const organizationSchema = z
  .object({
    name: z.string().min(2).max(200),
    profile: z
      .object({
        email: z.union([z.email(), z.literal("")]),
        phone: z.string().max(50),
        address: z.string().max(2000),
        gstin: z.string().max(30),
        website: z.string().max(300),
        companySize: z.string().max(50),
      })
      .strict(),
  })
  .strict();
