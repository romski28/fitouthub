-- ============================================================================
-- ProjectWorkerAccess: worker project access grants + 48h magic-link access.
-- Registered worker grants: ongoing until revoked (expiresAt NULL).
-- Magic-link (new email) grants: 48-hour window, re-usable within it.
-- Idempotent. Apply after MANUAL_SQL_ADD_WORKER_INVITE.sql.
-- Rollback: DROP TABLE "ProjectWorkerAccess"; ALTER TABLE "EmailToken" DROP COLUMN "email";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ProjectWorkerAccess" (
  "id"                      TEXT NOT NULL,
  "projectId"               TEXT NOT NULL,
  "workerId"                TEXT,
  "email"                   TEXT,
  "grantedByProfessionalId" TEXT NOT NULL,
  "expiresAt"               TIMESTAMP(3),
  "revokedAt"               TIMESTAMP(3),
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectWorkerAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectWorkerAccess_projectId_idx" ON "ProjectWorkerAccess"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectWorkerAccess_workerId_idx" ON "ProjectWorkerAccess"("workerId");
CREATE INDEX IF NOT EXISTS "ProjectWorkerAccess_email_idx" ON "ProjectWorkerAccess"("email");

ALTER TABLE "ProjectWorkerAccess"
  DROP CONSTRAINT IF EXISTS "ProjectWorkerAccess_projectId_fkey";
ALTER TABLE "ProjectWorkerAccess"
  ADD CONSTRAINT "ProjectWorkerAccess_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectWorkerAccess"
  DROP CONSTRAINT IF EXISTS "ProjectWorkerAccess_workerId_fkey";
ALTER TABLE "ProjectWorkerAccess"
  ADD CONSTRAINT "ProjectWorkerAccess_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectWorkerAccess"
  DROP CONSTRAINT IF EXISTS "ProjectWorkerAccess_grantedByProfessionalId_fkey";
ALTER TABLE "ProjectWorkerAccess"
  ADD CONSTRAINT "ProjectWorkerAccess_grantedByProfessionalId_fkey"
  FOREIGN KEY ("grantedByProfessionalId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- EmailToken gains an email column for magic links sent to a new address.
ALTER TABLE "EmailToken"
  ADD COLUMN IF NOT EXISTS "email" TEXT;
