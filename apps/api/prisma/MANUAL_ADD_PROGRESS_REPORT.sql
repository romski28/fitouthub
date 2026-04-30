-- ============================================================
-- MANUAL_ADD_PROGRESS_REPORT.sql
-- Adds progress report fields to ProjectMilestone and creates
-- the ProgressReport table for in-progress reporting + sign-off.
-- Safe to re-run (idempotent via IF NOT EXISTS / DO NOTHING).
-- Run once against production DB after deploying the API.
-- ============================================================

BEGIN;

-- Add sign-off tracking fields to ProjectMilestone
ALTER TABLE "ProjectMilestone"
  ADD COLUMN IF NOT EXISTS "signOffRequested"   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "signOffRequestedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "signOffStatus"      TEXT,
  ADD COLUMN IF NOT EXISTS "signOffApprovedAt"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "signOffRejectedAt"  TIMESTAMPTZ;

-- Create ProgressReport table
CREATE TABLE IF NOT EXISTS "ProgressReport" (
  "id"                    TEXT         NOT NULL,
  "projectId"             TEXT         NOT NULL,
  "projectProfessionalId" TEXT,
  "submittedById"         TEXT         NOT NULL,
  "submittedByRole"       TEXT         NOT NULL DEFAULT 'professional',
  "milestoneId"           TEXT,
  "photoEntries"          JSONB        NOT NULL DEFAULT '[]',
  "narrativeSummary"      TEXT,
  "signOffRequested"      BOOLEAN      NOT NULL DEFAULT false,
  "signOffStatus"         TEXT,
  "chatMessageId"         TEXT,
  "createdAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgressReport_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProgressReport_projectId_idx"   ON "ProgressReport"("projectId");
CREATE INDEX IF NOT EXISTS "ProgressReport_milestoneId_idx" ON "ProgressReport"("milestoneId");

COMMIT;
