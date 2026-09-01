-- ============================================================================
-- PM call booking — per-PM calendar table for the "Arrange call" quick action.
--
-- Each row is a client-booked call with the project's assigned PM. Used to
-- compute busy intervals for the per-PM call availability calendar.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then run
-- `pnpm exec prisma generate`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PmCallBooking" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "pmId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "PmCallBooking_pmId_idx" ON "PmCallBooking" ("pmId");
CREATE INDEX IF NOT EXISTS "PmCallBooking_projectId_idx" ON "PmCallBooking" ("projectId");
