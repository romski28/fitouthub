-- Manual SQL: add survey operations roles and unified calendar foundations
-- Run in PostgreSQL (Supabase/Render DB) in a transaction.

BEGIN;

-- 1) Expand role guardrails at DB level when a role CHECK constraint exists.
DO $$
DECLARE
  role_constraint_name text;
BEGIN
  SELECT tc.constraint_name
  INTO role_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema = ccu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'User'
    AND tc.constraint_type = 'CHECK'
    AND ccu.column_name = 'role'
  LIMIT 1;

  IF role_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "User" DROP CONSTRAINT %I', role_constraint_name);
  END IF;
END $$;

ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN ('client', 'professional', 'admin', 'reseller', 'surveyor', 'mimo_boh'));

-- 2) Unified calendar events table.
CREATE TABLE IF NOT EXISTS mimo_calendar_events (
  id text PRIMARY KEY,
  "projectId" text NULL REFERENCES "Project"(id) ON DELETE SET NULL,
  "surveyExtraId" text NULL REFERENCES mimo_project_extras(id) ON DELETE SET NULL,
  "eventType" text NOT NULL,
  title text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'scheduled',
  timezone text NOT NULL DEFAULT 'Asia/Hong_Kong',
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz NULL,
  location text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" text NULL REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("eventType" IN ('survey_visit', 'client_meeting', 'site_visit', 'internal_ops', 'project_milestone')),
  CHECK (status IN ('draft', 'scheduled', 'rescheduled', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_mimo_calendar_events_project_id
  ON mimo_calendar_events ("projectId");

CREATE INDEX IF NOT EXISTS idx_mimo_calendar_events_starts_at
  ON mimo_calendar_events ("startsAt");

CREATE INDEX IF NOT EXISTS idx_mimo_calendar_events_type_status
  ON mimo_calendar_events ("eventType", status);

-- 3) Calendar participants/assignees table.
CREATE TABLE IF NOT EXISTS mimo_calendar_event_participants (
  id text PRIMARY KEY,
  "eventId" text NOT NULL REFERENCES mimo_calendar_events(id) ON DELETE CASCADE,
  "userId" text NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "professionalId" text NULL REFERENCES "Professional"(id) ON DELETE CASCADE,
  role text NOT NULL,
  response text NOT NULL DEFAULT 'pending',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (role IN ('client', 'professional', 'admin', 'surveyor', 'mimo_boh', 'observer')),
  CHECK (response IN ('pending', 'accepted', 'declined', 'tentative')),
  CHECK (
    ("userId" IS NOT NULL AND "professionalId" IS NULL)
    OR ("userId" IS NULL AND "professionalId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mimo_calendar_event_participants_user
  ON mimo_calendar_event_participants ("eventId", "userId")
  WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mimo_calendar_event_participants_professional
  ON mimo_calendar_event_participants ("eventId", "professionalId")
  WHERE "professionalId" IS NOT NULL;

-- 4) Project-level survey assignment table for surveyor operations.
CREATE TABLE IF NOT EXISTS mimo_survey_assignments (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "surveyExtraId" text NULL REFERENCES mimo_project_extras(id) ON DELETE SET NULL,
  "assignedSurveyorUserId" text NULL REFERENCES "User"(id) ON DELETE SET NULL,
  "assignedByUserId" text NULL REFERENCES "User"(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unassigned',
  notes text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scheduledAt" timestamptz NULL,
  "completedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('unassigned', 'assigned', 'scheduled', 'in_progress', 'completed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mimo_survey_assignments_project
  ON mimo_survey_assignments ("projectId");

CREATE INDEX IF NOT EXISTS idx_mimo_survey_assignments_surveyor
  ON mimo_survey_assignments ("assignedSurveyorUserId", status);

-- 5) Keep updatedAt current for write operations.
CREATE OR REPLACE FUNCTION set_mimo_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mimo_calendar_events_updated_at ON mimo_calendar_events;
CREATE TRIGGER trg_mimo_calendar_events_updated_at
  BEFORE UPDATE ON mimo_calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_mimo_updated_at();

DROP TRIGGER IF EXISTS trg_mimo_calendar_event_participants_updated_at ON mimo_calendar_event_participants;
CREATE TRIGGER trg_mimo_calendar_event_participants_updated_at
  BEFORE UPDATE ON mimo_calendar_event_participants
  FOR EACH ROW EXECUTE FUNCTION set_mimo_updated_at();

DROP TRIGGER IF EXISTS trg_mimo_survey_assignments_updated_at ON mimo_survey_assignments;
CREATE TRIGGER trg_mimo_survey_assignments_updated_at
  BEFORE UPDATE ON mimo_survey_assignments
  FOR EACH ROW EXECUTE FUNCTION set_mimo_updated_at();

COMMIT;
