-- ============================================================================
-- MANUAL SQL: Step 6b — Add personaId to professional-only tables
-- (Tables that have ONLY professionalId, no userId)
-- Forward: adds personaId column + backfills for all 13 tables
-- Reverse: MANUAL_SQL_REVERSE_FK_MIGRATION_STEP6B.sql
-- ============================================================================

-- ProfessionalAvailability
ALTER TABLE "ProfessionalAvailability" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProfessionalAvailability" pa SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = pa."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE pa."personaId" IS NULL AND pa."professionalId" IS NOT NULL;

-- ProfessionalRegionCoverage
ALTER TABLE "ProfessionalRegionCoverage" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProfessionalRegionCoverage" prc SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = prc."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE prc."personaId" IS NULL AND prc."professionalId" IS NOT NULL;

-- ProjectProfessional (0 rows with purged projects)
ALTER TABLE "ProjectProfessional" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProjectProfessional" pp SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = pp."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE pp."personaId" IS NULL AND pp."professionalId" IS NOT NULL;

-- SiteAccessRequest
ALTER TABLE "SiteAccessRequest" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "SiteAccessRequest" sar SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = sar."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE sar."personaId" IS NULL AND sar."professionalId" IS NOT NULL;

-- SiteAccessVisit
ALTER TABLE "SiteAccessVisit" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "SiteAccessVisit" sav SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = sav."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE sav."personaId" IS NULL AND sav."professionalId" IS NOT NULL;

-- ProjectStartProposal
ALTER TABLE "ProjectStartProposal" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProjectStartProposal" psp SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = psp."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE psp."personaId" IS NULL AND psp."professionalId" IS NOT NULL;

-- ProfessionalReferenceProject
ALTER TABLE "ProfessionalReferenceProject" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProfessionalReferenceProject" prp SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = prp."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE prp."personaId" IS NULL AND prp."professionalId" IS NOT NULL;

-- ProfessionalCertification
ALTER TABLE "ProfessionalCertification" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProfessionalCertification" pc SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = pc."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE pc."personaId" IS NULL AND pc."professionalId" IS NOT NULL;

-- ProfessionalMedia
ALTER TABLE "ProfessionalMedia" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProfessionalMedia" pm SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = pm."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE pm."personaId" IS NULL AND pm."professionalId" IS NOT NULL;

-- ProfessionalReport
ALTER TABLE "ProfessionalReport" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "ProfessionalReport" pr SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = pr."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE pr."personaId" IS NULL AND pr."professionalId" IS NOT NULL;

-- EmailToken
ALTER TABLE "EmailToken" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "EmailToken" et SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = et."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE et."personaId" IS NULL AND et."professionalId" IS NOT NULL;

-- QuestionnaireInvite
ALTER TABLE "QuestionnaireInvite" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "QuestionnaireInvite" qi SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = qi."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE qi."personaId" IS NULL AND qi."professionalId" IS NOT NULL;

-- Case
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
UPDATE "Case" c SET "personaId" = (
  SELECT p."personaId" FROM "Professional" p WHERE p."id" = c."professionalId" AND p."personaId" IS NOT NULL LIMIT 1
) WHERE c."personaId" IS NULL AND c."professionalId" IS NOT NULL;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- SELECT 'ProfAvailability' AS tbl, count(*) AS with_persona FROM "ProfessionalAvailability" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'RegionCoverage', count(*) FROM "ProfessionalRegionCoverage" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'ProjectPro', count(*) FROM "ProjectProfessional" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'SiteReq', count(*) FROM "SiteAccessRequest" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'SiteVisit', count(*) FROM "SiteAccessVisit" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'StartProposal', count(*) FROM "ProjectStartProposal" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'RefProject', count(*) FROM "ProfessionalReferenceProject" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'Certification', count(*) FROM "ProfessionalCertification" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'Media', count(*) FROM "ProfessionalMedia" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'Report', count(*) FROM "ProfessionalReport" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'EmailToken', count(*) FROM "EmailToken" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'QuestInvite', count(*) FROM "QuestionnaireInvite" WHERE "personaId" IS NOT NULL UNION ALL
-- SELECT 'Case', count(*) FROM "Case" WHERE "personaId" IS NOT NULL;
