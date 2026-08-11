-- Estate Agent persona: schema extension + CHECK constraint updates
-- Run this in the target database before deploying backend auth changes.
-- NOTE: Steps 3-4 are idempotent if prior persona migrations were already run.

BEGIN;

-- 1) Create EstateAgent table (mirrors schema.prisma EstateAgent model)
CREATE TABLE IF NOT EXISTS "EstateAgent" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  "agencyName" TEXT,
  "licenseNumber" TEXT,
  "agencyLogo" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Add estateAgentId FK to Persona table
ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "estateAgentId" TEXT;
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_estateAgentId_fkey"
  FOREIGN KEY ("estateAgentId") REFERENCES "EstateAgent"(id) ON DELETE SET NULL;

-- 3) Add estate_agent to User.role CHECK constraint
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'reseller', 'surveyor', 'mimo_boh', 'landlord', 'property_manager', 'estate_agent'));

-- 4) Add estate_agent to calendar participant role CHECK
ALTER TABLE mimo_calendar_event_participants DROP CONSTRAINT IF EXISTS mimo_calendar_event_participants_role_check;
ALTER TABLE mimo_calendar_event_participants
  ADD CONSTRAINT mimo_calendar_event_participants_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'surveyor', 'mimo_boh', 'observer', 'landlord', 'property_manager', 'estate_agent'));

COMMIT;
