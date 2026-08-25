-- ============================================================================
-- Tender discovery: pros browse open tenders and apply (pull), in addition to
-- the existing push invite-all flow.
--
-- 1) Project gains tenderOpenedAt / tenderClosedAt to define the discoverable
--    window. A project is "open for applications" while tenderOpenedAt is set
--    and tenderClosedAt is null (and it has not been awarded).
-- 2) ProjectProfessional gains source ('invited' | 'discovered') so the client
--    review UI can tag self-nominated applicants.
-- 3) New AppNotification table backs the pro in-app notification feed / bell.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then update
-- apps/api/prisma/schema.prisma and run `pnpm exec prisma generate`.
-- ============================================================================

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "tenderOpenedAt" TIMESTAMP(3);

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "tenderClosedAt" TIMESTAMP(3);

ALTER TABLE "ProjectProfessional"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'invited';

CREATE TABLE IF NOT EXISTS "AppNotification" (
  "id"             TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "type"           TEXT NOT NULL DEFAULT 'info',
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "url"            TEXT,
  "readAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppNotification_professionalId_readAt_idx"
  ON "AppNotification"("professionalId", "readAt");

CREATE INDEX IF NOT EXISTS "AppNotification_createdAt_idx"
  ON "AppNotification"("createdAt" DESC);

ALTER TABLE "AppNotification"
  DROP CONSTRAINT IF EXISTS "AppNotification_professionalId_fkey";

ALTER TABLE "AppNotification"
  ADD CONSTRAINT "AppNotification_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mark currently-open tenders as discoverable so existing live
-- tenders appear in the new Find Work tab without re-opening them.
UPDATE "Project"
SET "tenderOpenedAt" = COALESCE("tenderOpenedAt", "updatedAt")
WHERE "currentStage" = 'BIDDING_ACTIVE'
  AND "onlySelectedProfessionalsCanBid" = false
  AND "awardedProjectProfessionalId" IS NULL
  AND "tenderOpenedAt" IS NULL;
