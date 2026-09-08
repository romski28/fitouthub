-- ============================================================================
-- Project.tenderClosesAt — scheduled auto-close time for an open tender.
--
-- The PM is now the arbiter of project release. When the PM releases a project
-- for quotation, the tender opens (tenderOpenedAt) and is given a scheduled
-- close time (tenderClosesAt):
--   - Emergency: release + 1 hour (exact).
--   - Standard:  end of day (23:59:59 Hong Kong) on the 3rd day after release.
--
-- A tender is treated as closed once `now > tenderClosesAt` (computed on read),
-- so no cron is required — the discover feed and apply gate simply exclude
-- projects whose tenderClosesAt has passed.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then run
-- `pnpm exec prisma generate`.
-- ============================================================================

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "tenderClosesAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Project_tenderClosesAt_idx" ON "Project" ("tenderClosesAt");
