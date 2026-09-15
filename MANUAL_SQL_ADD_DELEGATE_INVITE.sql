-- ============================================================================
-- DelegateInvite: client-side delegation invites (mirror of WorkerInvite).
-- A client invites a delegate (family/helper) by email; the delegate registers
-- as a 'project_delegate' User and accepts, linking ProjectDelegate.assistedClientId.
-- Single-use (burn on accept), 7-day expiry.
-- Idempotent. Rollback: DROP TABLE "DelegateInvite";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "DelegateInvite" (
  "id"               TEXT NOT NULL,
  "token"            TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "assistedClientId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL DEFAULT 'family',
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "name"             TEXT,
  "phone"            TEXT,
  "notes"            TEXT,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "acceptedAt"       TIMESTAMP(3),
  "delegateUserId"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DelegateInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DelegateInvite_token_key" ON "DelegateInvite"("token");
CREATE INDEX IF NOT EXISTS "DelegateInvite_assistedClientId_idx" ON "DelegateInvite"("assistedClientId");
CREATE INDEX IF NOT EXISTS "DelegateInvite_status_idx" ON "DelegateInvite"("status");

ALTER TABLE "DelegateInvite"
  DROP CONSTRAINT IF EXISTS "DelegateInvite_assistedClientId_fkey";
ALTER TABLE "DelegateInvite"
  ADD CONSTRAINT "DelegateInvite_assistedClientId_fkey"
  FOREIGN KEY ("assistedClientId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DelegateInvite"
  DROP CONSTRAINT IF EXISTS "DelegateInvite_delegateUserId_fkey";
ALTER TABLE "DelegateInvite"
  ADD CONSTRAINT "DelegateInvite_delegateUserId_fkey"
  FOREIGN KEY ("delegateUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
