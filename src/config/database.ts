import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required. Run npm run setup:local or configure backend/.env.",
  );
export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
    enableChannelBinding: true,
  }),
});
