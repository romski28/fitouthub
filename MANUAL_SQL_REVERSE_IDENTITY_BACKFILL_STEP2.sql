-- ============================================================================
-- REVERSE: Step 2 — Undo Identity backfill
-- Run this to undo MANUAL_SQL_BACKFILL_IDENTITY_STEP2.sql
-- Restores: identityId → NULL on User/Professional, deletes backfilled Identity rows
-- ============================================================================

-- 1. Unlink User
UPDATE "User" SET "identityId" = NULL WHERE "identityId" LIKE 'id_user_%';

-- 2. Unlink Professional
UPDATE "Professional" SET "identityId" = NULL WHERE "identityId" LIKE 'id_pro_%' OR "identityId" LIKE 'id_user_%';

-- 3. Delete backfilled Identity rows
DELETE FROM "Identity" WHERE "id" LIKE 'id_user_%' OR "id" LIKE 'id_pro_%';
