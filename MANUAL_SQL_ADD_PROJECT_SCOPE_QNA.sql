-- ============================================================================
-- Project scope Q&A — structured question/answer captured by the PM's
-- "Ask for more info" quick action and fed into AI scope (re)generation.
--
-- consumedAt = null means the answer is pending consumption by the AI scope
-- generation; set once "Redefine scope" has used it as additional context.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod), then run
-- `pnpm exec prisma generate`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ProjectScopeQna" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  "consumedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProjectScopeQna_projectId_idx" ON "ProjectScopeQna" ("projectId");
