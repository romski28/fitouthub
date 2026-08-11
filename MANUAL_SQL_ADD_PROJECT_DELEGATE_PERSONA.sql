-- Project Delegate persona: schema extension + CHECK constraint updates
-- Run this in the target database before deploying backend auth changes.
-- NOTE: Steps 3-4 are idempotent if prior persona migrations were already run.

BEGIN;

-- 1) Create ProjectDelegate table (mirrors schema.prisma ProjectDelegate model)
CREATE TABLE IF NOT EXISTS "ProjectDelegate" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  "assistedClientId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "relationshipType" TEXT NOT NULL DEFAULT 'family',
  "canScanQr" BOOLEAN NOT NULL DEFAULT true,
  "canApprovePayments" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Add projectDelegateId FK to Persona table
ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "projectDelegateId" TEXT;
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_projectDelegateId_fkey"
  FOREIGN KEY ("projectDelegateId") REFERENCES "ProjectDelegate"(id) ON DELETE SET NULL;

-- 3) Add project_delegate to User.role CHECK constraint
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'reseller', 'surveyor', 'mimo_boh', 'landlord', 'property_manager', 'estate_agent', 'project_delegate'));

-- 4) Add project_delegate to calendar participant role CHECK
ALTER TABLE mimo_calendar_event_participants DROP CONSTRAINT IF EXISTS mimo_calendar_event_participants_role_check;
ALTER TABLE mimo_calendar_event_participants
  ADD CONSTRAINT mimo_calendar_event_participants_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'surveyor', 'mimo_boh', 'observer', 'landlord', 'property_manager', 'estate_agent', 'project_delegate'));

COMMIT;
