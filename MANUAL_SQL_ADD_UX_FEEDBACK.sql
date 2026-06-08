-- ============================================================
-- UX Feedback — post-project-creation survey
-- ============================================================
CREATE TABLE IF NOT EXISTS ux_feedback (
    id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    project_id  TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
    user_id     TEXT REFERENCES "User"(id),
    answers     JSONB NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ux_feedback_project ON ux_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_ux_feedback_user ON ux_feedback(user_id);
