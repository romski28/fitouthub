-- ============================================================================
-- PM read state + identity for the tender Q&A concierge (Phase D, Path A).
--
-- Adds:
--   Message.senderPmId        — PM identity when a per-pro (project-professional)
--                               message is sent by/at the PM during tender.
--   Message.readByPmAt        — PM read watermark for per-pro threads.
--   ProjectChatMessage.readByPmAt — PM read watermark for the project-general
--                               (PM <-> client) thread.
--
-- senderType is a plain String, so 'pm' needs no enum migration.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then run
-- `pnpm exec prisma generate`.
-- ============================================================================

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "senderPmId" TEXT,
  ADD COLUMN IF NOT EXISTS "readByPmAt" TIMESTAMPTZ;

ALTER TABLE "ProjectChatMessage"
  ADD COLUMN IF NOT EXISTS "readByPmAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Message_readByPmAt_idx" ON "Message" ("readByPmAt");
CREATE INDEX IF NOT EXISTS "ProjectChatMessage_readByPmAt_idx" ON "ProjectChatMessage" ("readByPmAt");
