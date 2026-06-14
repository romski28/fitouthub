-- ============================================================
-- Backfill servicePrimaries from canonical ProfessionalRegionCoverage
-- ============================================================
-- Regenerates servicePrimaries using the Zone label directly, 
-- bypassing any legacy data in locationPrimary/locationSecondary.
-- This ensures ONLY the canonical 5 HK zone labels appear:
--   Hong Kong Island, Kowloon, New Territories East, 
--   New Territories West, Islands

UPDATE "Professional" p
SET "servicePrimaries" = sub.zones
FROM (
  SELECT prc."professionalId",
    ARRAY_AGG(DISTINCT z.label ORDER BY z.label) AS zones
  FROM "ProfessionalRegionCoverage" prc
  JOIN "RegionZone" z ON z.id = prc."zoneId"
  WHERE z.label IS NOT NULL
  GROUP BY prc."professionalId"
) sub
WHERE p.id = sub."professionalId";
