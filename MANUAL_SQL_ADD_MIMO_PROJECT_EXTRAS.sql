-- Create table to persist optional project extras such as survey and design services.
-- Run this manually in production/staging before deploying code that writes these records.

BEGIN;

CREATE TABLE IF NOT EXISTS mimo_project_extras (
  id text PRIMARY KEY DEFAULT ('mx_' || replace(gen_random_uuid()::text, '-', '')),
  "projectId" text NOT NULL,
  "extraType" text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  source text NULL,
  title text NULL,
  summary text NULL,
  notes text NULL,
  price numeric(12, 2) NULL,
  currency text NOT NULL DEFAULT 'HKD',
  metadata jsonb NULL,
  "adminFeedMessageId" text NULL,
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "approvedAt" timestamptz NULL,
  "scheduledAt" timestamptz NULL,
  "startedAt" timestamptz NULL,
  "completedAt" timestamptz NULL,
  "cancelledAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mimo_project_extras_project_fkey
    FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE,
  CONSTRAINT mimo_project_extras_extra_type_check
    CHECK ("extraType" IN ('survey', 'design')),
  CONSTRAINT mimo_project_extras_status_check
    CHECK (status IN ('requested', 'approved', 'scheduled', 'in_progress', 'completed', 'declined', 'cancelled')),
  CONSTRAINT mimo_project_extras_unique_project_type
    UNIQUE ("projectId", "extraType")
);

CREATE INDEX IF NOT EXISTS mimo_project_extras_project_idx
  ON mimo_project_extras ("projectId");

CREATE INDEX IF NOT EXISTS mimo_project_extras_status_idx
  ON mimo_project_extras (status);

CREATE INDEX IF NOT EXISTS mimo_project_extras_type_idx
  ON mimo_project_extras ("extraType");

CREATE INDEX IF NOT EXISTS mimo_project_extras_requested_idx
  ON mimo_project_extras ("requestedAt");

CREATE INDEX IF NOT EXISTS mimo_project_extras_admin_feed_idx
  ON mimo_project_extras ("adminFeedMessageId");

COMMIT;

-- Optional quick verification query:
-- SELECT "projectId", "extraType", status, source, price, currency, "requestedAt", "scheduledAt", "completedAt"
-- FROM mimo_project_extras
-- ORDER BY "requestedAt" DESC
-- LIMIT 20;
