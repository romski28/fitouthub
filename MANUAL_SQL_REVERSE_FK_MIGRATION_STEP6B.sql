-- ============================================================================
-- REVERSE: Step 6b — Drop personaId from professional-only tables
-- ============================================================================

ALTER TABLE "Case" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "QuestionnaireInvite" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "EmailToken" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProfessionalReport" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProfessionalMedia" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProfessionalCertification" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProfessionalReferenceProject" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProjectStartProposal" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "SiteAccessVisit" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "SiteAccessRequest" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProjectProfessional" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProfessionalRegionCoverage" DROP COLUMN IF EXISTS "personaId";
ALTER TABLE "ProfessionalAvailability" DROP COLUMN IF EXISTS "personaId";
