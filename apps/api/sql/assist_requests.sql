-- Project Assist Requests: tracks client requests for FOH assistance
CREATE TABLE IF NOT EXISTS "ProjectAssistRequest" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "userId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'open', -- open | in_progress | closed
  "notes" TEXT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for assist requests
CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_projectId_idx" ON "ProjectAssistRequest" ("projectId");
CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_status_idx" ON "ProjectAssistRequest" ("status");

-- Optional: if you prefer DB to generate ids, you can use UUIDs
-- ALTER TABLE "ProjectAssistRequest" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- Assist Messages: private FOH-client communication threads tied to assist requests
CREATE TABLE IF NOT EXISTS "AssistMessage" (
  "id" TEXT PRIMARY KEY,
  "assistRequestId" TEXT NOT NULL REFERENCES "ProjectAssistRequest"("id") ON DELETE CASCADE,
  "senderType" TEXT NOT NULL, -- 'client' | 'foh'
  "senderUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "readByFohAt" TIMESTAMPTZ NULL,
  "readByClientAt" TIMESTAMPTZ NULL
);

-- Indexes for assist messages
CREATE INDEX IF NOT EXISTS "AssistMessage_assistRequestId_idx" ON "AssistMessage" ("assistRequestId");
CREATE INDEX IF NOT EXISTS "AssistMessage_senderType_idx" ON "AssistMessage" ("senderType");
CREATE INDEX IF NOT EXISTS "AssistMessage_createdAt_idx" ON "AssistMessage" ("createdAt");

-- Notes:
-- 1) These tables are separate from the public professional-client message threads to keep FOH comms private.
-- 2) Prisma models in apps/api/prisma/schema.prisma map to these tables; run a Prisma migration if you prefer ORM-driven changes.
