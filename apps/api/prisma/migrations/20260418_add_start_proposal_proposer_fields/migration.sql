ALTER TABLE "ProjectStartProposal"
ADD COLUMN "proposedByRole" TEXT NOT NULL DEFAULT 'professional',
ADD COLUMN "proposedByUserId" TEXT;

UPDATE "ProjectStartProposal"
SET "proposedByRole" = 'professional',
    "proposedByUserId" = "professionalId"
WHERE "proposedByUserId" IS NULL;

CREATE INDEX IF NOT EXISTS "ProjectStartProposal_projectId_projectProfessionalId_status_createdAt_idx"
ON "ProjectStartProposal"("projectId", "projectProfessionalId", "status", "createdAt");
