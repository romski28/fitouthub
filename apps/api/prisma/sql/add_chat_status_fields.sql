-- Add status to private chat threads
ALTER TABLE "PrivateChatThread"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';

-- Add status to anonymous chat threads
ALTER TABLE "AnonymousChatThread"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';
