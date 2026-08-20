-- ============================================================================
-- BuildingGazetteer: add CSDI "Building information and age records" columns.
-- Idempotent. Apply after MANUAL_SQL_ADD_PROPERTY_ADDRESS.sql.
-- ============================================================================

ALTER TABLE "BuildingGazetteer" ADD COLUMN IF NOT EXISTS "districtName" TEXT;
ALTER TABLE "BuildingGazetteer" ADD COLUMN IF NOT EXISTS "regionName"   TEXT;
ALTER TABLE "BuildingGazetteer" ADD COLUMN IF NOT EXISTS "buildingType" TEXT;
