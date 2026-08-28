-- ============================================================================
-- Quote pricing mode (lump vs per-trade).
--
-- Adds an explicit, persistent flag recording whether a professional's quote
-- was priced as a single lump sum ('lump') or broken down per trade
-- ('per-trade'). Previously this was only inferred from which of
-- quoteBreakdown (lump) vs subcontracting (per-trade) was populated.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then update
-- apps/api/prisma/schema.prisma (already done) and run `pnpm exec prisma generate`.
-- ============================================================================

ALTER TABLE "ProjectProfessional"
  ADD COLUMN IF NOT EXISTS "quotePricingMode" TEXT NOT NULL DEFAULT 'lump';

-- Backfill: per-trade quotes have a non-empty subcontracting array.
UPDATE "ProjectProfessional"
SET "quotePricingMode" = 'per-trade'
WHERE "subcontracting" IS NOT NULL
  AND jsonb_typeof("subcontracting"::jsonb) = 'array'
  AND jsonb_array_length("subcontracting"::jsonb) > 0;
