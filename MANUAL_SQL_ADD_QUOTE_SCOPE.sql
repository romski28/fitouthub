-- ============================================================================
-- Quote scope beyond requested trades (Phase 2).
--
-- 1) ProjectProfessional.quotedTrades = the full set of trades this pro's quote
--    covers (their own "self" trades plus any additional trades they elected
--    to cover). Locked once the quote is submitted.
-- 2) ProjectProfessional.subcontracting = the per-trade plan (kind self /
--    contact / platform, amounts, and the deferred team definition). Mutable
--    after submit until award.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then update
-- apps/api/prisma/schema.prisma and run `pnpm exec prisma generate`.
-- ============================================================================

ALTER TABLE "ProjectProfessional"
  ADD COLUMN IF NOT EXISTS "quotedTrades" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "ProjectProfessional"
  ADD COLUMN IF NOT EXISTS "subcontracting" JSONB;
