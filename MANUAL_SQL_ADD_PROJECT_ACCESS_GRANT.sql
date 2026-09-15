-- ============================================================================
-- ProjectAccessGrant: project-scoped delegation access (mirror of ProjectWorkerAccess).
-- A client grants a delegate access to a specific project, either as an ongoing
-- grant (delegateUserId) or a task-scoped magic link (email + token + task).
-- actorType/permissions are forward-compatible for landlord / PM / Mimo-PM.
-- Idempotent. Rollback: DROP TABLE "ProjectAccessGrant";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ProjectAccessGrant" (
  "id"                TEXT NOT NULL,
  "token"             TEXT,
  "projectId"         TEXT NOT NULL,
  "delegateUserId"    TEXT,
  "email"             TEXT,
  "grantedByClientId" TEXT NOT NULL,
  "actorType"         TEXT NOT NULL DEFAULT 'delegate',
  "permissions"       JSONB,
  "task"              TEXT,
  "expiresAt"         TIMESTAMP(3),
  "consumedAt"        TIMESTAMP(3),
  "revokedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAccessGrant_token_key" ON "ProjectAccessGrant"("token");
CREATE INDEX IF NOT EXISTS "ProjectAccessGrant_projectId_idx" ON "ProjectAccessGrant"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectAccessGrant_delegateUserId_idx" ON "ProjectAccessGrant"("delegateUserId");
CREATE INDEX IF NOT EXISTS "ProjectAccessGrant_email_idx" ON "ProjectAccessGrant"("email");
CREATE INDEX IF NOT EXISTS "ProjectAccessGrant_task_idx" ON "ProjectAccessGrant"("task");
