DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectScale') THEN
    CREATE TYPE "ProjectScale" AS ENUM ('SCALE_1', 'SCALE_2', 'SCALE_3');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EscrowFundingPolicy') THEN
    CREATE TYPE "EscrowFundingPolicy" AS ENUM ('FULL_UPFRONT', 'ROLLING_TWO_MILESTONES');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentPlanStatus') THEN
    CREATE TYPE "PaymentPlanStatus" AS ENUM ('draft', 'client_review', 'admin_review', 'locked', 'active', 'completed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMilestoneType') THEN
    CREATE TYPE "PaymentMilestoneType" AS ENUM ('deposit', 'progress', 'final');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMilestoneStatus') THEN
    CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('scheduled', 'escrow_requested', 'escrow_funded', 'release_requested', 'released', 'disputed', 'cancelled');
  END IF;
END $$;

ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "projectScale" "ProjectScale",
ADD COLUMN IF NOT EXISTS "escrowFundingPolicy" "EscrowFundingPolicy",
ADD COLUMN IF NOT EXISTS "paymentPlanLockedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProjectPaymentPlan" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectProfessionalId" TEXT,
  "projectScale" "ProjectScale" NOT NULL,
  "escrowFundingPolicy" "EscrowFundingPolicy" NOT NULL,
  "status" "PaymentPlanStatus" NOT NULL DEFAULT 'draft',
  "currency" TEXT NOT NULL DEFAULT 'HKD',
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "depositCapPercent" INTEGER,
  "fundingBufferMilestones" INTEGER,
  "clientComment" TEXT,
  "adminComment" TEXT,
  "adminOverrideApplied" BOOLEAN NOT NULL DEFAULT false,
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectPaymentPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPaymentPlan_projectId_key" ON "ProjectPaymentPlan"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectPaymentPlan_projectProfessionalId_idx" ON "ProjectPaymentPlan"("projectProfessionalId");
CREATE INDEX IF NOT EXISTS "ProjectPaymentPlan_status_idx" ON "ProjectPaymentPlan"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ProjectPaymentPlan_projectId_fkey'
      AND table_name = 'ProjectPaymentPlan'
  ) THEN
    ALTER TABLE "ProjectPaymentPlan"
    ADD CONSTRAINT "ProjectPaymentPlan_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ProjectPaymentPlan_projectProfessionalId_fkey'
      AND table_name = 'ProjectPaymentPlan'
  ) THEN
    ALTER TABLE "ProjectPaymentPlan"
    ADD CONSTRAINT "ProjectPaymentPlan_projectProfessionalId_fkey"
    FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentMilestone" (
  "id" TEXT NOT NULL,
  "paymentPlanId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "type" "PaymentMilestoneType" NOT NULL,
  "status" "PaymentMilestoneStatus" NOT NULL DEFAULT 'scheduled',
  "percentOfTotal" DOUBLE PRECISION,
  "amount" DECIMAL(12,2) NOT NULL,
  "plannedDueAt" TIMESTAMP(3),
  "escrowRequestedAt" TIMESTAMP(3),
  "escrowFundedAt" TIMESTAMP(3),
  "releaseRequestedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "clientComment" TEXT,
  "adminComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMilestone_paymentPlanId_sequence_key" ON "PaymentMilestone"("paymentPlanId", "sequence");
CREATE INDEX IF NOT EXISTS "PaymentMilestone_paymentPlanId_idx" ON "PaymentMilestone"("paymentPlanId");
CREATE INDEX IF NOT EXISTS "PaymentMilestone_status_idx" ON "PaymentMilestone"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PaymentMilestone_paymentPlanId_fkey'
      AND table_name = 'PaymentMilestone'
  ) THEN
    ALTER TABLE "PaymentMilestone"
    ADD CONSTRAINT "PaymentMilestone_paymentPlanId_fkey"
    FOREIGN KEY ("paymentPlanId") REFERENCES "ProjectPaymentPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: classify all existing projects as Scale 1 (MVP default)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "Project"
SET
  "projectScale"        = 'SCALE_1'::"ProjectScale",
  "escrowFundingPolicy" = 'FULL_UPFRONT'::"EscrowFundingPolicy"
WHERE "projectScale" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: create payment plans + Scale 1 milestones for awarded projects
-- that already have an approvedBudget but no plan yet.
-- Milestone split: 30% deposit / 70% final (Scale 1 rule).
-- The CTE RETURNING clause supplies plan IDs directly to the milestone insert.
-- ─────────────────────────────────────────────────────────────────────────────
WITH inserted_plans AS (
  INSERT INTO "ProjectPaymentPlan" (
    "id",
    "projectId",
    "projectProfessionalId",
    "projectScale",
    "escrowFundingPolicy",
    "status",
    "currency",
    "totalAmount",
    "depositCapPercent",
    "fundingBufferMilestones",
    "adminOverrideApplied",
    "lockedAt",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'bp_' || replace(gen_random_uuid()::text, '-', ''),
    p."id",
    p."awardedProjectProfessionalId",
    'SCALE_1'::"ProjectScale",
    'FULL_UPFRONT'::"EscrowFundingPolicy",
    'active'::"PaymentPlanStatus",
    'HKD',
    p."approvedBudget",
    30,
    NULL,
    false,
    NOW(),
    NOW(),
    NOW()
  FROM "Project" p
  WHERE p."approvedBudget" IS NOT NULL
    AND p."approvedBudget" > 0
    AND p."awardedProjectProfessionalId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "ProjectPaymentPlan" WHERE "projectId" = p."id"
    )
  RETURNING "id", "totalAmount"
)
INSERT INTO "PaymentMilestone" (
  "id",
  "paymentPlanId",
  "sequence",
  "title",
  "type",
  "status",
  "percentOfTotal",
  "amount",
  "createdAt",
  "updatedAt"
)
SELECT
  'bm_' || replace(gen_random_uuid()::text, '-', ''),
  ip."id",
  ms.seq,
  ms.title,
  ms.mtype::"PaymentMilestoneType",
  'scheduled'::"PaymentMilestoneStatus",
  ms.pct,
  CASE
    WHEN ms.seq = 1 THEN ROUND(ip."totalAmount" * 0.30, 2)
    ELSE ip."totalAmount" - ROUND(ip."totalAmount" * 0.30, 2)
  END,
  NOW(),
  NOW()
FROM inserted_plans ip
CROSS JOIN (VALUES
  (1, 'Deposit (30%)',       'deposit', 30.0),
  (2, 'Final Payment (70%)', 'final',   70.0)
) AS ms(seq, title, mtype, pct);
