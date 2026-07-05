-- ============================================================================
-- REVERSE: Step 5 — Drop Persona table and unlink
-- Run this to undo MANUAL_SQL_ADD_PERSONA_TABLE_STEP5.sql
-- Only safe if no downstream FKs have been migrated to personaId (Step 6)
-- ============================================================================

UPDATE "Professional" SET "personaId" = NULL WHERE "personaId" IS NOT NULL;
UPDATE "User" SET "personaId" = NULL WHERE "personaId" IS NOT NULL;
DELETE FROM "Persona" WHERE "id" LIKE 'pers_user_%' OR "id" LIKE 'pers_pro_%';
ALTER TABLE "Professional" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "personaId";
DROP TABLE IF EXISTS "Persona" CASCADE;
