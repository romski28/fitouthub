-- ============================================================================
-- REVERSE: Step 1 — Drop Identity table and identityId columns
-- Run this to undo MANUAL_SQL_ADD_IDENTITY_TABLE.sql
-- Only safe if no data has been migrated (Step 1 is schema-only)
-- ============================================================================

ALTER TABLE "Professional" DROP COLUMN IF EXISTS "identityId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "identityId";
DROP TABLE IF EXISTS "Identity" CASCADE;
