-- Survey Workspace + Photo Markup storage (isolated from existing flows)
-- Safe additive migration. No reseed required.

BEGIN;

CREATE TABLE IF NOT EXISTS mimo_survey_workspace_reports (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "surveyExtraId" TEXT NOT NULL REFERENCES mimo_project_extras(id) ON DELETE CASCADE,
  "createdByUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'submitted_for_client_approval',
      'approved',
      'revision_requested',
      'shared_to_professionals'
    )),
  title TEXT,
  summary TEXT,
  "accessNotes" TEXT,
  recommendations TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  "submittedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  "approvedByUserId" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mimo_survey_workspace_project_extra
  ON mimo_survey_workspace_reports ("projectId", "surveyExtraId");

CREATE INDEX IF NOT EXISTS idx_mimo_survey_workspace_status
  ON mimo_survey_workspace_reports (status, "updatedAt" DESC);

CREATE OR REPLACE FUNCTION set_mimo_survey_workspace_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mimo_survey_workspace_updated_at ON mimo_survey_workspace_reports;
CREATE TRIGGER trg_mimo_survey_workspace_updated_at
  BEFORE UPDATE ON mimo_survey_workspace_reports
  FOR EACH ROW EXECUTE FUNCTION set_mimo_survey_workspace_updated_at();

COMMIT;
