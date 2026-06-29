-- Backfill: transition WORK_IN_PROGRESS projects with pending sign-offs to MILESTONE_PENDING.
-- These projects had sign-offs submitted before the stage-transition fix was deployed.
-- Harmless if no rows match — only fixes projects stuck in the wrong stage.

UPDATE "Project"
SET "currentStage" = 'MILESTONE_PENDING',
    "stageStartedAt" = NOW(),
    "lastStageTransitionAt" = NOW(),
    "nextStepCache" = NULL    -- force recompute on next read
WHERE "currentStage" = 'WORK_IN_PROGRESS'
  AND EXISTS (
    SELECT 1 FROM "ProjectMilestone" pm
    WHERE pm."projectId" = "Project".id
      AND pm."signOffStatus" = 'pending'
  );
