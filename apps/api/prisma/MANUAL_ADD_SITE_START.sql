-- ============================================================
-- MANUAL_ADD_SITE_START.sql
-- Adds on-site project start fields to the Project table.
-- Safe to re-run (idempotent via IF NOT EXISTS / DO NOTHING).
-- Run once against production DB after deploying the API.
-- ============================================================

BEGIN;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "siteStartedAt"          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "siteStartConfirmedById"  TEXT;

COMMIT;
