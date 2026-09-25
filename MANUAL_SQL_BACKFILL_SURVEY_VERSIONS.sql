-- ============================================================================
-- Backfill: tag the single professional feedback response as the new
-- 'feedback-v1' survey, and the remaining (pre-unification) responses as the
-- legacy post-project survey. The trigger is the presence of a professional
-- respondent (respondent_type = 'professional').
-- ============================================================================

UPDATE "ux_feedback"
SET "survey_version" = 'feedback-v1'
WHERE "respondent_type" = 'professional';

UPDATE "ux_feedback"
SET "survey_version" = '2.0'
WHERE "survey_version" IS NULL;
