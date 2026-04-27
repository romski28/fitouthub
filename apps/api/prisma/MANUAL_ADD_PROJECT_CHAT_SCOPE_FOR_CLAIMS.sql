-- Manual DB patch: add scoped project-chat support for claim threads
-- Safe to run multiple times.
--
-- Why this exists:
-- - Materials claim workflow uses project chat with per-claim scoped threads.
-- - Existing project chat remains unchanged when scope fields are null.

BEGIN;

ALTER TABLE "ProjectChatMessage"
  ADD COLUMN IF NOT EXISTS "threadScope" TEXT,
  ADD COLUMN IF NOT EXISTS "threadScopeId" TEXT;

-- Composite lookup index for scoped thread reads in project chat
CREATE INDEX IF NOT EXISTS "ProjectChatMessage_thread_scope_idx"
  ON "ProjectChatMessage" ("threadId", "threadScope", "threadScopeId");

COMMIT;

-- Verification
-- SELECT "id", "threadId", "threadScope", "threadScopeId", "createdAt"
-- FROM "ProjectChatMessage"
-- ORDER BY "createdAt" DESC
-- LIMIT 20;
