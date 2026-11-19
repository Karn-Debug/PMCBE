CREATE TYPE "AtelierAccountRole" AS ENUM ('pmc','liaisoner','designer');
ALTER TABLE "AtelierUser" ADD COLUMN "role" "AtelierAccountRole" NOT NULL DEFAULT 'pmc';
CREATE TABLE "AtelierReset" (
  "tokenHash" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "AtelierUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0
);
