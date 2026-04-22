-- Platform Fee Implementation - Phase A
-- Adds fields to ProjectProfessional and creates policy tables for flat 12% fee (future matrix support)
-- Date: 2026-04-22

-- 1. Extend ProjectProfessional table with fee tracking fields
ALTER TABLE "ProjectProfessional" 
ADD COLUMN IF NOT EXISTS "quoteBaseAmount" DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "quotePlatformFeeAmount" DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "quotePlatformFeePercent" DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "quotePricingVersion" VARCHAR(50) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS "quotePlatformFeeBreakdown" JSONB,
ADD COLUMN IF NOT EXISTS "feeCalculatedAt" TIMESTAMP;

-- 2. Create platform fee quote bands table
-- Stores base fee percent by quote amount range
CREATE TABLE IF NOT EXISTS "PlatformFeeQuoteBand" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "minAmount" DECIMAL(12, 2) NOT NULL,
  "maxAmount" DECIMAL(12, 2),  -- NULL means unlimited upper bound
  "basePercent" DECIMAL(5, 2) NOT NULL,
  "effectiveFrom" TIMESTAMP NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create performance adjustment table
-- Stores fee % adjustment by professional's completed/awarded project count
CREATE TABLE IF NOT EXISTS "PlatformFeePerformanceAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "minProjects" INTEGER NOT NULL,
  "maxProjects" INTEGER,  -- NULL means no upper bound
  "percentAdjustment" DECIMAL(5, 2) NOT NULL,  -- Usually 0, -1, -2, etc.
  "effectiveFrom" TIMESTAMP NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "notes" VARCHAR(255),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Create loyalty adjustment table
-- Stores fee % adjustment by client's historical project count
CREATE TABLE IF NOT EXISTS "PlatformFeeLoyaltyAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "minProjects" INTEGER NOT NULL,
  "maxProjects" INTEGER,  -- NULL means no upper bound
  "percentAdjustment" DECIMAL(5, 2) NOT NULL,  -- Usually 0, -1, -2, etc.
  "effectiveFrom" TIMESTAMP NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "notes" VARCHAR(255),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Seed initial policy: Flat 12% for all quotes, no adjustments
INSERT INTO "PlatformFeeQuoteBand" ("minAmount", "maxAmount", "basePercent", "active", "version", "notes")
VALUES 
  (0, 1000, 12, true, 1, 'Quotes 0-1000 HKD'),
  (1001, 10000, 10, true, 1, 'Quotes 1001-10000 HKD'),
  (10001, 100000, 8, true, 1, 'Quotes 10001-100000 HKD'),
  (100001, NULL, 7, true, 1, 'Quotes 100001+ HKD');

INSERT INTO "PlatformFeePerformanceAdjustment" ("minProjects", "maxProjects", "percentAdjustment", "active", "version", "notes")
VALUES 
  (0, 10, 0, true, 1, 'No adjustment: 0-10 projects'),
  (11, 30, -1, true, 1, 'Minus 1%: 11-30 projects'),
  (31, NULL, -2, true, 1, 'Minus 2%: 31+ projects');

INSERT INTO "PlatformFeeLoyaltyAdjustment" ("minProjects", "maxProjects", "percentAdjustment", "active", "version", "notes")
VALUES 
  (0, 5, 0, true, 1, 'No adjustment: 0-5 historical projects'),
  (6, 10, -1, true, 1, 'Minus 1%: 6-10 historical projects'),
  (11, NULL, -2, true, 1, 'Minus 2%: 11+ historical projects');

-- 6. Backfill existing quotes
-- For all existing ProjectProfessional records with a quoteAmount:
-- - Copy quoteAmount to quoteBaseAmount (treat existing as base, no fee retroactively applied)
-- - Set other fee fields to 0 or 'legacy-no-fee'
-- - Mark as feeCalculatedAt = NULL to indicate legacy record
UPDATE "ProjectProfessional"
SET 
  "quoteBaseAmount" = "quoteAmount",
  "quotePlatformFeeAmount" = 0,
  "quotePlatformFeePercent" = 0,
  "quotePricingVersion" = 'legacy-no-fee',
  "feeCalculatedAt" = NULL
WHERE "quoteAmount" IS NOT NULL AND "quoteBaseAmount" IS NULL;

-- 7. Create index for fast policy lookups
CREATE INDEX IF NOT EXISTS "idx_platform_fee_quote_band_active" ON "PlatformFeeQuoteBand"("active", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "idx_platform_fee_performance_active" ON "PlatformFeePerformanceAdjustment"("active", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "idx_platform_fee_loyalty_active" ON "PlatformFeeLoyaltyAdjustment"("active", "effectiveFrom");
