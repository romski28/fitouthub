-- Manual data repair: relink PaymentMilestone -> ProjectMilestone by sequence
-- Use when Plan-aligned Payment Milestones shows orphan rows after reset.
--
-- How to run:
-- 1) Replace the two values in the params CTE below:
--    - '__PROJECT_ID__'
--    - '__PROJECT_PROFESSIONAL_ID__'
-- 2) Execute inside a transaction.
--
-- Notes:
-- - This script does NOT change schema.
-- - It only updates rows in "PaymentMilestone" for the selected project.
-- - It prefers financial schedule milestones belonging to the selected professional assignment.

BEGIN;

-- Set your target IDs here before running:
-- Example UUID format: 'cmngvpsxc0004fa2dt3kjpfc8'
WITH params AS (
  SELECT
    '__PROJECT_ID__'::text AS project_id,
    '__PROJECT_PROFESSIONAL_ID__'::text AS project_professional_id
)
SELECT 1;

-- Optional: inspect current orphaned rows before update
WITH params AS (
  SELECT
    '__PROJECT_ID__'::text AS project_id,
    '__PROJECT_PROFESSIONAL_ID__'::text AS project_professional_id
)
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
WHERE pp."projectId" = (SELECT project_id FROM params)
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
WITH params AS (
  SELECT
    '__PROJECT_ID__'::text AS project_id,
    '__PROJECT_PROFESSIONAL_ID__'::text AS project_professional_id
),
financial_schedule AS (
  SELECT
    m.id,
  WHERE "projectId" = (SELECT project_id FROM params)
    m."plannedStartDate",
    m."plannedEndDate",
    ROW_NUMBER() OVER (
      PARTITION BY m.sequence
      ORDER BY CASE WHEN m."projectProfessionalId" = (SELECT project_professional_id FROM params) THEN 0 ELSE 1 END, m."updatedAt" DESC
    ) AS rn
  FROM "ProjectMilestone" m
  WHERE m."projectId" = (SELECT project_id FROM params)
    AND m."isFinancial" = TRUE
    AND (m."projectProfessionalId" = (SELECT project_professional_id FROM params) OR m."projectProfessionalId" IS NULL)
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
WITH params AS (
  SELECT
    '__PROJECT_ID__'::text AS project_id,
    '__PROJECT_PROFESSIONAL_ID__'::text AS project_professional_id
)
SELECT
  pm.id,
  pm.sequence,
  pm.title,
  pm.status,
  pm."projectMilestoneId"
FROM "PaymentMilestone" pm
JOIN "ProjectPaymentPlan" pp ON pp.id = pm."paymentPlanId"
WHERE pp."projectId" = (SELECT project_id FROM params)
ORDER BY pm.sequence;

COMMIT;
