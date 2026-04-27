-- Manual DB patch: extend milestone procurement claims for scoped chat workflow
-- Safe to run multiple times.
--
-- Why this exists:
-- - Claim workflow now includes opening message, 7-day deadline, and conversation timestamps.
-- - This remains a manual patch (no auto migration execution).

BEGIN;

ALTER TABLE "MilestoneProcurementEvidence"
  ADD COLUMN IF NOT EXISTS "openingMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "deadlineAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "clientQuestionedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "professionalRespondedAt" TIMESTAMPTZ;

-- Backfill a default deadline for still-pending legacy rows with no deadline.
UPDATE "MilestoneProcurementEvidence"
SET "deadlineAt" = "createdAt" + INTERVAL '7 days'
WHERE "status" = 'pending'
  AND "deadlineAt" IS NULL;

CREATE INDEX IF NOT EXISTS "MilestoneProcurementEvidence_status_deadlineAt_idx"
  ON "MilestoneProcurementEvidence" ("status", "deadlineAt");

COMMIT;

-- Verification
-- SELECT "id", "status", "createdAt", "deadlineAt", "openingMessage"
-- FROM "MilestoneProcurementEvidence"
-- ORDER BY "createdAt" DESC
-- LIMIT 20;
