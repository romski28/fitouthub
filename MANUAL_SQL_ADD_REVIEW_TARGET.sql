-- ============================================================================
-- Add a per-professional target to ProjectReview so a client can rate each
-- professional (contractor) who worked on a project, feeding each pro's
-- aggregate rating. Idempotent.
-- ============================================================================

ALTER TABLE "ProjectReview"
  ADD COLUMN IF NOT EXISTS "reviewedProfessionalId" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectReview_reviewedProfessionalId_idx"
  ON "ProjectReview"("reviewedProfessionalId");
