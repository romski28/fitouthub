-- C.1 foundation: link financial milestones to project milestones,
-- support parallel financial/non-financial project milestone sequencing,
-- and add optional retention fields.

ALTER TABLE "ProjectPaymentPlan"
ADD COLUMN IF NOT EXISTS "retentionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "retentionPercent" DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS "retentionAmount" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "retentionReleaseAt" TIMESTAMP(3);

ALTER TABLE "PaymentMilestone"
ADD COLUMN IF NOT EXISTS "projectMilestoneId" TEXT;

CREATE INDEX IF NOT EXISTS "PaymentMilestone_projectMilestoneId_idx"
  ON "PaymentMilestone"("projectMilestoneId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PaymentMilestone_projectMilestoneId_fkey'
      AND table_name = 'PaymentMilestone'
  ) THEN
    ALTER TABLE "PaymentMilestone"
    ADD CONSTRAINT "PaymentMilestone_projectMilestoneId_fkey"
    FOREIGN KEY ("projectMilestoneId") REFERENCES "ProjectMilestone"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ProjectMilestone"
ADD COLUMN IF NOT EXISTS "isFinancial" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProjectMilestone_projectId_sequence_key'
  ) THEN
    ALTER TABLE "ProjectMilestone"
    DROP CONSTRAINT "ProjectMilestone_projectId_sequence_key";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMilestone_projectId_isFinancial_sequence_key"
  ON "ProjectMilestone"("projectId", "isFinancial", "sequence");

-- Default retention policy setup for existing Scale 3 plans (optional but preconfigured)
UPDATE "ProjectPaymentPlan"
SET
  "retentionPercent" = COALESCE("retentionPercent", 5.00)
WHERE "projectScale" = 'SCALE_3'::"ProjectScale";
