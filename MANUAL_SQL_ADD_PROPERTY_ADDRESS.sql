-- ============================================================================
-- Phase A: Canonical property address storage (one row per physical unit)
-- Greenfield — no legacy address data to migrate.
-- Idempotent: safe to re-run.
-- Runbook §5: apply to dev first, verify, then prod (with backup + CTO sign-off).
-- Rollback: DROP TABLE "PropertyMatchCandidate"; DROP TABLE "PropertyAlias";
--           DROP TABLE "PropertyAccountLink"; DROP TABLE "BuildingGazetteer";
--           ALTER TABLE "Project" DROP COLUMN "propertyId"; DROP TABLE "Property";
-- ============================================================================

-- Fuzzy text search (trigram) — used for near-duplicate matching later.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Property: one row = one physical unit (flat), not one building ──
CREATE TABLE IF NOT EXISTS "Property" (
  "id"             TEXT NOT NULL,
  "unitNumber"     TEXT,
  "floorLevel"     TEXT,
  "blockTower"     TEXT,
  "buildingName"   TEXT NOT NULL,
  "buildingNameZh" TEXT,
  "street"         TEXT,
  "districtAreaId" TEXT,
  "zoneId"         TEXT,
  "googlePlaceId"  TEXT,
  "lat"            DECIMAL(9,6),
  "lng"            DECIMAL(9,6),
  "canonicalKey"   TEXT,
  "displayAddress" TEXT,
  "addressVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Property_canonicalKey_key" ON "Property"("canonicalKey");
CREATE INDEX IF NOT EXISTS "Property_districtAreaId_idx" ON "Property"("districtAreaId");
CREATE INDEX IF NOT EXISTS "Property_zoneId_idx" ON "Property"("zoneId");
CREATE INDEX IF NOT EXISTS "Property_buildingName_idx" ON "Property"("buildingName");
CREATE INDEX IF NOT EXISTS "Property_buildingName_trgm_idx" ON "Property" USING gin ("buildingName" gin_trgm_ops);

ALTER TABLE "Property"
  DROP CONSTRAINT IF EXISTS "Property_districtAreaId_fkey";
ALTER TABLE "Property"
  ADD CONSTRAINT "Property_districtAreaId_fkey"
  FOREIGN KEY ("districtAreaId") REFERENCES "RegionArea"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Property"
  DROP CONSTRAINT IF EXISTS "Property_zoneId_fkey";
ALTER TABLE "Property"
  ADD CONSTRAINT "Property_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "RegionZone"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PropertyAccountLink: persona-scoped accounts linked to a unit ──
-- role is a denormalised snapshot of Persona.type at link time.
CREATE TABLE IF NOT EXISTS "PropertyAccountLink" (
  "id"         TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "personaId"  TEXT NOT NULL,
  "role"       TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyAccountLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PropertyAccountLink_propertyId_personaId_key"
  ON "PropertyAccountLink"("propertyId", "personaId");
CREATE INDEX IF NOT EXISTS "PropertyAccountLink_personaId_idx"
  ON "PropertyAccountLink"("personaId");

ALTER TABLE "PropertyAccountLink"
  DROP CONSTRAINT IF EXISTS "PropertyAccountLink_propertyId_fkey";
ALTER TABLE "PropertyAccountLink"
  ADD CONSTRAINT "PropertyAccountLink_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyAccountLink"
  DROP CONSTRAINT IF EXISTS "PropertyAccountLink_personaId_fkey";
ALTER TABLE "PropertyAccountLink"
  ADD CONSTRAINT "PropertyAccountLink_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PropertyAlias: alternative building/unit spellings for the normaliser ──
CREATE TABLE IF NOT EXISTS "PropertyAlias" (
  "id"              TEXT NOT NULL,
  "propertyId"      TEXT NOT NULL,
  "alias"           TEXT NOT NULL,
  "aliasNormalized" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PropertyAlias_propertyId_aliasNormalized_key"
  ON "PropertyAlias"("propertyId", "aliasNormalized");
CREATE INDEX IF NOT EXISTS "PropertyAlias_aliasNormalized_idx"
  ON "PropertyAlias"("aliasNormalized");

ALTER TABLE "PropertyAlias"
  DROP CONSTRAINT IF EXISTS "PropertyAlias_propertyId_fkey";
ALTER TABLE "PropertyAlias"
  ADD CONSTRAINT "PropertyAlias_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PropertyMatchCandidate: admin review queue for near-duplicates ──
CREATE TABLE IF NOT EXISTS "PropertyMatchCandidate" (
  "id"                  TEXT NOT NULL,
  "sourcePropertyId"    TEXT NOT NULL,
  "candidatePropertyId" TEXT NOT NULL,
  "similarity"          DOUBLE PRECISION NOT NULL,
  "reasons"             JSONB,
  "status"              TEXT NOT NULL DEFAULT 'pending',
  "resolvedBy"          TEXT,
  "resolvedAt"          TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyMatchCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PropertyMatchCandidate_status_idx" ON "PropertyMatchCandidate"("status");
CREATE INDEX IF NOT EXISTS "PropertyMatchCandidate_sourcePropertyId_idx" ON "PropertyMatchCandidate"("sourcePropertyId");
CREATE INDEX IF NOT EXISTS "PropertyMatchCandidate_candidatePropertyId_idx" ON "PropertyMatchCandidate"("candidatePropertyId");

ALTER TABLE "PropertyMatchCandidate"
  DROP CONSTRAINT IF EXISTS "PropertyMatchCandidate_sourcePropertyId_fkey";
ALTER TABLE "PropertyMatchCandidate"
  ADD CONSTRAINT "PropertyMatchCandidate_sourcePropertyId_fkey"
  FOREIGN KEY ("sourcePropertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyMatchCandidate"
  DROP CONSTRAINT IF EXISTS "PropertyMatchCandidate_candidatePropertyId_fkey";
ALTER TABLE "PropertyMatchCandidate"
  ADD CONSTRAINT "PropertyMatchCandidate_candidatePropertyId_fkey"
  FOREIGN KEY ("candidatePropertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── BuildingGazetteer: staging for the CSDI building/address import ──
-- HK1980 grid (x/y) can be converted to WGS84 lat/lng without Google.
CREATE TABLE IF NOT EXISTS "BuildingGazetteer" (
  "id"             TEXT NOT NULL,
  "sourceId"       TEXT,
  "nameEn"         TEXT,
  "nameZh"         TEXT,
  "usageCode"      TEXT,
  "usageDesc"      TEXT,
  "category"       TEXT,
  "street"         TEXT,
  "districtAreaId" TEXT,
  "xCoord"         DECIMAL(12,3),
  "yCoord"         DECIMAL(12,3),
  "lat"            DECIMAL(9,6),
  "lng"            DECIMAL(9,6),
  "addressFull"    TEXT,
  "isResidential"  BOOLEAN NOT NULL DEFAULT false,
  "importedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BuildingGazetteer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BuildingGazetteer_category_idx" ON "BuildingGazetteer"("category");
CREATE INDEX IF NOT EXISTS "BuildingGazetteer_nameEn_idx" ON "BuildingGazetteer"("nameEn");
CREATE INDEX IF NOT EXISTS "BuildingGazetteer_districtAreaId_idx" ON "BuildingGazetteer"("districtAreaId");
CREATE INDEX IF NOT EXISTS "BuildingGazetteer_nameEn_trgm_idx" ON "BuildingGazetteer" USING gin ("nameEn" gin_trgm_ops);

-- ── Project → Property link (a project points at the unit, not free text) ──
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "propertyId" TEXT;

ALTER TABLE "Project"
  DROP CONSTRAINT IF EXISTS "Project_propertyId_fkey";
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Project_propertyId_idx" ON "Project"("propertyId");
