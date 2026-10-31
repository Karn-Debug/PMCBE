CREATE TABLE "TenderSetup" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "regulation" TEXT NOT NULL DEFAULT '33(9)',
 "unitTypes" JSONB NOT NULL DEFAULT '[]',
 "otherTerms" JSONB NOT NULL DEFAULT '[]',
 "sections" JSONB NOT NULL DEFAULT '[]',
 "version" INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "TenderSetup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenderSetup_organizationId_key" ON "TenderSetup"("organizationId");
ALTER TABLE "TenderSetup" ADD CONSTRAINT "TenderSetup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
