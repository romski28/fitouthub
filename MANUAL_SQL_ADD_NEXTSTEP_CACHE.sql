-- Add nextStepCache JSON column to Project
-- Run against production DB after deploying Prisma schema changes.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "nextStepCache" JSONB;

-- Column added. Backfill will run via API endpoint once deployed.
-- No index needed — this is accessed by primary key only.
