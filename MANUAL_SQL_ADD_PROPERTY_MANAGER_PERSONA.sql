-- Property Manager persona: schema extension + CHECK constraint updates
-- Run this in the target database before deploying backend auth changes.
-- NOTE: Steps 3-4 are idempotent if MANUAL_SQL_ADD_LANDLORD_PERSONA was already run.

BEGIN;

-- 1) Create PropertyManager table (mirrors schema.prisma PropertyManager model)
CREATE TABLE IF NOT EXISTS "PropertyManager" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  "agencyName" TEXT,
  "licenseNumber" TEXT,
  "managedPropertyCount" INTEGER NOT NULL DEFAULT 0,
  "serviceContractUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Add propertyManagerId FK to Persona table
ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "propertyManagerId" TEXT;
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_propertyManagerId_fkey"
  FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"(id) ON DELETE SET NULL;

-- 3) Add property_manager to User.role CHECK constraint
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'reseller', 'surveyor', 'mimo_boh', 'landlord', 'property_manager'));

-- 4) Add property_manager to calendar participant role CHECK
ALTER TABLE mimo_calendar_event_participants DROP CONSTRAINT IF EXISTS mimo_calendar_event_participants_role_check;
ALTER TABLE mimo_calendar_event_participants
  ADD CONSTRAINT mimo_calendar_event_participants_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'surveyor', 'mimo_boh', 'observer', 'landlord', 'property_manager'));

COMMIT;
