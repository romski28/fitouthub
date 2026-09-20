-- ============================================================================
-- Retention & Closeout: professional retention opt-in, project reviews, and
-- closeout records.
--
-- 1) Professional.retentionOptIn — optional 10%/3-month warranty retention.
--    Snapshot at award time (pros opt out by default).
-- 2) ProjectReview — client/pro/pm review + rating captured at close.
-- 3) ProjectCloseout — per-project close procedure state (reviews + photos).
--
-- Idempotent. Rollback:
--   ALTER TABLE "Professional" DROP COLUMN IF EXISTS "retentionOptIn";
--   ALTER TABLE "Professional" DROP COLUMN IF EXISTS "retentionOptInAt";
--   ALTER TABLE "Professional" DROP COLUMN IF EXISTS "retentionTermsVersion";
--   DROP TABLE IF EXISTS "ProjectReview";
--   DROP TABLE IF EXISTS "ProjectCloseout";
-- ============================================================================

ALTER TABLE "Professional"
  ADD COLUMN IF NOT EXISTS "retentionOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Professional"
  ADD COLUMN IF NOT EXISTS "retentionOptInAt" TIMESTAMP(3);
ALTER TABLE "Professional"
  ADD COLUMN IF NOT EXISTS "retentionTermsVersion" TEXT;

-- ----------------------------------------------------------------------------
-- ProjectReview: a rating + comment left by a party at project close.
-- reviewerType: 'client' | 'professional' | 'pm'
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProjectReview" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "reviewerType" TEXT NOT NULL,
  "reviewerId"   TEXT,
  "rating"       INTEGER NOT NULL,
  "comment"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectReview_projectId_idx" ON "ProjectReview"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectReview_reviewerType_idx" ON "ProjectReview"("reviewerType");

-- ----------------------------------------------------------------------------
-- ProjectCloseout: per-project close procedure state.
-- status: 'pending' | 'in_review' | 'held' | 'closed'
-- photos are storage keys; 'held' = a party is questioning an image (future).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProjectCloseout" (
  "id"               TEXT NOT NULL,
  "projectId"        TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "clientReviewedAt" TIMESTAMP(3),
  "proReviewedAt"    TIMESTAMP(3),
  "clientPhotos"     JSONB,
  "proPhotos"        JSONB,
  "pmPhotos"         JSONB,
  "closedAt"         TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectCloseout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectCloseout_projectId_key" ON "ProjectCloseout"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectCloseout_status_idx" ON "ProjectCloseout"("status");
