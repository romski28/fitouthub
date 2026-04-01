-- Add project scoping to private FOH chat threads.
-- Run manually in environments where Prisma cannot connect directly.

BEGIN;

ALTER TABLE "PrivateChatThread"
  ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "PrivateChatThread"
  DROP CONSTRAINT IF EXISTS "PrivateChatThread_userId_key";

ALTER TABLE "PrivateChatThread"
  DROP CONSTRAINT IF EXISTS "PrivateChatThread_professionalId_key";

CREATE INDEX IF NOT EXISTS "PrivateChatThread_projectId_idx"
ON "PrivateChatThread"("projectId");

CREATE INDEX IF NOT EXISTS "PrivateChatThread_userId_projectId_idx"
ON "PrivateChatThread"("userId", "projectId");

CREATE INDEX IF NOT EXISTS "PrivateChatThread_professionalId_projectId_idx"
ON "PrivateChatThread"("professionalId", "projectId");

COMMIT;

-- Optional sanity checks:
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'PrivateChatThread' AND column_name = 'projectId';
--
-- SELECT conname
-- FROM pg_constraint
-- WHERE conrelid = '"PrivateChatThread"'::regclass
--   AND conname IN ('PrivateChatThread_userId_key', 'PrivateChatThread_professionalId_key');