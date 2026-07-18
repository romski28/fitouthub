-- ============================================================
-- Add deletedAt column to ProjectPhoto for soft-delete support
-- Files are marked as deleted rather than physically removed,
-- preserving audit trail for record-keeping purposes.
-- ============================================================

ALTER TABLE "ProjectPhoto"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
