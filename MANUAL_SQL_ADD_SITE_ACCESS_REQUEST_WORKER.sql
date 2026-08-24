-- ============================================================================
-- Worker site-inspection booking attribution.
-- Adds `requestedByWorkerId` to SiteAccessRequest so a granted worker can book
-- a site inspection slot on behalf of the awarded professional, while the
-- request itself stays owned by the professional (projectProfessionalId).
-- Idempotent. Apply after MANUAL_SQL_ADD_WORKER_ACCESS_TASK.sql.
-- ============================================================================

ALTER TABLE "SiteAccessRequest"
  ADD COLUMN IF NOT EXISTS "requestedByWorkerId" TEXT;

CREATE INDEX IF NOT EXISTS "SiteAccessRequest_requestedByWorkerId_idx"
  ON "SiteAccessRequest"("requestedByWorkerId");
