ALTER TABLE "PrivateChatMessage"
ADD COLUMN IF NOT EXISTS "context" JSONB;

ALTER TABLE "AnonymousChatMessage"
ADD COLUMN IF NOT EXISTS "context" JSONB;
