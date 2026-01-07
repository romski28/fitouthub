-- Migration: Convert Invoice + AdvancePaymentRequest to PaymentRequest (multiple) with notes
-- Database: PostgreSQL

BEGIN;

-- 1) Drop Invoice table (no longer used)
-- If any foreign key dependencies exist, drop them first
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Invoice') THEN
    DROP TABLE "Invoice";
  END IF;
END $$;

-- 2) Rename AdvancePaymentRequest -> PaymentRequest
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AdvancePaymentRequest') THEN
    ALTER TABLE "AdvancePaymentRequest" RENAME TO "PaymentRequest";
  END IF;
END $$;

-- 3) Add notes column to PaymentRequest
ALTER TABLE "PaymentRequest"
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- 4) Remove unique constraint on projectProfessionalId to allow multiple requests
-- Try dropping both possible constraint names to be safe across environments
ALTER TABLE "PaymentRequest" DROP CONSTRAINT IF EXISTS "AdvancePaymentRequest_projectProfessionalId_key";
ALTER TABLE "PaymentRequest" DROP CONSTRAINT IF EXISTS "PaymentRequest_projectProfessionalId_key";

-- 5) Ensure index on status exists (non-unique)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'PaymentRequest_status_idx'
  ) THEN
    CREATE INDEX "PaymentRequest_status_idx" ON "PaymentRequest" ("status");
  END IF;
END $$;

COMMIT;

-- Optional sanity checks (run manually as needed):
-- SELECT * FROM "PaymentRequest" ORDER BY "createdAt" DESC LIMIT 10;
-- 
-- If you need to backfill notes for existing records:
-- UPDATE "PaymentRequest" SET "notes" = 'Advance payment for materials' WHERE "notes" IS NULL;
