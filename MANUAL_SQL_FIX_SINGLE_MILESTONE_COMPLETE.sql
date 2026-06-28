-- Fix: set COMPLETE stage for single-milestone projects that have a confirmed release_payment.
-- These projects are fully paid but stuck on PRE_WORK/WORK_IN_PROGRESS because the
-- stage transition in releaseClass1Payment was broken by a missing NestJS DI provider.

UPDATE "Project"
SET "currentStage" = 'COMPLETE',
    "stageStartedAt" = NOW(),
    "lastStageTransitionAt" = NOW(),
    "nextStepCache" = NULL    -- force recompute on next read
WHERE id IN (
  SELECT p.id
  FROM "Project" p
  INNER JOIN "ProjectPaymentPlan" pp ON pp."projectId" = p.id
  WHERE p."currentStage" NOT IN ('COMPLETE', 'NEAR_COMPLETION', 'CLOSED', 'WARRANTY_PERIOD')
    AND (SELECT COUNT(*) FROM "PaymentMilestone" pm WHERE pm."paymentPlanId" = pp.id) <= 1
    AND EXISTS (
      SELECT 1 FROM "FinancialTransaction" ft
      WHERE ft."projectId" = p.id
        AND ft.type = 'release_payment'
        AND ft.status = 'confirmed'
    )
);
