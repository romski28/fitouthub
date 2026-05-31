-- Phase B: Expanded site access hydration fields for client address book + project snapshots
-- Safe to run on an existing database. No reseed required.

BEGIN;

ALTER TABLE client_site_addresses
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "propertyType" TEXT,
  ADD COLUMN IF NOT EXISTS "propertySize" TEXT,
  ADD COLUMN IF NOT EXISTS "propertyAge" TEXT,
  ADD COLUMN IF NOT EXISTS "existingConditions" TEXT,
  ADD COLUMN IF NOT EXISTS "accessHoursType" TEXT,
  ADD COLUMN IF NOT EXISTS "workingHoursWindow" TEXT;

ALTER TABLE project_sites
  ADD COLUMN IF NOT EXISTS "districtSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "propertyTypeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "propertySizeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "propertyAgeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "existingConditionsSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "accessHoursTypeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "workingHoursWindowSnapshot" TEXT;

ALTER TABLE "ProjectLocationDetails"
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "accessHoursType" TEXT,
  ADD COLUMN IF NOT EXISTS "workingHoursWindow" TEXT;

CREATE INDEX IF NOT EXISTS idx_client_site_addresses_district
  ON client_site_addresses ("district")
  WHERE "district" IS NOT NULL;

COMMIT;
