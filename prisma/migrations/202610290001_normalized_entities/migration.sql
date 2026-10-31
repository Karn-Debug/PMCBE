-- Normalize module payloads while preserving all existing IDs and timestamps.
-- Apply during a maintenance window. The complete operation is atomic.
BEGIN;
SET LOCAL lock_timeout='15s';
SET LOCAL statement_timeout='5min';
LOCK TABLE "Organization","User","Session","Project","Record","Payment","File","Comment","Invitation","Audit","TenderSetup" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='TENDER' AND k <> ALL(ARRAY['regulation','units','terms','unitTypes','otherTerms','requirements']::text[])) THEN RAISE EXCEPTION 'Unrecognized Tender fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='QUOTE' AND k <> ALL(ARRAY['developerName','amount','additionalArea','rent','corpus','completionMonths']::text[])) THEN RAISE EXCEPTION 'Unrecognized Quotation fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='WORK_ORDER' AND k <> ALL(ARRAY['developerName','tds','retention','terms','items']::text[])) THEN RAISE EXCEPTION 'Unrecognized WorkOrder fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='INVOICE' AND k <> ALL(ARRAY['developerName','tds','retention','terms','items']::text[])) THEN RAISE EXCEPTION 'Unrecognized Invoice fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='PERMISSION' AND k <> ALL(ARRAY['type','scheme','authority','expiry','flagged','documents']::text[])) THEN RAISE EXCEPTION 'Unrecognized Permission fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='TASK' AND k <> ALL(ARRAY['topic']::text[])) THEN RAISE EXCEPTION 'Unrecognized Task fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='TOPIC' AND k <> ALL(ARRAY['members']::text[])) THEN RAISE EXCEPTION 'Unrecognized Topic fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='DOCUMENT' AND k <> ALL(ARRAY['format','category','revision']::text[])) THEN RAISE EXCEPTION 'Unrecognized Document fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='TEMPLATE' AND k <> ALL(ARRAY['format','category','header','footer','requirements']::text[])) THEN RAISE EXCEPTION 'Unrecognized Template fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='FEASIBILITY' AND k <> ALL(ARRAY['plotArea','fsi','saleRate','constructionRate','otherCost']::text[])) THEN RAISE EXCEPTION 'Unrecognized Feasibility fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='MEETING' AND k <> ALL(ARRAY['location','attendees','agenda','minutes']::text[])) THEN RAISE EXCEPTION 'Unrecognized Meeting fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='PROGRESS' AND k <> ALL(ARRAY['percent','videoUrl']::text[])) THEN RAISE EXCEPTION 'Unrecognized ProgressUpdate fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='DEVELOPER' AND k <> ALL(ARRAY['email','phone','contact','address']::text[])) THEN RAISE EXCEPTION 'Unrecognized Developer fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Record" r, LATERAL jsonb_object_keys(r.data) k WHERE r.kind='SCHEME' AND k <> ALL(ARRAY['type','scheme','documents']::text[])) THEN RAISE EXCEPTION 'Unrecognized PermissionScheme fields: review data before normalization'; END IF; END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Organization" o,LATERAL jsonb_object_keys(o.profile) k WHERE k <> ALL(ARRAY['email','phone','address','gstin','website','companySize'])) THEN RAISE EXCEPTION 'Unrecognized organization profile fields'; END IF;
 IF EXISTS (SELECT 1 FROM "Record" WHERE "parentId" IS NOT NULL AND kind NOT IN ('QUOTE','INVOICE')) THEN RAISE EXCEPTION 'Unexpected record parent; review before migration'; END IF;
END $$;
CREATE SCHEMA "legacy_normalization";
ALTER TABLE "Organization" SET SCHEMA "legacy_normalization";
ALTER TABLE "User" SET SCHEMA "legacy_normalization";
ALTER TABLE "Session" SET SCHEMA "legacy_normalization";
ALTER TABLE "Project" SET SCHEMA "legacy_normalization";
ALTER TABLE "Record" SET SCHEMA "legacy_normalization";
ALTER TABLE "Payment" SET SCHEMA "legacy_normalization";
ALTER TABLE "File" SET SCHEMA "legacy_normalization";
ALTER TABLE "Comment" SET SCHEMA "legacy_normalization";
ALTER TABLE "Invitation" SET SCHEMA "legacy_normalization";
ALTER TABLE "Audit" SET SCHEMA "legacy_normalization";
ALTER TABLE "TenderSetup" SET SCHEMA "legacy_normalization";
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";



-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "companySize" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT 'Mumbai',
    "state" TEXT NOT NULL DEFAULT 'Maharashtra',
    "society" TEXT NOT NULL DEFAULT '',
    "tower" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "stage" TEXT NOT NULL DEFAULT 'Planning',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCoordinator" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCoordinator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'TENDER',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "regulation" TEXT NOT NULL DEFAULT '33(9)',
    "units" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'QUOTE',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "developerName" TEXT NOT NULL DEFAULT '',
    "quotedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "additionalArea" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "corpus" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "completionMonths" INTEGER NOT NULL DEFAULT 36,
    "tenderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'WORK_ORDER',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "developerName" TEXT NOT NULL DEFAULT '',
    "tds" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retention" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "terms" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'INVOICE',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "developerName" TEXT NOT NULL DEFAULT '',
    "tds" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retention" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "terms" TEXT NOT NULL DEFAULT '',
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'PERMISSION',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL,
    "scheme" TEXT NOT NULL DEFAULT '33(9)',
    "authority" TEXT NOT NULL DEFAULT '',
    "expiry" TIMESTAMP(3),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "documents" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'TASK',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "topic" TEXT NOT NULL DEFAULT 'General',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'TOPIC',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'DOCUMENT',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "format" TEXT NOT NULL DEFAULT 'plain',
    "category" TEXT NOT NULL DEFAULT 'General',
    "revision" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'TEMPLATE',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "format" TEXT NOT NULL DEFAULT 'plain',
    "category" TEXT NOT NULL,
    "header" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feasibility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'FEASIBILITY',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "plotArea" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fsi" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "saleRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "constructionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feasibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'MEETING',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT NOT NULL DEFAULT '',
    "attendees" TEXT NOT NULL DEFAULT '',
    "agenda" TEXT NOT NULL DEFAULT '',
    "minutes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressUpdate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'PROGRESS',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "percent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'DEVELOPER',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionScheme" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL DEFAULT 'SCHEME',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "content" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "documents" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderUnitType" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderUnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderTerm" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderRequirement" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "sectionSerial" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderItem" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMember" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRequirement" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "developerName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderSetup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regulation" TEXT NOT NULL DEFAULT '33(9)',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderSetupUnit" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderSetupUnit_pkey" PRIMARY KEY ("setupId","id")
);

-- CreateTable
CREATE TABLE "TenderSetupTerm" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderSetupTerm_pkey" PRIMARY KEY ("setupId","id")
);

-- CreateTable
CREATE TABLE "TenderSetupSection" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderSetupSection_pkey" PRIMARY KEY ("setupId","id")
);

-- CreateTable
CREATE TABLE "TenderSetupRow" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderSetupRow_pkey" PRIMARY KEY ("setupId","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_organizationId_key" ON "User"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Project_organizationId_archived_idx" ON "Project"("organizationId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_organizationId_key" ON "Project"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCoordinator_projectId_position_key" ON "ProjectCoordinator"("projectId", "position");

-- CreateIndex
CREATE INDEX "Entity_organizationId_kind_idx" ON "Entity"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_id_organizationId_kind_key" ON "Entity"("id", "organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_id_organizationId_key" ON "Entity"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Tender_organizationId_archived_createdAt_idx" ON "Tender"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Tender_projectId_idx" ON "Tender"("projectId");

-- CreateIndex
CREATE INDEX "Tender_assigneeId_idx" ON "Tender"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_id_organizationId_key" ON "Tender"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_organizationId_reference_key" ON "Tender"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_id_organizationId_kind_key" ON "Tender"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_archived_createdAt_idx" ON "Quotation"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Quotation_projectId_idx" ON "Quotation"("projectId");

-- CreateIndex
CREATE INDEX "Quotation_assigneeId_idx" ON "Quotation"("assigneeId");

-- CreateIndex
CREATE INDEX "Quotation_tenderId_idx" ON "Quotation"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_id_organizationId_key" ON "Quotation"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_organizationId_reference_key" ON "Quotation"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_id_organizationId_kind_key" ON "Quotation"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_archived_createdAt_idx" ON "WorkOrder"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrder_projectId_idx" ON "WorkOrder"("projectId");

-- CreateIndex
CREATE INDEX "WorkOrder_assigneeId_idx" ON "WorkOrder"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_id_organizationId_key" ON "WorkOrder"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organizationId_reference_key" ON "WorkOrder"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_id_organizationId_kind_key" ON "WorkOrder"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_archived_createdAt_idx" ON "Invoice"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_assigneeId_idx" ON "Invoice"("assigneeId");

-- CreateIndex
CREATE INDEX "Invoice_workOrderId_idx" ON "Invoice"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_organizationId_key" ON "Invoice"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_reference_key" ON "Invoice"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_organizationId_kind_key" ON "Invoice"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Permission_organizationId_archived_createdAt_idx" ON "Permission"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Permission_projectId_idx" ON "Permission"("projectId");

-- CreateIndex
CREATE INDEX "Permission_assigneeId_idx" ON "Permission"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_id_organizationId_key" ON "Permission"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_organizationId_reference_key" ON "Permission"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_id_organizationId_kind_key" ON "Permission"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Task_organizationId_archived_createdAt_idx" ON "Task"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_organizationId_key" ON "Task"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_reference_key" ON "Task"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_organizationId_kind_key" ON "Task"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Topic_organizationId_archived_createdAt_idx" ON "Topic"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Topic_projectId_idx" ON "Topic"("projectId");

-- CreateIndex
CREATE INDEX "Topic_assigneeId_idx" ON "Topic"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_id_organizationId_key" ON "Topic"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_organizationId_reference_key" ON "Topic"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_id_organizationId_kind_key" ON "Topic"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Document_organizationId_archived_createdAt_idx" ON "Document"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_assigneeId_idx" ON "Document"("assigneeId");

-- CreateIndex
CREATE INDEX "Document_organizationId_category_archived_idx" ON "Document"("organizationId", "category", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_organizationId_key" ON "Document"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_reference_key" ON "Document"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_organizationId_kind_key" ON "Document"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Template_organizationId_archived_createdAt_idx" ON "Template"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Template_projectId_idx" ON "Template"("projectId");

-- CreateIndex
CREATE INDEX "Template_assigneeId_idx" ON "Template"("assigneeId");

-- CreateIndex
CREATE INDEX "Template_organizationId_category_archived_idx" ON "Template"("organizationId", "category", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Template_id_organizationId_key" ON "Template"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_organizationId_reference_key" ON "Template"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Template_id_organizationId_kind_key" ON "Template"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Feasibility_organizationId_archived_createdAt_idx" ON "Feasibility"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Feasibility_projectId_idx" ON "Feasibility"("projectId");

-- CreateIndex
CREATE INDEX "Feasibility_assigneeId_idx" ON "Feasibility"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Feasibility_id_organizationId_key" ON "Feasibility"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Feasibility_organizationId_reference_key" ON "Feasibility"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Feasibility_id_organizationId_kind_key" ON "Feasibility"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_archived_createdAt_idx" ON "Meeting"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- CreateIndex
CREATE INDEX "Meeting_assigneeId_idx" ON "Meeting"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_id_organizationId_key" ON "Meeting"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_organizationId_reference_key" ON "Meeting"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_id_organizationId_kind_key" ON "Meeting"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "ProgressUpdate_organizationId_archived_createdAt_idx" ON "ProgressUpdate"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressUpdate_projectId_idx" ON "ProgressUpdate"("projectId");

-- CreateIndex
CREATE INDEX "ProgressUpdate_assigneeId_idx" ON "ProgressUpdate"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressUpdate_id_organizationId_key" ON "ProgressUpdate"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressUpdate_organizationId_reference_key" ON "ProgressUpdate"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressUpdate_id_organizationId_kind_key" ON "ProgressUpdate"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "Developer_organizationId_archived_createdAt_idx" ON "Developer"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "Developer_projectId_idx" ON "Developer"("projectId");

-- CreateIndex
CREATE INDEX "Developer_assigneeId_idx" ON "Developer"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Developer_id_organizationId_key" ON "Developer"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Developer_organizationId_reference_key" ON "Developer"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Developer_id_organizationId_kind_key" ON "Developer"("id", "organizationId", "kind");

-- CreateIndex
CREATE INDEX "PermissionScheme_organizationId_archived_createdAt_idx" ON "PermissionScheme"("organizationId", "archived", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionScheme_projectId_idx" ON "PermissionScheme"("projectId");

-- CreateIndex
CREATE INDEX "PermissionScheme_assigneeId_idx" ON "PermissionScheme"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionScheme_id_organizationId_key" ON "PermissionScheme"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionScheme_organizationId_reference_key" ON "PermissionScheme"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionScheme_id_organizationId_kind_key" ON "PermissionScheme"("id", "organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TenderUnitType_tenderId_position_key" ON "TenderUnitType"("tenderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TenderTerm_tenderId_position_key" ON "TenderTerm"("tenderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TenderRequirement_tenderId_position_key" ON "TenderRequirement"("tenderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderItem_workOrderId_position_key" ON "WorkOrderItem"("workOrderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_invoiceId_position_key" ON "InvoiceItem"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMember_topicId_position_key" ON "TopicMember"("topicId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRequirement_templateId_position_key" ON "TemplateRequirement"("templateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceId_reference_key" ON "Payment"("invoiceId", "reference");

-- CreateIndex
CREATE INDEX "File_entityId_idx" ON "File"("entityId");

-- CreateIndex
CREATE INDEX "File_organizationId_idx" ON "File"("organizationId");

-- CreateIndex
CREATE INDEX "Comment_entityId_createdAt_idx" ON "Comment"("entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tenderId_idx" ON "Invitation"("tenderId");

-- CreateIndex
CREATE INDEX "Audit_organizationId_createdAt_idx" ON "Audit"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSetup_organizationId_key" ON "TenderSetup"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSetupUnit_setupId_position_key" ON "TenderSetupUnit"("setupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSetupTerm_setupId_position_key" ON "TenderSetupTerm"("setupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSetupSection_setupId_position_key" ON "TenderSetupSection"("setupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TenderSetupRow_setupId_sectionId_position_key" ON "TenderSetupRow"("setupId", "sectionId", "position");

-- AddForeignKey
ALTER TABLE "OrganizationProfile" ADD CONSTRAINT "OrganizationProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCoordinator" ADD CONSTRAINT "ProjectCoordinator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenderId_organizationId_fkey" FOREIGN KEY ("tenderId", "organizationId") REFERENCES "Tender"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workOrderId_organizationId_fkey" FOREIGN KEY ("workOrderId", "organizationId") REFERENCES "WorkOrder"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feasibility" ADD CONSTRAINT "Feasibility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feasibility" ADD CONSTRAINT "Feasibility_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feasibility" ADD CONSTRAINT "Feasibility_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feasibility" ADD CONSTRAINT "Feasibility_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionScheme" ADD CONSTRAINT "PermissionScheme_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionScheme" ADD CONSTRAINT "PermissionScheme_id_organizationId_kind_fkey" FOREIGN KEY ("id", "organizationId", "kind") REFERENCES "Entity"("id", "organizationId", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionScheme" ADD CONSTRAINT "PermissionScheme_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionScheme" ADD CONSTRAINT "PermissionScheme_assigneeId_organizationId_fkey" FOREIGN KEY ("assigneeId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderUnitType" ADD CONSTRAINT "TenderUnitType_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderTerm" ADD CONSTRAINT "TenderTerm_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderRequirement" ADD CONSTRAINT "TenderRequirement_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMember" ADD CONSTRAINT "TopicMember_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequirement" ADD CONSTRAINT "TemplateRequirement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_entityId_organizationId_fkey" FOREIGN KEY ("entityId", "organizationId") REFERENCES "Entity"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderSetup" ADD CONSTRAINT "TenderSetup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderSetupUnit" ADD CONSTRAINT "TenderSetupUnit_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "TenderSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderSetupTerm" ADD CONSTRAINT "TenderSetupTerm_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "TenderSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderSetupSection" ADD CONSTRAINT "TenderSetupSection_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "TenderSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderSetupRow" ADD CONSTRAINT "TenderSetupRow_setupId_sectionId_fkey" FOREIGN KEY ("setupId", "sectionId") REFERENCES "TenderSetupSection"("setupId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill original metadata and credentials without re-seeding.
INSERT INTO "Organization" ("id","name","isDemo","createdAt","updatedAt") SELECT id,name,"isDemo","createdAt","createdAt" FROM legacy_normalization."Organization";
INSERT INTO "OrganizationProfile" ("organizationId","email","phone","address","gstin","website","companySize","createdAt","updatedAt") SELECT id,COALESCE(profile->>'email',''),COALESCE(profile->>'phone',''),COALESCE(profile->>'address',''),COALESCE(profile->>'gstin',''),COALESCE(profile->>'website',''),COALESCE(profile->>'companySize',''),"createdAt","createdAt" FROM legacy_normalization."Organization";
INSERT INTO "User" ("id","organizationId","email","name","passwordHash","role","active","createdAt","updatedAt") SELECT "id","organizationId","email","name","passwordHash","role","active","createdAt","createdAt" FROM legacy_normalization."User";
INSERT INTO "Session" ("id","userId","expiresAt") SELECT id,"userId","expiresAt" FROM legacy_normalization."Session";
INSERT INTO "Project" ("id","organizationId","name","code","location","address","city","state","society","tower","status","stage","progress","startDate","targetDate","description","archived","version","createdAt","updatedAt") SELECT "id","organizationId","name","code","location","address","city","state","society","tower","status","stage","progress","startDate","targetDate","description","archived","version","createdAt","updatedAt" FROM legacy_normalization."Project";
INSERT INTO "ProjectCoordinator" ("id","projectId","position","name","mobile","createdAt","updatedAt") SELECT md5(p.id||':coordinator:'||v.n),p.id,v.n-1,v.item->>'name',v.item->>'mobile',p."createdAt",p."updatedAt" FROM legacy_normalization."Project" p CROSS JOIN LATERAL jsonb_array_elements(p.coordinators) WITH ORDINALITY v(item,n);
INSERT INTO "Entity" ("id","organizationId","kind") SELECT id,"organizationId",kind FROM legacy_normalization."Record";
INSERT INTO "Tender" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","regulation","units","terms") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'regulation'),'33(9)'),COALESCE((r.data->>'units'),''),COALESCE((r.data->>'terms'),'') FROM legacy_normalization."Record" r WHERE r.kind='TENDER';
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_kind_check" CHECK (kind='TENDER');
INSERT INTO "Quotation" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","tenderId","developerName","quotedAmount","additionalArea","rent","corpus","completionMonths") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",r."parentId",COALESCE((r.data->>'developerName'),''),COALESCE((r.data->>'amount')::numeric,0),COALESCE((r.data->>'additionalArea')::numeric,0),COALESCE((r.data->>'rent')::numeric,0),COALESCE((r.data->>'corpus')::numeric,0),COALESCE((r.data->>'completionMonths')::integer,36) FROM legacy_normalization."Record" r WHERE r.kind='QUOTE';
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_kind_check" CHECK (kind='QUOTE');
INSERT INTO "WorkOrder" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","developerName","tds","retention","terms") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'developerName'),''),COALESCE((r.data->>'tds')::numeric,0),COALESCE((r.data->>'retention')::numeric,0),COALESCE((r.data->>'terms'),'') FROM legacy_normalization."Record" r WHERE r.kind='WORK_ORDER';
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_kind_check" CHECK (kind='WORK_ORDER');
INSERT INTO "Invoice" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","workOrderId","developerName","tds","retention","terms") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",r."parentId",COALESCE((r.data->>'developerName'),''),COALESCE((r.data->>'tds')::numeric,0),COALESCE((r.data->>'retention')::numeric,0),COALESCE((r.data->>'terms'),'') FROM legacy_normalization."Record" r WHERE r.kind='INVOICE';
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_kind_check" CHECK (kind='INVOICE');
INSERT INTO "Permission" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","type","scheme","authority","expiry","flagged","documents") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'type'),''),COALESCE((r.data->>'scheme'),'33(9)'),COALESCE((r.data->>'authority'),''),(r.data->>'expiry')::timestamp(3),COALESCE((r.data->>'flagged')::boolean,false),COALESCE((r.data->>'documents'),'') FROM legacy_normalization."Record" r WHERE r.kind='PERMISSION';
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_kind_check" CHECK (kind='PERMISSION');
INSERT INTO "Task" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","topic") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'topic'),'General') FROM legacy_normalization."Record" r WHERE r.kind='TASK';
ALTER TABLE "Task" ADD CONSTRAINT "Task_kind_check" CHECK (kind='TASK');
INSERT INTO "Topic" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r WHERE r.kind='TOPIC';
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_kind_check" CHECK (kind='TOPIC');
INSERT INTO "Document" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","format","category","revision") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'format'),'plain'),COALESCE((r.data->>'category'),'General'),COALESCE((r.data->>'revision'),'1') FROM legacy_normalization."Record" r WHERE r.kind='DOCUMENT';
ALTER TABLE "Document" ADD CONSTRAINT "Document_kind_check" CHECK (kind='DOCUMENT');
INSERT INTO "Template" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","format","category","header","footer") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'format'),'plain'),COALESCE((r.data->>'category'),''),COALESCE((r.data->>'header'),''),COALESCE((r.data->>'footer'),'') FROM legacy_normalization."Record" r WHERE r.kind='TEMPLATE';
ALTER TABLE "Template" ADD CONSTRAINT "Template_kind_check" CHECK (kind='TEMPLATE');
INSERT INTO "Feasibility" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","plotArea","fsi","saleRate","constructionRate","otherCost") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'plotArea')::numeric,0),COALESCE((r.data->>'fsi')::numeric,1),COALESCE((r.data->>'saleRate')::numeric,0),COALESCE((r.data->>'constructionRate')::numeric,0),COALESCE((r.data->>'otherCost')::numeric,0) FROM legacy_normalization."Record" r WHERE r.kind='FEASIBILITY';
ALTER TABLE "Feasibility" ADD CONSTRAINT "Feasibility_kind_check" CHECK (kind='FEASIBILITY');
INSERT INTO "Meeting" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","location","attendees","agenda","minutes") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'location'),''),COALESCE((r.data->>'attendees'),''),COALESCE((r.data->>'agenda'),''),COALESCE((r.data->>'minutes'),'') FROM legacy_normalization."Record" r WHERE r.kind='MEETING';
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_kind_check" CHECK (kind='MEETING');
INSERT INTO "ProgressUpdate" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","percent","videoUrl") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'percent')::numeric,0),COALESCE((r.data->>'videoUrl'),'') FROM legacy_normalization."Record" r WHERE r.kind='PROGRESS';
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_kind_check" CHECK (kind='PROGRESS');
INSERT INTO "Developer" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","email","phone","contact","address") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'email'),''),COALESCE((r.data->>'phone'),''),COALESCE((r.data->>'contact'),''),COALESCE((r.data->>'address'),'') FROM legacy_normalization."Record" r WHERE r.kind='DEVELOPER';
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_kind_check" CHECK (kind='DEVELOPER');
INSERT INTO "PermissionScheme" ("id","organizationId","kind","projectId","assigneeId","title","reference","status","priority","dueDate","content","amount","total","paid","archived","version","createdAt","updatedAt","type","scheme","documents") SELECT r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt",COALESCE((r.data->>'type'),''),COALESCE((r.data->>'scheme'),''),COALESCE((r.data->>'documents'),'') FROM legacy_normalization."Record" r WHERE r.kind='SCHEME';
ALTER TABLE "PermissionScheme" ADD CONSTRAINT "PermissionScheme_kind_check" CHECK (kind='SCHEME');
INSERT INTO "TenderUnitType" ("id","tenderId","position","name","createdAt","updatedAt") SELECT md5(r.id||':unitTypes:'||v.n),r.id,v.n-1,COALESCE((v.item->>'name'),''),r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'unitTypes','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='TENDER';
INSERT INTO "TenderTerm" ("id","tenderId","position","name","createdAt","updatedAt") SELECT md5(r.id||':otherTerms:'||v.n),r.id,v.n-1,COALESCE((v.item->>'name'),''),r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'otherTerms','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='TENDER';
INSERT INTO "TenderRequirement" ("id","tenderId","position","section","sectionSerial","serial","description","offer","remarks","createdAt","updatedAt") SELECT md5(r.id||':requirements:'||v.n),r.id,v.n-1,COALESCE((v.item->>'section'),''),COALESCE((v.item->>'sectionSerial'),''),COALESCE((v.item->>'serial'),''),COALESCE((v.item->>'description'),''),COALESCE((v.item->>'offer'),''),COALESCE((v.item->>'remarks'),''),r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'requirements','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='TENDER';
INSERT INTO "WorkOrderItem" ("id","workOrderId","position","description","quantity","rate","tax","createdAt","updatedAt") SELECT md5(r.id||':items:'||v.n),r.id,v.n-1,COALESCE((v.item->>'description'),''),COALESCE((v.item->>'quantity')::numeric,0),COALESCE((v.item->>'rate')::numeric,0),COALESCE((v.item->>'tax')::numeric,0),r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'items','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='WORK_ORDER';
INSERT INTO "InvoiceItem" ("id","invoiceId","position","description","quantity","rate","tax","createdAt","updatedAt") SELECT md5(r.id||':items:'||v.n),r.id,v.n-1,COALESCE((v.item->>'description'),''),COALESCE((v.item->>'quantity')::numeric,0),COALESCE((v.item->>'rate')::numeric,0),COALESCE((v.item->>'tax')::numeric,0),r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'items','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='INVOICE';
INSERT INTO "TopicMember" ("id","topicId","position","name","createdAt","updatedAt") SELECT md5(r.id||':members:'||v.n),r.id,v.n-1,v.item#>>'{}',r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'members','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='TOPIC';
INSERT INTO "TemplateRequirement" ("id","templateId","position","section","description","offer","remarks","createdAt","updatedAt") SELECT md5(r.id||':requirements:'||v.n),r.id,v.n-1,COALESCE((v.item->>'section'),''),COALESCE((v.item->>'description'),''),COALESCE((v.item->>'offer'),''),COALESCE((v.item->>'remarks'),''),r."createdAt",r."updatedAt" FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'requirements','[]'::jsonb)) WITH ORDINALITY v(item,n) WHERE r.kind='TEMPLATE';
INSERT INTO "Payment" ("id","invoiceId","amount","date","reference","method","createdAt") SELECT id,"recordId",amount,date,reference,method,"createdAt" FROM legacy_normalization."Payment";
INSERT INTO "File" ("id","organizationId","entityId","name","mime","size","bytes","createdAt") SELECT id,"organizationId","recordId",name,mime,size,bytes,"createdAt" FROM legacy_normalization."File";
INSERT INTO "Comment" ("id","entityId","author","content","createdAt") SELECT id,"recordId",author,content,"createdAt" FROM legacy_normalization."Comment";
INSERT INTO "Invitation" ("id","tenderId","developerName","tokenHash","expiresAt","submittedAt","createdAt") SELECT "id","tenderId","developerName","tokenHash","expiresAt","submittedAt","createdAt" FROM legacy_normalization."Invitation";
INSERT INTO "Audit" ("id","organizationId","actor","action","entity","entityId","title","createdAt") SELECT "id","organizationId","actor","action","entity","entityId","title","createdAt" FROM legacy_normalization."Audit";
INSERT INTO "TenderSetup" ("id","organizationId","regulation","version","createdAt","updatedAt") SELECT id,"organizationId",regulation,version,"updatedAt","updatedAt" FROM legacy_normalization."TenderSetup";
INSERT INTO "TenderSetupUnit" ("id","setupId","position","name","sortOrder","type","status","createdAt","updatedAt") SELECT v.item->>'id',s.id,v.n-1,v.item->>'name',(v.item->>'sortOrder')::integer,v.item->>'type',v.item->>'status',s."updatedAt",s."updatedAt" FROM legacy_normalization."TenderSetup" s CROSS JOIN LATERAL jsonb_array_elements(s."unitTypes") WITH ORDINALITY v(item,n);
INSERT INTO "TenderSetupTerm" ("id","setupId","position","name","sortOrder","type","status","createdAt","updatedAt") SELECT v.item->>'id',s.id,v.n-1,v.item->>'name',(v.item->>'sortOrder')::integer,v.item->>'type',v.item->>'status',s."updatedAt",s."updatedAt" FROM legacy_normalization."TenderSetup" s CROSS JOIN LATERAL jsonb_array_elements(s."otherTerms") WITH ORDINALITY v(item,n);
INSERT INTO "TenderSetupSection" ("id","setupId","position","serial","title","createdAt","updatedAt") SELECT v.item->>'id',s.id,v.n-1,v.item->>'serial',v.item->>'title',s."updatedAt",s."updatedAt" FROM legacy_normalization."TenderSetup" s CROSS JOIN LATERAL jsonb_array_elements(s.sections) WITH ORDINALITY v(item,n);
INSERT INTO "TenderSetupRow" ("id","setupId","sectionId","position","serial","description","offer","remarks","createdAt","updatedAt") SELECT r.item->>'id',s.id,v.item->>'id',r.n-1,r.item->>'serial',r.item->>'description',r.item->>'offer',r.item->>'remarks',s."updatedAt",s."updatedAt" FROM legacy_normalization."TenderSetup" s CROSS JOIN LATERAL jsonb_array_elements(s.sections) v(item) CROSS JOIN LATERAL jsonb_array_elements(v.item->'rows') WITH ORDINALITY r(item,n);

-- Verify preserved metadata before retiring the old tables.
DO $$ BEGIN
 IF (SELECT count(*) FROM "Tender") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='TENDER') THEN RAISE EXCEPTION 'Tender row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Tender" n ON r.id=n.id WHERE r.kind='TENDER' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Tender metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Quotation") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='QUOTE') THEN RAISE EXCEPTION 'Quotation row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Quotation" n ON r.id=n.id WHERE r.kind='QUOTE' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Quotation metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "WorkOrder") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='WORK_ORDER') THEN RAISE EXCEPTION 'WorkOrder row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "WorkOrder" n ON r.id=n.id WHERE r.kind='WORK_ORDER' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'WorkOrder metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Invoice") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='INVOICE') THEN RAISE EXCEPTION 'Invoice row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Invoice" n ON r.id=n.id WHERE r.kind='INVOICE' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Invoice metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Permission") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='PERMISSION') THEN RAISE EXCEPTION 'Permission row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Permission" n ON r.id=n.id WHERE r.kind='PERMISSION' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Permission metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Task") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='TASK') THEN RAISE EXCEPTION 'Task row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Task" n ON r.id=n.id WHERE r.kind='TASK' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Task metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Topic") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='TOPIC') THEN RAISE EXCEPTION 'Topic row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Topic" n ON r.id=n.id WHERE r.kind='TOPIC' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Topic metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Document") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='DOCUMENT') THEN RAISE EXCEPTION 'Document row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Document" n ON r.id=n.id WHERE r.kind='DOCUMENT' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Document metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Template") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='TEMPLATE') THEN RAISE EXCEPTION 'Template row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Template" n ON r.id=n.id WHERE r.kind='TEMPLATE' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Template metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Feasibility") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='FEASIBILITY') THEN RAISE EXCEPTION 'Feasibility row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Feasibility" n ON r.id=n.id WHERE r.kind='FEASIBILITY' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Feasibility metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Meeting") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='MEETING') THEN RAISE EXCEPTION 'Meeting row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Meeting" n ON r.id=n.id WHERE r.kind='MEETING' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Meeting metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "ProgressUpdate") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='PROGRESS') THEN RAISE EXCEPTION 'ProgressUpdate row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "ProgressUpdate" n ON r.id=n.id WHERE r.kind='PROGRESS' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'ProgressUpdate metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Developer") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='DEVELOPER') THEN RAISE EXCEPTION 'Developer row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Developer" n ON r.id=n.id WHERE r.kind='DEVELOPER' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'Developer metadata mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "PermissionScheme") <> (SELECT count(*) FROM legacy_normalization."Record" WHERE kind='SCHEME') THEN RAISE EXCEPTION 'PermissionScheme row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "PermissionScheme" n ON r.id=n.id WHERE r.kind='SCHEME' AND ROW(r."id",r."organizationId",r."kind",r."projectId",r."assigneeId",r."title",r."reference",r."status",r."priority",r."dueDate",r."content",r."amount",r."total",r."paid",r."archived",r."version",r."createdAt",r."updatedAt") IS DISTINCT FROM ROW(n."id",n."organizationId",n."kind",n."projectId",n."assigneeId",n."title",n."reference",n."status",n."priority",n."dueDate",n."content",n."amount",n."total",n."paid",n."archived",n."version",n."createdAt",n."updatedAt")) THEN RAISE EXCEPTION 'PermissionScheme metadata mismatch'; END IF;
END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Organization") <> (SELECT count(*) FROM legacy_normalization."Organization") THEN RAISE EXCEPTION 'Organization row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "User") <> (SELECT count(*) FROM legacy_normalization."User") THEN RAISE EXCEPTION 'User row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Session") <> (SELECT count(*) FROM legacy_normalization."Session") THEN RAISE EXCEPTION 'Session row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Project") <> (SELECT count(*) FROM legacy_normalization."Project") THEN RAISE EXCEPTION 'Project row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Payment") <> (SELECT count(*) FROM legacy_normalization."Payment") THEN RAISE EXCEPTION 'Payment row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "File") <> (SELECT count(*) FROM legacy_normalization."File") THEN RAISE EXCEPTION 'File row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Comment") <> (SELECT count(*) FROM legacy_normalization."Comment") THEN RAISE EXCEPTION 'Comment row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Invitation") <> (SELECT count(*) FROM legacy_normalization."Invitation") THEN RAISE EXCEPTION 'Invitation row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "Audit") <> (SELECT count(*) FROM legacy_normalization."Audit") THEN RAISE EXCEPTION 'Audit row count mismatch'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM "TenderSetup") <> (SELECT count(*) FROM legacy_normalization."TenderSetup") THEN RAISE EXCEPTION 'TenderSetup row count mismatch'; END IF; END $$;

-- Verify scalar values and every supplied list field, including decimal precision.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Tender" n ON n.id=r.id WHERE r.kind='TENDER' AND ((r.data ? 'regulation' AND (to_jsonb(n."regulation") IS DISTINCT FROM r.data->'regulation')) OR (r.data ? 'units' AND (to_jsonb(n."units") IS DISTINCT FROM r.data->'units')) OR (r.data ? 'terms' AND (to_jsonb(n."terms") IS DISTINCT FROM r.data->'terms')))) THEN RAISE EXCEPTION 'Tender scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Quotation" n ON n.id=r.id WHERE r.kind='QUOTE' AND ((r.data ? 'developerName' AND (to_jsonb(n."developerName") IS DISTINCT FROM r.data->'developerName')) OR (r.data ? 'amount' AND (to_jsonb(n."quotedAmount") IS DISTINCT FROM r.data->'amount')) OR (r.data ? 'additionalArea' AND (to_jsonb(n."additionalArea") IS DISTINCT FROM r.data->'additionalArea')) OR (r.data ? 'rent' AND (to_jsonb(n."rent") IS DISTINCT FROM r.data->'rent')) OR (r.data ? 'corpus' AND (to_jsonb(n."corpus") IS DISTINCT FROM r.data->'corpus')) OR (r.data ? 'completionMonths' AND (to_jsonb(n."completionMonths") IS DISTINCT FROM r.data->'completionMonths')))) THEN RAISE EXCEPTION 'Quotation scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "WorkOrder" n ON n.id=r.id WHERE r.kind='WORK_ORDER' AND ((r.data ? 'developerName' AND (to_jsonb(n."developerName") IS DISTINCT FROM r.data->'developerName')) OR (r.data ? 'tds' AND (to_jsonb(n."tds") IS DISTINCT FROM r.data->'tds')) OR (r.data ? 'retention' AND (to_jsonb(n."retention") IS DISTINCT FROM r.data->'retention')) OR (r.data ? 'terms' AND (to_jsonb(n."terms") IS DISTINCT FROM r.data->'terms')))) THEN RAISE EXCEPTION 'WorkOrder scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Invoice" n ON n.id=r.id WHERE r.kind='INVOICE' AND ((r.data ? 'developerName' AND (to_jsonb(n."developerName") IS DISTINCT FROM r.data->'developerName')) OR (r.data ? 'tds' AND (to_jsonb(n."tds") IS DISTINCT FROM r.data->'tds')) OR (r.data ? 'retention' AND (to_jsonb(n."retention") IS DISTINCT FROM r.data->'retention')) OR (r.data ? 'terms' AND (to_jsonb(n."terms") IS DISTINCT FROM r.data->'terms')))) THEN RAISE EXCEPTION 'Invoice scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Permission" n ON n.id=r.id WHERE r.kind='PERMISSION' AND ((r.data ? 'type' AND (to_jsonb(n."type") IS DISTINCT FROM r.data->'type')) OR (r.data ? 'scheme' AND (to_jsonb(n."scheme") IS DISTINCT FROM r.data->'scheme')) OR (r.data ? 'authority' AND (to_jsonb(n."authority") IS DISTINCT FROM r.data->'authority')) OR (r.data ? 'expiry' AND (n."expiry" IS DISTINCT FROM (r.data->>'expiry')::timestamp(3))) OR (r.data ? 'flagged' AND (to_jsonb(n."flagged") IS DISTINCT FROM r.data->'flagged')) OR (r.data ? 'documents' AND (to_jsonb(n."documents") IS DISTINCT FROM r.data->'documents')))) THEN RAISE EXCEPTION 'Permission scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Task" n ON n.id=r.id WHERE r.kind='TASK' AND ((r.data ? 'topic' AND (to_jsonb(n."topic") IS DISTINCT FROM r.data->'topic')))) THEN RAISE EXCEPTION 'Task scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Document" n ON n.id=r.id WHERE r.kind='DOCUMENT' AND ((r.data ? 'format' AND (to_jsonb(n."format") IS DISTINCT FROM r.data->'format')) OR (r.data ? 'category' AND (to_jsonb(n."category") IS DISTINCT FROM r.data->'category')) OR (r.data ? 'revision' AND (to_jsonb(n."revision") IS DISTINCT FROM r.data->'revision')))) THEN RAISE EXCEPTION 'Document scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Template" n ON n.id=r.id WHERE r.kind='TEMPLATE' AND ((r.data ? 'format' AND (to_jsonb(n."format") IS DISTINCT FROM r.data->'format')) OR (r.data ? 'category' AND (to_jsonb(n."category") IS DISTINCT FROM r.data->'category')) OR (r.data ? 'header' AND (to_jsonb(n."header") IS DISTINCT FROM r.data->'header')) OR (r.data ? 'footer' AND (to_jsonb(n."footer") IS DISTINCT FROM r.data->'footer')))) THEN RAISE EXCEPTION 'Template scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Feasibility" n ON n.id=r.id WHERE r.kind='FEASIBILITY' AND ((r.data ? 'plotArea' AND (to_jsonb(n."plotArea") IS DISTINCT FROM r.data->'plotArea')) OR (r.data ? 'fsi' AND (to_jsonb(n."fsi") IS DISTINCT FROM r.data->'fsi')) OR (r.data ? 'saleRate' AND (to_jsonb(n."saleRate") IS DISTINCT FROM r.data->'saleRate')) OR (r.data ? 'constructionRate' AND (to_jsonb(n."constructionRate") IS DISTINCT FROM r.data->'constructionRate')) OR (r.data ? 'otherCost' AND (to_jsonb(n."otherCost") IS DISTINCT FROM r.data->'otherCost')))) THEN RAISE EXCEPTION 'Feasibility scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Meeting" n ON n.id=r.id WHERE r.kind='MEETING' AND ((r.data ? 'location' AND (to_jsonb(n."location") IS DISTINCT FROM r.data->'location')) OR (r.data ? 'attendees' AND (to_jsonb(n."attendees") IS DISTINCT FROM r.data->'attendees')) OR (r.data ? 'agenda' AND (to_jsonb(n."agenda") IS DISTINCT FROM r.data->'agenda')) OR (r.data ? 'minutes' AND (to_jsonb(n."minutes") IS DISTINCT FROM r.data->'minutes')))) THEN RAISE EXCEPTION 'Meeting scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "ProgressUpdate" n ON n.id=r.id WHERE r.kind='PROGRESS' AND ((r.data ? 'percent' AND (to_jsonb(n."percent") IS DISTINCT FROM r.data->'percent')) OR (r.data ? 'videoUrl' AND (to_jsonb(n."videoUrl") IS DISTINCT FROM r.data->'videoUrl')))) THEN RAISE EXCEPTION 'ProgressUpdate scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "Developer" n ON n.id=r.id WHERE r.kind='DEVELOPER' AND ((r.data ? 'email' AND (to_jsonb(n."email") IS DISTINCT FROM r.data->'email')) OR (r.data ? 'phone' AND (to_jsonb(n."phone") IS DISTINCT FROM r.data->'phone')) OR (r.data ? 'contact' AND (to_jsonb(n."contact") IS DISTINCT FROM r.data->'contact')) OR (r.data ? 'address' AND (to_jsonb(n."address") IS DISTINCT FROM r.data->'address')))) THEN RAISE EXCEPTION 'Developer scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r JOIN "PermissionScheme" n ON n.id=r.id WHERE r.kind='SCHEME' AND ((r.data ? 'type' AND (to_jsonb(n."type") IS DISTINCT FROM r.data->'type')) OR (r.data ? 'scheme' AND (to_jsonb(n."scheme") IS DISTINCT FROM r.data->'scheme')) OR (r.data ? 'documents' AND (to_jsonb(n."documents") IS DISTINCT FROM r.data->'documents')))) THEN RAISE EXCEPTION 'PermissionScheme scalar data mismatch; migration rolled back'; END IF; END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "TenderUnitType") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'unitTypes','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='TENDER') THEN RAISE EXCEPTION 'TenderUnitType row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'unitTypes','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "TenderUnitType" c ON c."tenderId"=r.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE r.kind='TENDER' AND (kv.key <> ALL(ARRAY['name']::text[]) OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value)) THEN RAISE EXCEPTION 'TenderUnitType data mismatch or unrecognized field'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "TenderTerm") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'otherTerms','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='TENDER') THEN RAISE EXCEPTION 'TenderTerm row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'otherTerms','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "TenderTerm" c ON c."tenderId"=r.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE r.kind='TENDER' AND (kv.key <> ALL(ARRAY['name']::text[]) OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value)) THEN RAISE EXCEPTION 'TenderTerm data mismatch or unrecognized field'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "TenderRequirement") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'requirements','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='TENDER') THEN RAISE EXCEPTION 'TenderRequirement row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'requirements','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "TenderRequirement" c ON c."tenderId"=r.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE r.kind='TENDER' AND (kv.key <> ALL(ARRAY['section','sectionSerial','serial','description','offer','remarks']::text[]) OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value)) THEN RAISE EXCEPTION 'TenderRequirement data mismatch or unrecognized field'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "WorkOrderItem") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'items','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='WORK_ORDER') THEN RAISE EXCEPTION 'WorkOrderItem row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'items','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "WorkOrderItem" c ON c."workOrderId"=r.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE r.kind='WORK_ORDER' AND (kv.key <> ALL(ARRAY['description','quantity','rate','tax']::text[]) OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value)) THEN RAISE EXCEPTION 'WorkOrderItem data mismatch or unrecognized field'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "InvoiceItem") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'items','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='INVOICE') THEN RAISE EXCEPTION 'InvoiceItem row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'items','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "InvoiceItem" c ON c."invoiceId"=r.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE r.kind='INVOICE' AND (kv.key <> ALL(ARRAY['description','quantity','rate','tax']::text[]) OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value)) THEN RAISE EXCEPTION 'InvoiceItem data mismatch or unrecognized field'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "TopicMember") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'members','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='TOPIC') THEN RAISE EXCEPTION 'TopicMember row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'members','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "TopicMember" c ON c."topicId"=r.id AND c.position=v.n-1 WHERE r.kind='TOPIC' AND to_jsonb(c.name) IS DISTINCT FROM v.item) THEN RAISE EXCEPTION 'TopicMember data mismatch'; END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM "TemplateRequirement") <> (SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'requirements','[]'::jsonb))),0) FROM legacy_normalization."Record" WHERE kind='TEMPLATE') THEN RAISE EXCEPTION 'TemplateRequirement row count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_normalization."Record" r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'requirements','[]'::jsonb)) WITH ORDINALITY v(item,n) JOIN "TemplateRequirement" c ON c."templateId"=r.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE r.kind='TEMPLATE' AND (kv.key <> ALL(ARRAY['section','description','offer','remarks']::text[]) OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value)) THEN RAISE EXCEPTION 'TemplateRequirement data mismatch or unrecognized field'; END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_normalization."Project" p CROSS JOIN LATERAL jsonb_array_elements(p.coordinators) WITH ORDINALITY v(item,n) JOIN "ProjectCoordinator" c ON c."projectId"=p.id AND c.position=v.n-1 CROSS JOIN LATERAL jsonb_each(v.item) kv WHERE kv.key NOT IN ('name','mobile') OR to_jsonb(c)->kv.key IS DISTINCT FROM kv.value) THEN RAISE EXCEPTION 'Coordinator data mismatch'; END IF;
END $$;
CREATE UNIQUE INDEX "Quotation_one_accepted_per_tender" ON "Quotation"("tenderId") WHERE status='Accepted' AND archived=false;
-- The original snapshot must be retained outside the repository until migration review is complete.
DROP SCHEMA "legacy_normalization" CASCADE;
COMMIT;
