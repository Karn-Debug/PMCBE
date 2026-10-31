import type { Role } from "../generated/prisma/client.js";
export interface Actor {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
}
declare global {
  namespace Express {
    interface Request {
      user: Actor;
    }
  }
}
