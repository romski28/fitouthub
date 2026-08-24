-- ============================================================================
-- Worker project access: task-scoped magic links.
-- Adds `task` (e.g. 'site_inspection') and `consumedAt` (burned once the task
-- is complete) to ProjectWorkerAccess so a 48h magic link can be scoped to a
-- single task and burnt on completion.
-- Idempotent. Apply after MANUAL_SQL_FIX_WORKER_AS_PROFESSIONAL.sql.
-- ============================================================================

ALTER TABLE "ProjectWorkerAccess"
  ADD COLUMN IF NOT EXISTS "task" TEXT;

ALTER TABLE "ProjectWorkerAccess"
  ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ProjectWorkerAccess_task_idx"
  ON "ProjectWorkerAccess"("task");
