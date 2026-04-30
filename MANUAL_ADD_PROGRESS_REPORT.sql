-- =============================================================================
-- MANUAL_ADD_PROGRESS_REPORT.sql
-- =============================================================================
-- Purpose : Create ProjectPhoto and ProgressReport tables and add sign-off
--           columns to ProjectMilestone.  Safe to run multiple times –
--           all DDL uses IF NOT EXISTS / DO NOTHING guards.
--
-- Run this once on any production DB that was bootstrapped before these models
-- were added to the Prisma schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ProjectPhoto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProjectPhoto" (
  "id"        TEXT        NOT NULL PRIMARY KEY,
  "projectId" TEXT        NOT NULL,
  "url"       TEXT        NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ProjectPhoto_projectId_idx" ON "ProjectPhoto" ("projectId");

ALTER TABLE "ProjectPhoto"
  ADD CONSTRAINT "ProjectPhoto_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  NOT VALID;   -- NOT VALID skips row scan; safe on large tables

-- ---------------------------------------------------------------------------
-- 2. ProgressReport
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProgressReport" (
  "id"                    TEXT        NOT NULL PRIMARY KEY,
  "projectId"             TEXT        NOT NULL,
  "projectProfessionalId" TEXT,
  "submittedById"         TEXT        NOT NULL,
  "submittedByRole"       TEXT        NOT NULL DEFAULT 'professional',
  "milestoneId"           TEXT,
  "photoEntries"          JSONB       NOT NULL DEFAULT '[]',
  "narrativeSummary"      TEXT,
  "signOffRequested"      BOOLEAN     NOT NULL DEFAULT FALSE,
  "signOffStatus"         TEXT,       -- pending | approved | rejected
  "chatMessageId"         TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ProgressReport_projectId_idx"   ON "ProgressReport" ("projectId");
CREATE INDEX IF NOT EXISTS "ProgressReport_milestoneId_idx" ON "ProgressReport" ("milestoneId");

ALTER TABLE "ProgressReport"
  ADD CONSTRAINT "ProgressReport_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
  NOT VALID;

-- ---------------------------------------------------------------------------
-- 3. ProjectMilestone — sign-off columns (add only if missing)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProjectMilestone' AND column_name = 'signOffRequested'
  ) THEN
    ALTER TABLE "ProjectMilestone" ADD COLUMN "signOffRequested" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProjectMilestone' AND column_name = 'signOffRequestedAt'
  ) THEN
    ALTER TABLE "ProjectMilestone" ADD COLUMN "signOffRequestedAt" TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProjectMilestone' AND column_name = 'signOffStatus'
  ) THEN
    ALTER TABLE "ProjectMilestone" ADD COLUMN "signOffStatus" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProjectMilestone' AND column_name = 'signOffApprovedAt'
  ) THEN
    ALTER TABLE "ProjectMilestone" ADD COLUMN "signOffApprovedAt" TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProjectMilestone' AND column_name = 'signOffRejectedAt'
  ) THEN
    ALTER TABLE "ProjectMilestone" ADD COLUMN "signOffRejectedAt" TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================================================
-- Verification
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('ProjectPhoto','ProgressReport');
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'ProjectMilestone' AND column_name LIKE 'signOff%'
-- ORDER BY column_name;
