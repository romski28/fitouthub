-- MANUAL_SQL_ADD_ADDRESS_VISIBLE.sql
-- Add addressVisible and addressVisibleAt to ProjectProfessional table
-- Run this manually against the production database

ALTER TABLE "ProjectProfessional"
ADD COLUMN IF NOT EXISTS "addressVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "addressVisibleAt" TIMESTAMPTZ;
