-- Switch trades to use existing Tradesman table
-- Drop old Trade-backed tables if present
DROP TABLE IF EXISTS "ServiceMapping";
DROP TABLE IF EXISTS "Trade";

-- Extend Tradesman with fields needed for trades admin
ALTER TABLE "Tradesman"
  ADD COLUMN IF NOT EXISTS "aliases" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "professionType" TEXT,
  ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 999;

CREATE INDEX IF NOT EXISTS "Tradesman_category_idx" ON "Tradesman"("category");
CREATE INDEX IF NOT EXISTS "Tradesman_enabled_idx" ON "Tradesman"("enabled");
CREATE INDEX IF NOT EXISTS "Tradesman_professionType_idx" ON "Tradesman"("professionType");

-- Recreate ServiceMapping pointed at Tradesman
CREATE TABLE "ServiceMapping" (
  "id" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceMapping_keyword_key" ON "ServiceMapping"("keyword");
CREATE INDEX "ServiceMapping_keyword_idx" ON "ServiceMapping"("keyword");
CREATE INDEX "ServiceMapping_tradeId_idx" ON "ServiceMapping"("tradeId");
CREATE INDEX "ServiceMapping_enabled_idx" ON "ServiceMapping"("enabled");

ALTER TABLE "ServiceMapping"
  ADD CONSTRAINT "ServiceMapping_tradeId_fkey"
  FOREIGN KEY ("tradeId") REFERENCES "Tradesman"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
