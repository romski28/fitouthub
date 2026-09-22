-- ============================================================================
-- Project.fiscalStatus — denormalised fiscal settlement state, separate from
-- the physical ProjectStage (see COMPLETION_TWO_AXIS_PLAN.md).
--
-- Values: 'pending' | 'funded' | 'payment_released' | 'retention_held' | 'settled'
--
-- Idempotent. Rollback: ALTER TABLE "Project" DROP COLUMN IF EXISTS "fiscalStatus";
-- ============================================================================

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "fiscalStatus" TEXT NOT NULL DEFAULT 'pending';

-- ----------------------------------------------------------------------------
-- Optional backfill (SKIPPED by default — deferred to avoid risk on in-flight
-- projects). Uncomment and run deliberately if you want existing projects to
-- reflect a derived fiscal state from their FinancialTransaction/EscrowLedger
-- history instead of staying at 'pending'.
-- ----------------------------------------------------------------------------
-- UPDATE "Project" p
-- SET "fiscalStatus" = CASE
--   WHEN EXISTS (SELECT 1 FROM "FinancialTransaction" ft WHERE ft."projectId" = p.id AND ft.type = 'platform_fee_settlement' AND ft.status = 'confirmed') THEN 'settled'
--   WHEN EXISTS (SELECT 1 FROM "FinancialTransaction" ft WHERE ft."projectId" = p.id AND ft.type = 'retention_hold' AND ft.status = 'confirmed') THEN 'retention_held'
--   WHEN EXISTS (SELECT 1 FROM "FinancialTransaction" ft WHERE ft."projectId" = p.id AND ft.type = 'release_payment' AND ft.status = 'confirmed') THEN 'payment_released'
--   WHEN EXISTS (SELECT 1 FROM "FinancialTransaction" ft WHERE ft."projectId" = p.id AND ft.type IN ('escrow_deposit','escrow_deposit_confirmation') AND ft.status = 'confirmed') THEN 'funded'
--   ELSE 'pending'
-- END;
