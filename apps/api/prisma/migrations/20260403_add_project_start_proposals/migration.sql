CREATE TYPE "ProjectStartProposalStatus" AS ENUM ('proposed', 'accepted', 'declined', 'superseded');

CREATE TABLE "ProjectStartProposal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "projectProfessionalId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "status" "ProjectStartProposalStatus" NOT NULL DEFAULT 'proposed',
  "proposedStartAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "notes" TEXT,
  "responseNotes" TEXT,
  "respondedAt" TIMESTAMP(3),
  "respondedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectStartProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectStartProposal_projectId_idx" ON "ProjectStartProposal"("projectId");
CREATE INDEX "ProjectStartProposal_projectProfessionalId_idx" ON "ProjectStartProposal"("projectProfessionalId");
CREATE INDEX "ProjectStartProposal_professionalId_idx" ON "ProjectStartProposal"("professionalId");
CREATE INDEX "ProjectStartProposal_status_idx" ON "ProjectStartProposal"("status");
CREATE INDEX "ProjectStartProposal_projectId_status_idx" ON "ProjectStartProposal"("projectId", "status");

ALTER TABLE "ProjectStartProposal"
  ADD CONSTRAINT "ProjectStartProposal_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectStartProposal"
  ADD CONSTRAINT "ProjectStartProposal_projectProfessionalId_fkey"
  FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectStartProposal"
  ADD CONSTRAINT "ProjectStartProposal_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
