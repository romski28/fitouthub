-- ============================================================================
-- WorkerInvite: employment invites sent by a company/reseller/contractor pro.
-- Single-use (burn on accept), 7-day expiry.
-- Idempotent. Apply after MANUAL_SQL_ADD_WORKER_AND_ADDRESS_PRIMARY.sql.
-- Rollback: DROP TABLE "WorkerInvite";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "WorkerInvite" (
  "id"                     TEXT NOT NULL,
  "token"                  TEXT NOT NULL,
  "email"                  TEXT NOT NULL,
  "employerProfessionalId" TEXT NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'pending',
  "expiresAt"              TIMESTAMP(3) NOT NULL,
  "acceptedAt"             TIMESTAMP(3),
  "workerId"               TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkerInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkerInvite_token_key" ON "WorkerInvite"("token");
CREATE INDEX IF NOT EXISTS "WorkerInvite_employerProfessionalId_idx" ON "WorkerInvite"("employerProfessionalId");
CREATE INDEX IF NOT EXISTS "WorkerInvite_status_idx" ON "WorkerInvite"("status");

ALTER TABLE "WorkerInvite"
  DROP CONSTRAINT IF EXISTS "WorkerInvite_employerProfessionalId_fkey";
ALTER TABLE "WorkerInvite"
  ADD CONSTRAINT "WorkerInvite_employerProfessionalId_fkey"
  FOREIGN KEY ("employerProfessionalId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerInvite"
  DROP CONSTRAINT IF EXISTS "WorkerInvite_workerId_fkey";
ALTER TABLE "WorkerInvite"
  ADD CONSTRAINT "WorkerInvite_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
