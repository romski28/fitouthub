-- Landlord persona: schema extension + CHECK constraint updates
-- Run this in the target database before deploying backend auth changes.

BEGIN;

-- 1) Add landlord to User.role CHECK constraint
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'reseller', 'surveyor', 'mimo_boh', 'landlord'));

-- 2) Add landlord to calendar participant role CHECK
ALTER TABLE mimo_calendar_event_participants DROP CONSTRAINT IF EXISTS mimo_calendar_event_participants_role_check;
ALTER TABLE mimo_calendar_event_participants
  ADD CONSTRAINT mimo_calendar_event_participants_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'surveyor', 'mimo_boh', 'observer', 'landlord'));

COMMIT;
