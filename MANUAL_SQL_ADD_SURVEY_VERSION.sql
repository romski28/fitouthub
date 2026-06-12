-- ============================================================
-- UX Feedback Survey v2 — add survey_version column
-- ============================================================
ALTER TABLE ux_feedback
ADD COLUMN IF NOT EXISTS survey_version TEXT;
