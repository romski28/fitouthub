-- ============================================================================
-- REVERSE: Step 6a — Drop personaId from cross-cutting tables
-- ============================================================================

ALTER TABLE "Project" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProjectAssistRequest" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "PrivateChatThread" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "NextStepAction" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "PushSubscription" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "NotificationLog" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ActivityLog" DROP COLUMN IF EXISTS "personaId";
