-- Migration: Consolidate Pattern table into ServiceMapping
-- Run this manually on your production database

-- Step 1: Migrate existing Pattern records to ServiceMapping
-- Only migrate patterns that have a mapsTo value and don't already exist in ServiceMapping
INSERT INTO "ServiceMapping" (id, keyword, "tradeId", confidence, enabled, "usageCount", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text as id,
  p.pattern as keyword,
  t.id as "tradeId",
  100 as confidence,
  p.enabled as enabled,
  0 as "usageCount",
  p."createdAt" as "createdAt",
  p."updatedAt" as "updatedAt"
FROM "Pattern" p
JOIN "Tradesman" t ON LOWER(t."professionType") = LOWER(p."mapsTo")
WHERE p."mapsTo" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ServiceMapping" sm 
    WHERE LOWER(sm.keyword) = LOWER(p.pattern)
  );

-- Step 2: Review migrated data
SELECT 
  sm.keyword,
  t.title as trade_name,
  t."professionType",
  sm.enabled
FROM "ServiceMapping" sm
JOIN "Tradesman" t ON sm."tradeId" = t.id
ORDER BY t.title, sm.keyword;

-- Step 3: Drop Pattern table (uncomment after verifying migration)
-- DROP TABLE "Pattern";

-- Step 4: Verify ServiceMapping has all expected records
SELECT 
  t.title,
  COUNT(sm.id) as mapping_count
FROM "Tradesman" t
LEFT JOIN "ServiceMapping" sm ON sm."tradeId" = t.id
GROUP BY t.title
ORDER BY mapping_count DESC;
