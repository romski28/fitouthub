-- ============================================================================
-- FINANCIAL CONSOLIDATION: Add fields to FinancialTransaction table
-- ============================================================================
-- This script adds new columns to support consolidated financial transaction
-- tracking with professional linking and action lifecycle fields.
--
-- Execute in Supabase SQL editor after backing up the database.
-- ============================================================================

-- Step 1: Add new columns to FinancialTransaction table
-- ============================================================================

ALTER TABLE "FinancialTransaction"
ADD COLUMN "professionalId" TEXT,
ADD COLUMN "actionBy" TEXT,
ADD COLUMN "actionByRole" VARCHAR(50),
ADD COLUMN "actionComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "actionAt" TIMESTAMP(3);

-- Step 2: Add foreign key constraint for professionalId
-- ============================================================================

ALTER TABLE "FinancialTransaction"
ADD CONSTRAINT "FinancialTransaction_professionalId_fkey" 
FOREIGN KEY ("professionalId") REFERENCES "Professional" ("id") ON DELETE SET NULL;

-- Step 3: Populate professionalId from projectProfessional relationship
-- ============================================================================
-- This joins FinancialTransaction → ProjectProfessional → Professional

UPDATE "FinancialTransaction" ft
SET "professionalId" = pp."professionalId"
FROM "ProjectProfessional" pp
WHERE ft."projectProfessionalId" = pp."id"
  AND ft."projectProfessionalId" IS NOT NULL
  AND ft."professionalId" IS NULL;

-- Step 4: Mark already-completed transactions as actionComplete
-- ============================================================================
-- Transactions with final statuses already have actions taken

UPDATE "FinancialTransaction"
SET "actionComplete" = true
WHERE "status" IN ('confirmed', 'completed', 'rejected', 'paid')
  AND "actionComplete" = false;

-- For transactions with approvedBy/approvedAt already set, mark actionComplete
UPDATE "FinancialTransaction"
SET "actionComplete" = true,
    "actionBy" = "approvedBy",
    "actionAt" = "approvedAt"
WHERE "approvedBy" IS NOT NULL
  AND "actionComplete" = false;

-- Step 5: Mark info transactions as complete (they don't need action)
-- ============================================================================

UPDATE "FinancialTransaction"
SET "actionComplete" = true
WHERE "status" = 'info'
  AND "actionComplete" = false;

-- Step 6: Create indexes for new columns to optimize filtering
-- ============================================================================

CREATE INDEX "FinancialTransaction_professionalId_idx" ON "FinancialTransaction" ("professionalId");
CREATE INDEX "FinancialTransaction_actionComplete_idx" ON "FinancialTransaction" ("actionComplete");

-- Step 7: Verify the changes
-- ============================================================================
-- Run these queries to verify the migration was successful

-- Check column additions
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'FinancialTransaction' 
--   AND column_name IN ('professionalId', 'actionBy', 'actionByRole', 'actionComplete', 'actionAt')
-- ORDER BY ordinal_position;

-- Check data population (sample)
-- SELECT 
--   id, 
--   type, 
--   status, 
--   "projectProfessionalId", 
--   "professionalId", 
--   "actionComplete", 
--   "actionBy",
--   "actionAt"
-- FROM "FinancialTransaction"
-- LIMIT 10;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- The FinancialTransaction table now supports:
-- - Direct professional linking via professionalId
-- - Action tracking (who, when, what role)
-- - Action completion status
-- - Backward compatibility (approvedBy/approvedAt still available)
-- 
-- Next steps:
-- 1. Test in development
-- 2. Update application code to populate new fields
-- 3. Update approval/rejection logic to use actionBy/actionByRole/actionAt
-- 4. Update frontend queries to filter on actionComplete
-- 5. Eventually deprecate approvedBy/approvedAt fields
-- ============================================================================
