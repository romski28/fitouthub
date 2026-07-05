-- ============================================================================
-- MANUAL SQL: Step 6a — Add personaId to cross-cutting tables
-- (Tables that have BOTH userId and professionalId)
-- Forward: adds personaId column + backfills for all 9 tables
-- Reverse: MANUAL_SQL_REVERSE_FK_MIGRATION_STEP6A.sql
-- ============================================================================

-- ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ActivityLog" a SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = a."userId" OR p."professionalId" = a."professionalId" LIMIT 1
) WHERE a."personaId" IS NULL AND (a."userId" IS NOT NULL OR a."professionalId" IS NOT NULL);

-- NotificationLog
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "NotificationLog" n SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = n."userId" OR p."professionalId" = n."professionalId" LIMIT 1
) WHERE n."personaId" IS NULL AND (n."userId" IS NOT NULL OR n."professionalId" IS NOT NULL);

-- NotificationPreference
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "NotificationPreference" np SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = np."userId" OR p."professionalId" = np."professionalId" LIMIT 1
) WHERE np."personaId" IS NULL AND (np."userId" IS NOT NULL OR np."professionalId" IS NOT NULL);

-- PushSubscription
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "PushSubscription" ps SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = ps."userId" OR p."professionalId" = ps."professionalId" LIMIT 1
) WHERE ps."personaId" IS NULL AND (ps."userId" IS NOT NULL OR ps."professionalId" IS NOT NULL);

-- NextStepAction
ALTER TABLE "NextStepAction" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "NextStepAction" nsa SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = nsa."userId" OR p."professionalId" = nsa."professionalId" LIMIT 1
) WHERE nsa."personaId" IS NULL AND (nsa."userId" IS NOT NULL OR nsa."professionalId" IS NOT NULL);

-- PrivateChatThread
ALTER TABLE "PrivateChatThread" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "PrivateChatThread" pct SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = pct."userId" OR p."professionalId" = pct."professionalId" LIMIT 1
) WHERE pct."personaId" IS NULL AND (pct."userId" IS NOT NULL OR pct."professionalId" IS NOT NULL);

-- ProjectAssistRequest
ALTER TABLE "ProjectAssistRequest" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProjectAssistRequest" par SET "personaId" = (
  SELECT p."id" FROM "Persona" p WHERE p."userId" = par."userId" OR p."professionalId" = par."professionalId" LIMIT 1
) WHERE par."personaId" IS NULL AND (par."userId" IS NOT NULL OR par."professionalId" IS NOT NULL);

-- Project (0 rows, but schema prep)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "personaId" TEXT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- SELECT 'ActivityLog' AS tbl, count(*) AS with_persona FROM "ActivityLog" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'NotificationLog', count(*) FROM "NotificationLog" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'NotifPref', count(*) FROM "NotificationPreference" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'PushSub', count(*) FROM "PushSubscription" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'NextStepAction', count(*) FROM "NextStepAction" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'ChatThread', count(*) FROM "PrivateChatThread" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'AssistReq', count(*) FROM "ProjectAssistRequest" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'Project', count(*) FROM "Project" WHERE "personaId" IS NOT NULL;
