-- CreateEnum
CREATE TYPE "AtelierStage" AS ENUM ('Society Enquiry', 'PMC Appointment', 'Document Collection & Surveys', 'Feasibility Report', 'Society Meetings & Decisions', 'Developer Tendering', 'Developer Selection', 'Agreements', 'Statutory Approvals', 'Construction Monitoring', 'OC & Handover');

-- CreateEnum
CREATE TYPE "AtelierEngagement" AS ENUM ('Active', 'Prospective', 'On hold', 'Completed');

-- CreateEnum
CREATE TYPE "AtelierProjectStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "AtelierReview" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "AtelierWorkspace" (
    "id" TEXT NOT NULL,

    CONSTRAINT "AtelierWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelierUser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtelierUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelierSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtelierSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelierSociety" (
    "number" SERIAL NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "societyName" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Mumbai',
    "engagementStatus" "AtelierEngagement" NOT NULL DEFAULT 'Prospective',
    "redevelopmentStage" "AtelierStage" NOT NULL DEFAULT 'Society Enquiry',
    "projectStatus" "AtelierProjectStatus" NOT NULL DEFAULT 'Inactive',
    "projectAssignments" JSONB NOT NULL DEFAULT '[]',
    "registrationDate" DATE,
    "enquiryDate" DATE,
    "appointmentDate" DATE,
    "numberOfUnits" INTEGER,
    "csNumber" TEXT NOT NULL DEFAULT '',
    "googleMapsUrl" TEXT NOT NULL DEFAULT '',
    "occupiedSocietyArea" TEXT NOT NULL DEFAULT '',
    "societyType" TEXT NOT NULL DEFAULT '',
    "landTenure" TEXT NOT NULL DEFAULT '',
    "committeeSize" TEXT NOT NULL DEFAULT '',
    "secretaryName" TEXT NOT NULL DEFAULT '',
    "treasurerName" TEXT NOT NULL DEFAULT '',
    "architectName" TEXT NOT NULL DEFAULT '',
    "locality" TEXT NOT NULL DEFAULT '',
    "pmcManager" TEXT NOT NULL DEFAULT '',
    "nextAction" TEXT NOT NULL DEFAULT '',
    "plotArea" TEXT NOT NULL DEFAULT '',
    "societyRegistrationNumber" TEXT NOT NULL DEFAULT '',
    "societyAddress" TEXT NOT NULL DEFAULT '',
    "primaryContactName" TEXT NOT NULL DEFAULT '',
    "contactNumber" TEXT NOT NULL DEFAULT '',
    "emailAddress" TEXT NOT NULL DEFAULT '',
    "ctsNumber" TEXT NOT NULL DEFAULT '',
    "planningAuthority" TEXT NOT NULL DEFAULT '',
    "redevelopmentType" TEXT NOT NULL DEFAULT '',
    "engagementReference" TEXT NOT NULL DEFAULT '',
    "internalRemarks" TEXT NOT NULL DEFAULT '',
    "buildings" INTEGER NOT NULL DEFAULT 0,
    "wings" INTEGER NOT NULL DEFAULT 0,
    "residentialPremises" INTEGER NOT NULL DEFAULT 0,
    "commercialPremises" INTEGER NOT NULL DEFAULT 0,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtelierSociety_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "AtelierRevision" (
    "id" TEXT NOT NULL,
    "societyNumber" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "statement" JSONB NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "consultant" TEXT NOT NULL,
    "preparedDate" DATE NOT NULL,
    "status" "AtelierReview" NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtelierRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtelierUser_email_key" ON "AtelierUser"("email");

-- CreateIndex
CREATE INDEX "AtelierSession_userId_idx" ON "AtelierSession"("userId");

-- CreateIndex
CREATE INDEX "AtelierSession_expiresAt_idx" ON "AtelierSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AtelierSociety_workspaceId_number_idx" ON "AtelierSociety"("workspaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AtelierRevision_societyNumber_version_key" ON "AtelierRevision"("societyNumber", "version");

-- AddForeignKey
ALTER TABLE "AtelierUser" ADD CONSTRAINT "AtelierUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AtelierWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelierSession" ADD CONSTRAINT "AtelierSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AtelierUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelierSociety" ADD CONSTRAINT "AtelierSociety_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AtelierWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelierRevision" ADD CONSTRAINT "AtelierRevision_societyNumber_fkey" FOREIGN KEY ("societyNumber") REFERENCES "AtelierSociety"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelierRevision" ADD CONSTRAINT "AtelierRevision_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AtelierUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
