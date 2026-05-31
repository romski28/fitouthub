-- Phase A: Client address book + project site selection/snapshot foundation
-- Run this script in the target database before enabling Phase A UI selection.

BEGIN;

CREATE TABLE IF NOT EXISTS client_site_addresses (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  label TEXT,
  "buildingName" TEXT,
  "addressFull" TEXT NOT NULL,
  "unitNumber" TEXT,
  "floorLevel" TEXT,
  "district" TEXT,
  "postalCode" TEXT,
  "propertyType" TEXT,
  "propertySize" TEXT,
  "propertyAge" TEXT,
  "accessDetails" TEXT,
  "existingConditions" TEXT,
  "accessHoursType" TEXT,
  "workingHoursWindow" TEXT,
  "onSiteContactName" TEXT,
  "onSiteContactPhone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_client_site_addresses_user
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_site_addresses_user
  ON client_site_addresses ("userId", "isActive", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS project_sites (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "clientAddressId" TEXT,
  "siteLabel" TEXT,
  "buildingName" TEXT,
  "addressFullSnapshot" TEXT,
  "unitNumberSnapshot" TEXT,
  "floorLevelSnapshot" TEXT,
  "districtSnapshot" TEXT,
  "postalCodeSnapshot" TEXT,
  "propertyTypeSnapshot" TEXT,
  "propertySizeSnapshot" TEXT,
  "propertyAgeSnapshot" TEXT,
  "accessDetailsSnapshot" TEXT,
  "existingConditionsSnapshot" TEXT,
  "accessHoursTypeSnapshot" TEXT,
  "workingHoursWindowSnapshot" TEXT,
  "onSiteContactNameSnapshot" TEXT,
  "onSiteContactPhoneSnapshot" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_project_sites_project
    FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_sites_client_address
    FOREIGN KEY ("clientAddressId") REFERENCES client_site_addresses(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_sites_created_by
    FOREIGN KEY ("createdByUserId") REFERENCES "User"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_project_sites_project_active
  ON project_sites ("projectId", "isActive", "updatedAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_sites_primary_per_project
  ON project_sites ("projectId", "isPrimary")
  WHERE "isPrimary" = TRUE;

CREATE OR REPLACE FUNCTION set_phase_a_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_site_addresses_updated_at ON client_site_addresses;
CREATE TRIGGER trg_client_site_addresses_updated_at
  BEFORE UPDATE ON client_site_addresses
  FOR EACH ROW EXECUTE FUNCTION set_phase_a_updated_at();

DROP TRIGGER IF EXISTS trg_project_sites_updated_at ON project_sites;
CREATE TRIGGER trg_project_sites_updated_at
  BEFORE UPDATE ON project_sites
  FOR EACH ROW EXECUTE FUNCTION set_phase_a_updated_at();

COMMIT;
