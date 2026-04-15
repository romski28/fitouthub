-- Manual data repair: relink PaymentMilestone -> ProjectMilestone by sequence
-- Use when Plan-aligned Payment Milestones shows orphan rows after reset.
--
-- How to run:
-- 1) Replace :project_id and :project_professional_id placeholders.
-- 2) Execute inside a transaction.
--
-- Notes:
-- - This script does NOT change schema.
-- - It only updates rows in "PaymentMilestone" for the selected project.
-- - It prefers financial schedule milestones belonging to the selected professional assignment.

BEGIN;

-- Optional: inspect current orphaned rows before update
SELECT
  pm.id,
  pm.sequence,
  pm.title,
  pm.status,
  pm."projectMilestoneId",
  pp."projectId",
  pp."projectProfessionalId"
FROM "PaymentMilestone" pm
JOIN "ProjectPaymentPlan" pp ON pp.id = pm."paymentPlanId"
WHERE pp."projectId" = :project_id
  AND (
    pm."projectMilestoneId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "ProjectMilestone" xm
      WHERE xm.id = pm."projectMilestoneId"
    )
  )
ORDER BY pm.sequence;

WITH target_plan AS (
  SELECT id
  FROM "ProjectPaymentPlan"
  WHERE "projectId" = :project_id
  LIMIT 1
),
financial_schedule AS (
  SELECT
    m.id,
    m.sequence,
    m."plannedStartDate",
    m."plannedEndDate",
    ROW_NUMBER() OVER (
      PARTITION BY m.sequence
      ORDER BY CASE WHEN m."projectProfessionalId" = :project_professional_id THEN 0 ELSE 1 END, m."updatedAt" DESC
    ) AS rn
  FROM "ProjectMilestone" m
  WHERE m."projectId" = :project_id
    AND m."isFinancial" = TRUE
    AND (m."projectProfessionalId" = :project_professional_id OR m."projectProfessionalId" IS NULL)
),
best_financial_schedule AS (
  SELECT *
  FROM financial_schedule
  WHERE rn = 1
)
UPDATE "PaymentMilestone" pm
SET
  "projectMilestoneId" = bfs.id,
  "plannedDueAt" = COALESCE(bfs."plannedEndDate", bfs."plannedStartDate", pm."plannedDueAt")
FROM target_plan tp
JOIN best_financial_schedule bfs ON bfs.sequence = pm.sequence
WHERE pm."paymentPlanId" = tp.id
  AND (
    pm."projectMilestoneId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "ProjectMilestone" xm
      WHERE xm.id = pm."projectMilestoneId"
    )
  );

-- Optional: verify after update
SELECT
  pm.id,
  pm.sequence,
  pm.title,
  pm.status,
  pm."projectMilestoneId"
FROM "PaymentMilestone" pm
JOIN "ProjectPaymentPlan" pp ON pp.id = pm."paymentPlanId"
WHERE pp."projectId" = :project_id
ORDER BY pm.sequence;

COMMIT;
