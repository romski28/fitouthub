-- ============================================================================
-- PM role — project assignment and quotation-release gate fields.
--
-- 1) pmId                    = the Project Manager who owns this project
--                              (exclusive ownership; null = unclaimed, i.e. in The Queue).
-- 2) releasedForQuotationAt  = when the PM released the project for quotation
--                              (null = held, awaiting PM review).
-- 3) releasedByPmId          = which PM released it (owner, or a temp PM covering absence).
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then update
-- apps/api/prisma/schema.prisma (already done) and run `pnpm exec prisma generate`.
-- ============================================================================

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "pmId" TEXT,
  ADD COLUMN IF NOT EXISTS "releasedForQuotationAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "releasedByPmId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_pmId_idx" ON "Project" ("pmId");
