-- Add post-award site access decline tracking to milestone tasks
ALTER TABLE "ProjectMilestone"
  ADD COLUMN IF NOT EXISTS "accessDeclined" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "accessDeclinedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "accessDeclinedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accessDeclinedByClientId" TEXT;

-- Optional index for quickly listing flagged milestones
CREATE INDEX IF NOT EXISTS "ProjectMilestone_accessDeclined_idx"
  ON "ProjectMilestone"("accessDeclined");
