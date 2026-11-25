-- CreateEnum
CREATE TYPE "PmcPremisesType" AS ENUM ('Residential', 'Commercial', 'Unspecified');

-- CreateEnum
CREATE TYPE "PmcVerification" AS ENUM ('Pending', 'Verified', 'Clarification');

-- CreateTable
CREATE TABLE "PmcPremises" (
    "id" TEXT NOT NULL,
    "societyNumber" INTEGER NOT NULL,
    "premisesNumber" TEXT NOT NULL,
    "wing" TEXT NOT NULL DEFAULT '',
    "unitKey" TEXT NOT NULL,
    "floor" TEXT NOT NULL DEFAULT '',
    "premisesType" "PmcPremisesType" NOT NULL DEFAULT 'Unspecified',
    "existingArea" DECIMAL(16,4),
    "proposedArea" DECIMAL(16,4),
    "status" "PmcVerification" NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmcPremises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmcMember" (
    "id" TEXT NOT NULL,
    "premisesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmcMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmcDocument" (
    "id" TEXT NOT NULL,
    "societyNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "status" "PmcVerification" NOT NULL DEFAULT 'Pending',
    "uploadedBy" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "filename" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmcDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmcMeeting" (
    "id" TEXT NOT NULL,
    "societyNumber" INTEGER NOT NULL,
    "meetingType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "attendance" TEXT NOT NULL DEFAULT '',
    "agenda" TEXT NOT NULL,
    "quorum" TEXT NOT NULL DEFAULT '',
    "minutesStatus" TEXT NOT NULL DEFAULT 'Not Started',
    "resolutionStatus" TEXT NOT NULL DEFAULT 'Pending Review',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmcMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmcDecision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "votingSummary" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PmcDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmcMeetingFile" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "PmcMeetingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmcRegisterImport" (
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmcRegisterImport_pkey" PRIMARY KEY ("workspaceId","scope","digest")
);

-- CreateIndex
CREATE UNIQUE INDEX "PmcPremises_societyNumber_unitKey_key" ON "PmcPremises"("societyNumber", "unitKey");

-- CreateIndex
CREATE UNIQUE INDEX "PmcMember_premisesId_nameKey_key" ON "PmcMember"("premisesId", "nameKey");

-- CreateIndex
CREATE INDEX "PmcDocument_societyNumber_createdAt_idx" ON "PmcDocument"("societyNumber", "createdAt");

-- CreateIndex
CREATE INDEX "PmcMeeting_societyNumber_date_idx" ON "PmcMeeting"("societyNumber", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PmcDecision_meetingId_position_key" ON "PmcDecision"("meetingId", "position");

-- CreateIndex
CREATE INDEX "PmcMeetingFile_meetingId_idx" ON "PmcMeetingFile"("meetingId");

-- AddForeignKey
ALTER TABLE "PmcPremises" ADD CONSTRAINT "PmcPremises_societyNumber_fkey" FOREIGN KEY ("societyNumber") REFERENCES "AtelierSociety"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmcMember" ADD CONSTRAINT "PmcMember_premisesId_fkey" FOREIGN KEY ("premisesId") REFERENCES "PmcPremises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmcDocument" ADD CONSTRAINT "PmcDocument_societyNumber_fkey" FOREIGN KEY ("societyNumber") REFERENCES "AtelierSociety"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmcMeeting" ADD CONSTRAINT "PmcMeeting_societyNumber_fkey" FOREIGN KEY ("societyNumber") REFERENCES "AtelierSociety"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmcDecision" ADD CONSTRAINT "PmcDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PmcMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmcMeetingFile" ADD CONSTRAINT "PmcMeetingFile_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PmcMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmcRegisterImport" ADD CONSTRAINT "PmcRegisterImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AtelierWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
