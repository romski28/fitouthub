-- ============================================================
-- Professional Profile — languages spoken + years in business
-- ============================================================

ALTER TABLE "Professional"
ADD COLUMN IF NOT EXISTS "languages" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "Professional"
ADD COLUMN IF NOT EXISTS "yearsInBusiness" INTEGER;
