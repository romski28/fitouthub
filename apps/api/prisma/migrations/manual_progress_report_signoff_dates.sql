-- Add signoff timestamp columns to ProgressReport
-- Run manually on the live database before deploying this release.

ALTER TABLE "ProgressReport"
  ADD COLUMN IF NOT EXISTS "signOffApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signOffRejectedAt" TIMESTAMP(3);
