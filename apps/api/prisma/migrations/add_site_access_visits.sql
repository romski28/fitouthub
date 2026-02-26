-- Add datetime to site access scheduling
ALTER TABLE "SiteAccessRequest"
ADD COLUMN "visitScheduledAt" TIMESTAMP(3);

-- Create enum for site visit status
CREATE TYPE "SiteAccessVisitStatus" AS ENUM (
  'proposed',
  'accepted',
  'declined',
  'cancelled',
  'completed'
);

-- Create table for site visit proposals and responses
CREATE TABLE "SiteAccessVisit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "projectProfessionalId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "status" "SiteAccessVisitStatus" NOT NULL DEFAULT 'proposed',
  "proposedAt" TIMESTAMP(3) NOT NULL,
  "proposedByRole" TEXT NOT NULL DEFAULT 'professional',
  "notes" TEXT,
  "respondedAt" TIMESTAMP(3),
  "respondedBy" TEXT,
  "responseNotes" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SiteAccessVisit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteAccessVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessVisit_projectProfessionalId_fkey" FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessVisit_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE,
  CONSTRAINT "SiteAccessVisit_respondedBy_fkey" FOREIGN KEY ("respondedBy") REFERENCES "User"("id") ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX "SiteAccessVisit_projectId_idx" ON "SiteAccessVisit"("projectId");
CREATE INDEX "SiteAccessVisit_projectProfessionalId_idx" ON "SiteAccessVisit"("projectProfessionalId");
CREATE INDEX "SiteAccessVisit_professionalId_idx" ON "SiteAccessVisit"("professionalId");
CREATE INDEX "SiteAccessVisit_status_idx" ON "SiteAccessVisit"("status");
CREATE INDEX "SiteAccessVisit_proposedAt_idx" ON "SiteAccessVisit"("proposedAt" DESC);
