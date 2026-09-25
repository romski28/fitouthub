-- ============================================================================
-- Feedback unification: add respondent type/id to ux_feedback so both client
-- and professional free-text survey responses live in one table, and add a
-- client aggregate rating (mean of professional reviews) to User. Idempotent.
-- ============================================================================

ALTER TABLE "ux_feedback"
  ADD COLUMN IF NOT EXISTS "respondent_type" TEXT,
  ADD COLUMN IF NOT EXISTS "respondent_id" TEXT;

CREATE INDEX IF NOT EXISTS "ux_feedback_respondent_idx"
  ON "ux_feedback"("respondent_type", "respondent_id");

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER NOT NULL DEFAULT 0;
