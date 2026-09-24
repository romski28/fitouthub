-- ============================================================================
-- Backfill: mark payment milestones as 'released' when their payment has
-- already been released (a confirmed release_payment transaction referencing
-- the milestone via its __FOH_MILESTONE__ metadata in notes).
--
-- Fixes the client digest ("Here is your day") listing paid milestones as
-- "Payment release to approve" for projects released before the
-- releaseClass1Payment milestone-status update was added.
-- ============================================================================

UPDATE "PaymentMilestone" pm
SET
  "status" = 'released',
  "releasedAt" = COALESCE("releasedAt", NOW())
WHERE pm."status" = 'release_requested'
  AND EXISTS (
    SELECT 1
    FROM "FinancialTransaction" ft
    WHERE ft."type" = 'release_payment'
      AND ft."status" = 'confirmed'
      AND ft."notes" LIKE '%' || pm."id" || '%'
  );
