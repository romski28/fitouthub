-- ============================================================================
-- Fix: workers are PROFESSIONALS (professionType 'worker', employed by a pro),
-- not client-side Users. Tenants etc. use ProjectDelegate instead.
-- Re-points worker FKs from the removed Worker table to Professional.
-- Idempotent. Apply after MANUAL_SQL_ADD_PROJECT_WORKER_ACCESS.sql.
-- ============================================================================

-- Professional self-relation: worker -> employer
ALTER TABLE "Professional"
  ADD COLUMN IF NOT EXISTS "employerProfessionalId" TEXT;

ALTER TABLE "Professional"
  DROP CONSTRAINT IF EXISTS "Professional_employerProfessionalId_fkey";
ALTER TABLE "Professional"
  ADD CONSTRAINT "Professional_employerProfessionalId_fkey"
  FOREIGN KEY ("employerProfessionalId") REFERENCES "Professional"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Professional_employerProfessionalId_idx"
  ON "Professional"("employerProfessionalId");

-- WorkerInvite.workerId now references Professional (the worker pro)
ALTER TABLE "WorkerInvite"
  DROP CONSTRAINT IF EXISTS "WorkerInvite_workerId_fkey";
ALTER TABLE "WorkerInvite"
  ADD CONSTRAINT "WorkerInvite_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Professional"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ProjectWorkerAccess.workerId now references Professional (the worker pro)
ALTER TABLE "ProjectWorkerAccess"
  DROP CONSTRAINT IF EXISTS "ProjectWorkerAccess_workerId_fkey";
ALTER TABLE "ProjectWorkerAccess"
  ADD CONSTRAINT "ProjectWorkerAccess_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove the now-unused client-side Worker table and Persona link
ALTER TABLE "Persona"
  DROP CONSTRAINT IF EXISTS "Persona_workerId_fkey";
ALTER TABLE "Persona"
  DROP COLUMN IF EXISTS "workerId";

DROP TABLE IF EXISTS "Worker";
