-- ============================================================
-- AI Conversation Log — stores every wizard turn on-the-fly
-- for LLM training dataset (HK construction scenarios + safety)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_conversation_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId"       UUID NOT NULL,
  turn              INT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('user','assistant')),
  "projectId"       UUID REFERENCES "Project"(id) ON DELETE SET NULL,
  "aiIntakeId"      TEXT REFERENCES ai_intakes(id) ON DELETE SET NULL,
  prompt            TEXT,
  "userResponse"    TEXT,
  "structuredJson"  JSONB,
  "safetyJson"      JSONB,
  "metadata"        JSONB,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_logs_session
  ON ai_conversation_logs("sessionId");

CREATE INDEX IF NOT EXISTS idx_ai_conv_logs_project
  ON ai_conversation_logs("projectId");

CREATE INDEX IF NOT EXISTS idx_ai_conv_logs_created
  ON ai_conversation_logs("createdAt");

-- Optional: cleanup policy — delete orphaned logs (no project) older than 90 days
-- Uncomment to enable:
-- DELETE FROM ai_conversation_logs
-- WHERE "projectId" IS NULL AND "createdAt" < now() - INTERVAL '90 days';
