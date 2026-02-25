-- CreateEnum for SiteAccessRequest status
CREATE TYPE "SiteAccessRequestStatus" AS ENUM (
  'pending',
  'approved_no_visit',
  'approved_visit_scheduled',
  'visited',
  'denied',
  'cancelled'
);

-- CreateEnum for LocationDetailsStatus
CREATE TYPE "LocationDetailsStatus" AS ENUM (
  'pending',
  'submitted',
  'reviewed',
  'approved'
);

-- CreateTable SiteAccessRequest
CREATE TABLE "SiteAccessRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "projectProfessionalId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "status" "SiteAccessRequestStatus" NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "visitScheduledFor" DATE,
  "visitedAt" TIMESTAMP(3),
  "visitDetails" TEXT,
  "clientApprovedBy" TEXT,
  "reasonDenied" TEXT,
  "quoteCreatedAfterAccess" BOOLEAN NOT NULL DEFAULT false,
  "quoteIsRemote" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SiteAccessRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteAccessRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessRequest_projectProfessionalId_fkey" FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessRequest_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessRequest_clientApprovedBy_fkey" FOREIGN KEY ("clientApprovedBy") REFERENCES "User"("id") ON DELETE SET NULL
);

-- CreateTable SiteAccessData
CREATE TABLE "SiteAccessData" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "addressFull" TEXT NOT NULL,
  "unitNumber" TEXT,
  "floorLevel" TEXT,
  "accessDetails" TEXT,
  "onSiteContactName" TEXT,
  "onSiteContactPhone" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedBy" TEXT NOT NULL,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdatedBy" TEXT,

  CONSTRAINT "SiteAccessData_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteAccessData_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessData_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SiteAccessData_lastUpdatedBy_fkey" FOREIGN KEY ("lastUpdatedBy") REFERENCES "User"("id") ON DELETE SET NULL
);

-- CreateTable ProjectLocationDetails
CREATE TABLE "ProjectLocationDetails" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "addressFull" TEXT NOT NULL,
  "postalCode" TEXT,
  "gpsCoordinates" JSONB,
  "unitNumber" TEXT,
  "floorLevel" TEXT,
  "propertyType" TEXT,
  "propertySize" TEXT,
  "propertyAge" TEXT,
  "accessDetails" TEXT,
  "existingConditions" TEXT,
  "specialRequirements" JSONB,
  "onSiteContactName" TEXT,
  "onSiteContactPhone" TEXT,
  "accessHoursDescription" TEXT,
  "desiredStartDate" DATE,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "LocationDetailsStatus" NOT NULL DEFAULT 'pending',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedBy" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectLocationDetails_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectLocationDetails_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "ProjectLocationDetails_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ProjectLocationDetails_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL
);

-- Add columns to Project table
ALTER TABLE "Project" 
ADD COLUMN "siteAccessDataCollected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "siteAccessDataCollectedAt" TIMESTAMP(3),
ADD COLUMN "locationDetailsStatus" "LocationDetailsStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "locationDetailsRequiredAt" TIMESTAMP(3),
ADD COLUMN "locationDetailsProvidedAt" TIMESTAMP(3);

-- Add columns to ProjectProfessional table
ALTER TABLE "ProjectProfessional"
ADD COLUMN "visitApprovedButNotDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "siteVisitedAt" TIMESTAMP(3),
ADD COLUMN "visitNotes" TEXT;

-- Add column to PaymentRequest table (if it doesn't exist)
ALTER TABLE "PaymentRequest"
ADD COLUMN "isRemoteQuote" BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for performance
CREATE UNIQUE INDEX "SiteAccessData_projectId_key" ON "SiteAccessData"("projectId");
CREATE UNIQUE INDEX "ProjectLocationDetails_projectId_key" ON "ProjectLocationDetails"("projectId");

CREATE INDEX "SiteAccessRequest_projectId_idx" ON "SiteAccessRequest"("projectId");
CREATE INDEX "SiteAccessRequest_projectProfessionalId_idx" ON "SiteAccessRequest"("projectProfessionalId");
CREATE INDEX "SiteAccessRequest_professionalId_idx" ON "SiteAccessRequest"("professionalId");
CREATE INDEX "SiteAccessRequest_status_idx" ON "SiteAccessRequest"("status");
CREATE INDEX "SiteAccessRequest_pending_idx" ON "SiteAccessRequest"("projectId", "status") 
  WHERE "status" IN ('pending', 'approved_visit_scheduled');

CREATE INDEX "SiteAccessData_projectId_idx" ON "SiteAccessData"("projectId");
CREATE INDEX "SiteAccessData_submittedAt_idx" ON "SiteAccessData"("submittedAt" DESC);

CREATE INDEX "ProjectLocationDetails_projectId_idx" ON "ProjectLocationDetails"("projectId");
CREATE INDEX "ProjectLocationDetails_status_idx" ON "ProjectLocationDetails"("status");
CREATE INDEX "ProjectLocationDetails_submittedAt_idx" ON "ProjectLocationDetails"("submittedAt" DESC);

CREATE INDEX "Project_locationDetailsStatus_idx" ON "Project"("locationDetailsStatus");
CREATE INDEX "Project_siteAccessDataCollected_idx" ON "Project"("siteAccessDataCollected");
