-- ============================================================================
-- Backfill: re-run PM scope regeneration for projects whose Q&A answers were
-- consumed before the summary-persistence fix landed.
--
-- Background: `generateProjectScope` previously wrote the structured scope to
-- aiIntake.project.aiScope but NEVER updated aiIntake.summary, so "Redefine
-- scope" produced no visible change. Projects that ran Q&A + Redefine scope
-- before the fix have their answers already marked `consumedAt` (so a future
-- "Redefine scope" will skip them) and a stale/missing aiIntake.summary.
--
-- This script resets `consumedAt` to NULL for answered scope Q&A so the PM's
-- "Redefine scope" action re-collects them as additional context and
-- regenerates (and now persists) the summary.
--
-- Idempotent: re-running only re-clears rows that are answered-and-consumed.
-- Apply in Supabase SQL Editor (dev -> prod). Then open the project in the PM
-- portal and click "✨ Redefine scope" once.
--
-- To limit to a single project, uncomment the projectId line and set the id.
-- ============================================================================

UPDATE "ProjectScopeQna"
SET "consumedAt" = NULL,
    "updatedAt" = now()
WHERE answer IS NOT NULL
  AND "consumedAt" IS NOT NULL;
  -- AND "projectId" = '<PROJECT_ID>';
