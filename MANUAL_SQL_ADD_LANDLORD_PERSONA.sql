-- Landlord persona: schema extension + CHECK constraint updates
-- Run this in the target database before deploying backend auth changes.

BEGIN;

-- 1) Create Landlord table (mirrors schema.prisma Landlord model)
CREATE TABLE IF NOT EXISTS "Landlord" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  "portfolioLabel" TEXT,
  "propertyCount" INTEGER NOT NULL DEFAULT 1,
  "preferredPaymentMethod" TEXT,
  "companyName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Add landlordId FK to Persona table
ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "landlordId" TEXT;
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_landlordId_fkey"
  FOREIGN KEY ("landlordId") REFERENCES "Landlord"(id) ON DELETE SET NULL;

-- 3) Add landlord to User.role CHECK constraint
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'reseller', 'surveyor', 'mimo_boh', 'landlord'));

-- 4) Add landlord to calendar participant role CHECK
ALTER TABLE mimo_calendar_event_participants DROP CONSTRAINT IF EXISTS mimo_calendar_event_participants_role_check;
ALTER TABLE mimo_calendar_event_participants
  ADD CONSTRAINT mimo_calendar_event_participants_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'surveyor', 'mimo_boh', 'observer', 'landlord'));

COMMIT;
