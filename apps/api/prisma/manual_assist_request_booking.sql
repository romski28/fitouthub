-- Manual SQL for assist request contact preferences and optional call booking slot
-- Run this against the production database before deploying the API changes.

ALTER TABLE "ProjectAssistRequest"
  ADD COLUMN IF NOT EXISTS "contactMethod" TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS "requestedCallAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requestedCallTimezone" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_contactMethod_idx"
  ON "ProjectAssistRequest"("contactMethod");

CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_requestedCallAt_idx"
  ON "ProjectAssistRequest"("requestedCallAt");
