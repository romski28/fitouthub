-- ============================================================================
-- Tender dismissal: a pro can dismiss an open tender from their "New project
-- feed" so it never reappears. Declining a direct invitation stays on
-- ProjectProfessional (existing decline flow); this table is only for the
-- marketplace (open tender) case where there is no ProjectProfessional row yet.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then update
-- apps/api/prisma/schema.prisma and run `pnpm exec prisma generate`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "TenderDismissal" (
  "id"             TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenderDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenderDismissal_professionalId_projectId_key"
  ON "TenderDismissal"("professionalId", "projectId");

CREATE INDEX IF NOT EXISTS "TenderDismissal_professionalId_idx"
  ON "TenderDismissal"("professionalId");

CREATE INDEX IF NOT EXISTS "TenderDismissal_projectId_idx"
  ON "TenderDismissal"("projectId");

ALTER TABLE "TenderDismissal"
  DROP CONSTRAINT IF EXISTS "TenderDismissal_professionalId_fkey";

ALTER TABLE "TenderDismissal"
  ADD CONSTRAINT "TenderDismissal_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenderDismissal"
  DROP CONSTRAINT IF EXISTS "TenderDismissal_projectId_fkey";

ALTER TABLE "TenderDismissal"
  ADD CONSTRAINT "TenderDismissal_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
