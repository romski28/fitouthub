-- ============================================================================
-- Survey type — add a constrained survey_type discriminator to ux_feedback.
-- Replaces the fragile survey_version free-text column for routing purposes.
--   'nps'      = post-project survey (PostProjectSurveyModal)
--   'feedback' = client/pro feedback survey (UxFeedbackModal / ProFeedbackModal)
-- ============================================================================

ALTER TABLE "ux_feedback"
ADD COLUMN IF NOT EXISTS "survey_type" TEXT;

-- Backfill by answer shape (the same keys the admin page used to classify by).
UPDATE "ux_feedback"
SET "survey_type" = CASE
  WHEN ("answers" ? 'projectGoodTags')
    OR ("answers" ? 'projectBadTags')
    OR ("answers" ? 'platformGoodTags')
    OR ("answers" ? 'platformBadTags')
    OR ("answers" ? 'mimo_understanding')
    OR ("answers" ? 'pro_selection')
  THEN 'feedback'
  ELSE 'nps'
END;

ALTER TABLE "ux_feedback"
ADD CONSTRAINT "ux_feedback_survey_type_check"
  CHECK ("survey_type" IN ('nps', 'feedback'));
